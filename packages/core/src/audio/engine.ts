import type { Camera, Object3D } from 'three';
import { Vector3 } from 'three';
import { clamp } from '../math/easing';
import { seededRandom } from '../math/random';
import { preferences } from '../safety';

export type Bus = 'music' | 'sfx' | 'ui' | 'ambience';
export type ReverbName = 'smallCell' | 'stoneHall' | 'vastDesert' | 'openSky';
export type Timbre = 'warm' | 'dark' | 'glass' | 'choir' | 'hollow';

/** Handle for any sustained sound. */
export interface SoundHandle {
  /** Set loudness 0..1, ramped over `seconds`. */
  setLevel(level: number, seconds?: number): void;
  /** Fade out over `seconds` and free the nodes. */
  stop(seconds?: number): void;
  /** The output gain node (connect to a spatial panner, analyser, etc). */
  readonly output: GainNode | null;
}
export interface DroneHandle extends SoundHandle {
  setFreq(freq: number, seconds?: number): void;
  /** 0 (dark, closed filter) .. 1 (bright). */
  setBrightness(v: number, seconds?: number): void;
}
export interface WindHandle extends SoundHandle {
  /** 0 (gentle) .. 1 (roaring). */
  setSpeed(v: number, seconds?: number): void;
}
export interface HeartbeatHandle extends SoundHandle {
  setBpm(bpm: number): void;
  /** Skip the next beat (WRETCHED's betrayed inputs). */
  skip(): void;
}
export interface SpatialHandle {
  /** Connect sounds here. */
  readonly input: AudioNode | null;
  setPosition(x: number, y: number, z: number): void;
  /** Follow an object every `audio.updateListener()` call. */
  follow(object: Object3D | null): void;
  dispose(): void;
}

const NULL: DroneHandle & WindHandle & HeartbeatHandle = {
  setLevel() {}, stop() {}, setFreq() {}, setBrightness() {}, setSpeed() {}, setBpm() {}, skip() {}, output: null,
};

interface ReverbSpec {
  seconds: number;
  /** Higher decays faster. */
  decay: number;
  /** Lowpass on the tail in Hz. */
  tone: number;
  preDelay: number;
  /** Early reflection density 0..1. */
  early: number;
}
const REVERBS: Record<ReverbName, ReverbSpec> = {
  /** Tight, close stone: GAIN's cell. */
  smallCell: { seconds: 0.9, decay: 3.2, tone: 3800, preDelay: 0.004, early: 0.9 },
  /** Long, dark, echoing. */
  stoneHall: { seconds: 3.6, decay: 2.2, tone: 3000, preDelay: 0.02, early: 0.5 },
  /** Huge and dry-ish with a far slap: WRETCHED's plain. */
  vastDesert: { seconds: 5.5, decay: 2.8, tone: 2200, preDelay: 0.09, early: 0.15 },
  /** Airy, bright, weightless: UNDERNEATH. */
  openSky: { seconds: 4.2, decay: 2.0, tone: 7000, preDelay: 0.03, early: 0.1 },
};

/**
 * Web Audio engine: master bus with limiter, four mix buses, generated convolution reverbs,
 * and unlock on the first user gesture. All sound in DELIVERED is procedural (see
 * `instruments.ts`); there are no audio files.
 *
 * ```ts
 * const audio = new AudioEngine();        // unlocks itself on the first tap or key
 * audio.setReverb('vastDesert', 0.35);
 * const drone = audio.drone(55, 'dark');
 * audio.pluck(220);
 * audio.duck(0.4, 2);                     // pull music down for 2 s
 * ```
 * Safe everywhere: with no AudioContext (tests, old browsers) every call is a silent no-op.
 */
export class AudioCore {
  readonly ctx: AudioContext | null = null;
  /** True once a user gesture resumed the context. */
  unlocked = false;
  private master: GainNode | null = null;
  private buses = {} as Record<Bus, { gain: GainNode; send: GainNode }>;
  private convolver: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private irCache = new Map<ReverbName, AudioBuffer>();
  private noiseBuf: AudioBuffer | null = null;
  private spatials = new Set<{ panner: PannerNode; target: Object3D | null }>();
  private unlockListeners: (() => void)[] = [];
  private offPrefs: () => void = () => {};
  private readonly _v = new Vector3();
  private readonly _f = new Vector3();

