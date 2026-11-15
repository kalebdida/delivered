import { Emitter } from './storage';
import { preferences } from './safety';

export type QualityTier = 'low' | 'medium' | 'high';

/** What a room may spend at each tier. Rooms read these instead of hard-coding numbers. */
export interface QualityBudget {
  maxParticles: number;
  maxInstances: number;
  shadows: boolean;
  shadowMapSize: number;
  /** 0 = grade only, 1 = + bloom, 2 = + depth of field, god rays and distortion. */
  postFx: 0 | 1 | 2;
  raymarchSteps: number;
  /** 'billboard' uses layered soft sprites, 'raymarch' the volumetric march. */
  clouds: 'billboard' | 'raymarch';
  cloudLightSteps: number;
  maxDpr: number;
  /** Max simultaneously simulated rigid bodies. */
  maxBodies: number;
}

export const QUALITY_BUDGETS: Record<QualityTier, QualityBudget> = {
  low: {
    maxParticles: 6_000, maxInstances: 400, shadows: false, shadowMapSize: 0, postFx: 0,
    raymarchSteps: 0, clouds: 'billboard', cloudLightSteps: 0, maxDpr: 1.25, maxBodies: 60,
  },
  medium: {
    maxParticles: 20_000, maxInstances: 1_500, shadows: true, shadowMapSize: 1024, postFx: 1,
    raymarchSteps: 0, clouds: 'billboard', cloudLightSteps: 0, maxDpr: 1.5, maxBodies: 140,
  },
  high: {
    maxParticles: 60_000, maxInstances: 5_000, shadows: true, shadowMapSize: 2048, postFx: 2,
    raymarchSteps: 56, clouds: 'raymarch', cloudLightSteps: 5, maxDpr: 2, maxBodies: 320,
  },
};

/** Pure decision for adaptive DPR, exported for tests. */
export interface DprState {
  dpr: number;
  slowFor: number;
  fastFor: number;
}

/**
 * One step of the adaptive DPR controller. Lowers DPR when frame time stays above 20 ms for
 * 2 s; raises it when there is clear headroom (under 12 ms) for 4 s. Clamped to [1, maxDpr].
 */
export function stepAdaptiveDpr(state: DprState, frameMs: number, dt: number, maxDpr: number): DprState {
  let { dpr, slowFor, fastFor } = state;
  slowFor = frameMs > 20 ? slowFor + dt : 0;
  fastFor = frameMs < 12 ? fastFor + dt : 0;
  if (slowFor >= 2) {
    dpr = Math.max(1, +(dpr - 0.25).toFixed(2));
    slowFor = 0;
  } else if (fastFor >= 4) {
    dpr = Math.min(maxDpr, +(dpr + 0.125).toFixed(3));
    fastFor = 0;
  }
  return { dpr: Math.min(Math.max(dpr, 1), Math.max(1, maxDpr)), slowFor, fastFor };
}

/** Map a detect-gpu tier (0..3) and device hints to our tiers. Exported for tests. */
export function tierFromGpu(gpuTier: number, isMobile: boolean, fps?: number): QualityTier {
  if (gpuTier <= 1) return 'low';
  if (isMobile) return gpuTier >= 3 && (fps ?? 0) >= 50 ? 'medium' : gpuTier >= 3 ? 'medium' : 'low';
  return gpuTier >= 3 ? 'high' : 'medium';
}

export interface QualityOptions {
  /** Force a tier (also settable with `?quality=low|medium|high`). */
  force?: QualityTier;
}

/**
 * Quality manager: detects a tier, exposes the budget, adapts DPR.
 *
 * ```ts
 * const quality = new Quality();
 * await quality.detect();
 * const n = quality.budget.maxParticles;
 * quality.onChange(({ tier }) => rebuild(tier));
 * ```
 */
export class Quality {
  tier: QualityTier = 'medium';
  dpr = 1;
  readonly events = new Emitter<{ tier: QualityTier; dpr: number }>();
  private dprState: DprState = { dpr: 1, slowFor: 0, fastFor: 0 };
  private warmup: { frames: number; elapsed: number; done: boolean } = { frames: 0, elapsed: 0, done: false };
  private forced: QualityTier | null = null;

  constructor(opts: QualityOptions = {}) {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
    const pref = preferences.get().quality;
    this.forced =
      opts.force ?? (isTier(q) ? q : null) ?? (pref !== 'auto' ? pref : null);
    if (this.forced) this.tier = this.forced;
    this.setDpr(Math.min(deviceDpr(), this.budget.maxDpr));
    preferences.onChange((p) => {
      if (p.quality !== 'auto' && p.quality !== this.tier) this.setTier(p.quality, true);
      else if (p.quality === 'auto') this.forced = null;
    });
  }

  get budget(): QualityBudget {
    return QUALITY_BUDGETS[this.tier];
  }

  /** GPU lookup through detect-gpu. Safe to call without WebGL; falls back to 'medium'. */
  async detect(): Promise<QualityTier> {
    if (this.forced) return this.tier;
    try {
      const { getGPUTier } = await import('detect-gpu');
      const gpu = await getGPUTier({ failIfMajorPerformanceCaveat: false });
      const software = /swiftshader|llvmpipe|software/i.test(gpu.gpu ?? '');
      this.setTier(software ? 'low' : tierFromGpu(gpu.tier, !!gpu.isMobile, gpu.fps));
    } catch {
      this.setTier('medium');
    }
    return this.tier;
  }

  setTier(tier: QualityTier, force = false): void {
    if (force) this.forced = tier;
    if (tier === this.tier) return;
    this.tier = tier;
    this.setDpr(Math.min(this.dpr, this.budget.maxDpr));
    this.events.emit('tier', tier);
  }

  onChange(fn: (q: { tier: QualityTier; dpr: number }) => void): () => void {
    const a = this.events.on('tier', (tier) => fn({ tier, dpr: this.dpr }));
    const b = this.events.on('dpr', (dpr) => fn({ tier: this.tier, dpr }));
    return () => (a(), b());
  }

  /**
   * Call once per rendered frame with the unscaled frame time. Runs the 2-second warm-up
   * benchmark (drops a tier if the device cannot hold ~30 fps) and then the adaptive DPR.
   */
  update(frameMs: number, dt: number): void {
    if (!this.warmup.done) {
      this.warmup.frames++;
      this.warmup.elapsed += dt;
      if (this.warmup.elapsed >= 2) {
        this.warmup.done = true;
        const avg = (this.warmup.elapsed * 1000) / this.warmup.frames;
        if (!this.forced && avg > 30 && this.tier !== 'low') {
          this.setTier(this.tier === 'high' ? 'medium' : 'low');
        }
      }
      return;
    }
    const next = stepAdaptiveDpr(this.dprState, frameMs, dt, Math.min(deviceDpr(), this.budget.maxDpr));
    if (next.dpr !== this.dprState.dpr) {
      this.dpr = next.dpr;
      this.events.emit('dpr', this.dpr);
    }
    this.dprState = next;
  }

  private setDpr(dpr: number): void {
    this.dpr = Math.max(1, dpr);
    this.dprState = { dpr: this.dpr, slowFor: 0, fastFor: 0 };
    this.events.emit('dpr', this.dpr);
  }
}

const isTier = (v: unknown): v is QualityTier => v === 'low' || v === 'medium' || v === 'high';
const deviceDpr = () => (typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 2) : 1);
