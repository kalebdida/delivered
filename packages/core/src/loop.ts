/**
 * Fixed-step simulation (60 Hz) with variable-rate rendering.
 *
 * ```ts
 * const loop = new Loop();
 * loop.onFixed((dt) => physics.step(dt));      // always 1/60 * timeScale
 * loop.onFrame((dt, alpha) => render(alpha));  // once per display frame
 * loop.start();
 * loop.timeScale = 0.2;                         // slow motion for a "hold moment"
 * ```
 */
export type FixedCallback = (dt: number, time: number) => void;
export type FrameCallback = (dt: number, alpha: number, time: number) => void;

export interface LoopOptions {
  /** Simulation rate in Hz (default 60). */
  hz?: number;
  /** Cap on simulated steps per frame, to avoid a spiral of death (default 5). */
  maxSubSteps?: number;
  /** Pause automatically when the tab is hidden (default true). */
  autoPause?: boolean;
}

export class Loop {
  /** Global time scale. 1 is normal, 0.2 is slow motion, 0 freezes simulation. */
  timeScale = 1;
  /** Scaled simulation time in seconds. */
  time = 0;
  /** Unscaled wall time in seconds since start (paused time excluded). */
  realTime = 0;
  /** Smoothed unscaled frame time in ms, for quality adaptation. */
  frameMs = 16.7;
  running = false;

  readonly step: number;
  private readonly maxSubSteps: number;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private fixed = new Set<FixedCallback>();
  private frame = new Set<FrameCallback>();
  private hiddenPause = false;
  private readonly onVisibility = () => {
    if (document.hidden && this.running) {
      this.hiddenPause = true;
      this.stop();
    } else if (!document.hidden && this.hiddenPause) {
      this.hiddenPause = false;
      this.start();
    }
  };

  constructor(opts: LoopOptions = {}) {
    this.step = 1 / (opts.hz ?? 60);
    this.maxSubSteps = opts.maxSubSteps ?? 5;
    if ((opts.autoPause ?? true) && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  onFixed(fn: FixedCallback): () => void {
    this.fixed.add(fn);
    return () => this.fixed.delete(fn);
  }
  onFrame(fn: FrameCallback): () => void {
    this.frame.add(fn);
    return () => this.frame.delete(fn);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const delta = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.advance(delta);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /**
   * Advance by `delta` real seconds. Called by the RAF tick; exposed so tests and the screenshot
   * tool can drive time deterministically.
   */
  advance(delta: number): void {
    this.realTime += delta;
    this.frameMs += (delta * 1000 - this.frameMs) * 0.1;
    const scaled = delta * this.timeScale;
    this.acc += scaled;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSubSteps) {
      this.time += this.step;
      for (const fn of this.fixed) fn(this.step, this.time);
      this.acc -= this.step;
      steps++;
    }
    if (steps === this.maxSubSteps) this.acc = 0;
    const alpha = this.acc / this.step;
    for (const fn of this.frame) fn(scaled, alpha, this.time);
  }

  dispose(): void {
    this.stop();
    this.fixed.clear();
    this.frame.clear();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