  constructor() {
    const AC: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const c = this.ctx;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    this.master = c.createGain();
    this.master.connect(limiter).connect(c.destination);
    this.convolver = c.createConvolver();
    this.reverbReturn = c.createGain();
    this.reverbReturn.gain.value = 1;
    this.convolver.connect(this.reverbReturn).connect(this.master);
    const levels: Record<Bus, [number, number]> = { music: [0.8, 0.5], ambience: [0.7, 0.35], sfx: [0.9, 0.3], ui: [0.5, 0.08] };
    for (const name of Object.keys(levels) as Bus[]) {
      const gain = c.createGain();
      gain.gain.value = levels[name][0];
      const send = c.createGain();
      send.gain.value = levels[name][1];
      gain.connect(this.master);
      gain.connect(send).connect(this.convolver);
      this.buses[name] = { gain, send };
    }
    this.setReverb('stoneHall');
    this.applyPrefs();
    this.offPrefs = preferences.onChange(() => this.applyPrefs());

    const unlock = () => void this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) {
      window.addEventListener(type, unlock, { once: false, passive: true });
      this.unlockListeners.push(() => window.removeEventListener(type, unlock));
    }
  }

  /** Resume the context. Called automatically on the first gesture; safe to call from a Begin button. */
  async unlock(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx.state === 'running' && !this.unlocked) {
      this.unlocked = true;
      this.unlockListeners.forEach((fn) => fn());
      this.unlockListeners = [];
    }
    return this.unlocked;
  }

  private applyPrefs(): void {
    if (!this.ctx || !this.master) return;
    const p = preferences.get();
    this.master.gain.setTargetAtTime(p.muted ? 0 : p.volume, this.ctx.currentTime, 0.05);
  }

  /** Master volume 0..1 (persisted). */
  get volume(): number {
    return preferences.get().volume;
  }
  set volume(v: number) {
    preferences.set({ volume: clamp(v) });
  }
  /** Mute (persisted). */
  get muted(): boolean {
    return preferences.get().muted;
  }
  set muted(m: boolean) {
    preferences.set({ muted: m });
  }

  /** Current audio time in seconds. */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Where a sound on `bus` should connect. */
  out(bus: Bus = 'sfx'): AudioNode | null {
    return this.buses[bus]?.gain ?? null;
  }

  /** Set a bus level 0..1. */
  setBusLevel(bus: Bus, level: number, seconds = 0.3): void {
    if (!this.ctx) return;
    this.buses[bus].gain.gain.setTargetAtTime(level, this.ctx.currentTime, Math.max(seconds / 3, 0.01));
  }

  /** Choose the room's reverb space and overall wetness (0..1). */
  setReverb(name: ReverbName, wet = 1): void {
    if (!this.ctx || !this.convolver || !this.reverbReturn) return;
    let ir = this.irCache.get(name);
    if (!ir) this.irCache.set(name, (ir = this.makeImpulse(REVERBS[name], name)));
    this.convolver.buffer = ir;
    this.reverbReturn.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.1);
  }
  /** Per-bus reverb send 0..1. */
  setSend(bus: Bus, amount: number): void {
    if (this.ctx) this.buses[bus].send.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.1);
  }

  /** Generate a stereo impulse response: shaped noise tail plus sparse early reflections. */
  private makeImpulse(spec: ReverbSpec, seed: string): AudioBuffer {
    const c = this.ctx!;
    const rate = c.sampleRate;
    const len = Math.floor(rate * spec.seconds);
    const buf = c.createBuffer(2, len, rate);
    const rng = seededRandom(seed);
    const pre = Math.floor(spec.preDelay * rate);
    const lpCoef = Math.exp((-2 * Math.PI * spec.tone) / rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / (len - pre);
        const env = Math.pow(1 - t, spec.decay) * Math.exp(-t * 2.2);
        // The tail gets darker over time, like air and stone absorb highs.
        const coef = Math.min(0.995, lpCoef + t * (1 - lpCoef) * 0.6);
        lp = lp * coef + (rng() * 2 - 1) * (1 - coef);
        d[i] = lp * env * 2.4;
      }
      const taps = Math.floor(6 + spec.early * 18);
      for (let k = 0; k < taps; k++) {
        const at = pre + Math.floor(rng() * rate * 0.08 * (0.3 + spec.seconds / 3));
        if (at < len) d[at] = d[at]! + (rng() * 2 - 1) * spec.early * 0.6 * (1 - k / taps);
      }
    }
    return buf;
  }

  /** A shared 2-second white noise buffer. */
  noise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (!this.noiseBuf) {
      const rate = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, rate * 2, rate);
      const d = this.noiseBuf.getChannelData(0);
      const rng = seededRandom('noise');
      for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    }
    return this.noiseBuf;
  }
  /** A looping noise source, started. */
  noiseSource(playbackRate = 1): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    src.playbackRate.value = playbackRate;
    src.start(0, Math.random() * 1.5);
    return src;
  }

  /**
   * Duck the music and ambience buses to `amount` (0..1) and bring them back after `seconds`.
   * Use it to make room for a line of scripture or a key sound.
   */
  duck(amount = 0.35, seconds = 2, attack = 0.25): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const name of ['music', 'ambience'] as const) {
      const g = this.buses[name].gain.gain;
      const base = name === 'music' ? 0.8 : 0.7;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(base * amount, t, attack / 3);
      g.setTargetAtTime(base, t + attack + seconds, 0.5);
    }
  }

  /** Crossfade between two sustained sounds (beds, drones) over `seconds`. */
  crossfade(from: SoundHandle | null, to: SoundHandle | null, seconds = 3, toLevel = 1): void {
    from?.stop(seconds);
    to?.setLevel(toLevel, seconds);
  }

  /**
   * A positional source (HRTF-lite panner). Connect any sound's `output` to `spatial.input`.
   * Call `audio.updateListener(camera)` each frame.
   */
  spatial(opts: { refDistance?: number; maxDistance?: number; rolloff?: number; bus?: Bus } = {}): SpatialHandle {
    const c = this.ctx;
    if (!c) return { input: null, setPosition() {}, follow() {}, dispose() {} };
    const panner = c.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = opts.refDistance ?? 4;
    panner.maxDistance = opts.maxDistance ?? 200;
    panner.rolloffFactor = opts.rolloff ?? 1;
    panner.connect(this.out(opts.bus ?? 'sfx')!);
    const entry = { panner, target: null as Object3D | null };
    this.spatials.add(entry);
    const setPosition = (x: number, y: number, z: number) => {
      if (panner.positionX) {
        const t = c.currentTime;
        panner.positionX.setTargetAtTime(x, t, 0.03);
        panner.positionY.setTargetAtTime(y, t, 0.03);
        panner.positionZ.setTargetAtTime(z, t, 0.03);
      } else panner.setPosition(x, y, z);
    };
    return {
      input: panner,
      setPosition,
      follow: (o) => (entry.target = o),
      dispose: () => {
        panner.disconnect();
        this.spatials.delete(entry);
      },
    };
  }

  /** Move the listener to the camera and update followed spatial sources. Call once per frame. */
  updateListener(camera: Camera): void {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    camera.getWorldPosition(this._v);
    camera.getWorldDirection(this._f);
    const t = c.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(this._v.x, t, 0.03);
      l.positionY.setTargetAtTime(this._v.y, t, 0.03);
      l.positionZ.setTargetAtTime(this._v.z, t, 0.03);
      l.forwardX.setTargetAtTime(this._f.x, t, 0.03);
      l.forwardY.setTargetAtTime(this._f.y, t, 0.03);
      l.forwardZ.setTargetAtTime(this._f.z, t, 0.03);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition?.(this._v.x, this._v.y, this._v.z);
      l.setOrientation?.(this._f.x, this._f.y, this._f.z, 0, 1, 0);
    }
    for (const s of this.spatials) {
      if (!s.target) continue;
      s.target.getWorldPosition(this._v);
      if (s.panner.positionX) {
        s.panner.positionX.setTargetAtTime(this._v.x, t, 0.03);
        s.panner.positionY.setTargetAtTime(this._v.y, t, 0.03);
        s.panner.positionZ.setTargetAtTime(this._v.z, t, 0.03);
      }
    }
  }

  /** Internal helper: a gain node with a handle around it. */
  handle(gain: GainNode, level: number, sources: AudioScheduledSourceNode[], onStop?: () => void): SoundHandle {
    const c = this.ctx!;
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(level, c.currentTime, 0.4);
    let stopped = false;
    return {
      output: gain,
      setLevel: (v, s = 0.5) => gain.gain.setTargetAtTime(v, c.currentTime, Math.max(s / 3, 0.01)),
      stop: (s = 1.5) => {
        if (stopped) return;
        stopped = true;
        onStop?.();
        gain.gain.cancelScheduledValues(c.currentTime);
        gain.gain.setTargetAtTime(0, c.currentTime, Math.max(s / 4, 0.01));
        const end = c.currentTime + s + 0.1;
        for (const src of sources) {
          try {
            src.stop(end);
          } catch {
            /* already stopped */
          }
        }
        setTimeout(() => gain.disconnect(), (s + 0.3) * 1000);
      },
    };
  }

  /** Silent handle for when audio is unavailable. */
  get nullHandle(): DroneHandle & WindHandle & HeartbeatHandle {
    return NULL;
  }

  dispose(): void {
    this.unlockListeners.forEach((fn) => fn());
    this.offPrefs();
    void this.ctx?.close();
  }
}
