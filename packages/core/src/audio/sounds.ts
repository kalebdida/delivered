import { clamp } from '../math/easing';
import { seededRandom } from '../math/random';
import {
  AudioCore,
  type Bus,
  type DroneHandle,
  type HeartbeatHandle,
  type SoundHandle,
  type Timbre,
  type WindHandle,
} from './engine';

export interface NoteOptions {
  /** Seconds from now. */
  when?: number;
  /** Seconds. */
  duration?: number;
  /** 0..1 */
  level?: number;
  bus?: Bus;
  /** Route through this node instead of a bus (e.g. a spatial input). */
  to?: AudioNode | null;
}

const rnd = seededRandom('sounds');

/**
 * The full audio system: `AudioCore` plus every procedural instrument and sound.
 * See the README for a tour. Every method is safe to call before unlock or without audio.
 */
export class AudioEngine extends AudioCore {
  private pluckCache = new Map<string, AudioBuffer>();

  private dest(o: { bus?: Bus; to?: AudioNode | null }, fallback: Bus = 'sfx'): AudioNode {
    return o.to ?? this.out(o.bus ?? fallback)!;
  }

  // -------------------------------------------------------------------------------------------
  // Sustained instruments
  // -------------------------------------------------------------------------------------------

  /**
   * A slowly breathing drone. Timbres: `warm` (hopeful), `dark` (heavy), `glass` (cold, pure:
   * the law monoliths), `choir` (voice-like pad), `hollow` (stone room).
   */
  drone(freq: number, timbre: Timbre = 'warm', opts: { level?: number; bus?: Bus; to?: AudioNode | null } = {}): DroneHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = timbre === 'choir' ? 2.5 : 0.8;
    const specs: Record<Timbre, { type: OscillatorType; ratios: number[]; detune: number; cutoff: number }> = {
      warm: { type: 'sawtooth', ratios: [1, 1.5, 2], detune: 7, cutoff: 5 },
      dark: { type: 'sawtooth', ratios: [0.5, 1, 1.01], detune: 11, cutoff: 2.5 },
      glass: { type: 'sine', ratios: [1, 2, 3.01, 5.02], detune: 2, cutoff: 14 },
      choir: { type: 'sawtooth', ratios: [1, 1.002, 2, 0.998], detune: 9, cutoff: 6 },
      hollow: { type: 'triangle', ratios: [1, 3, 5], detune: 4, cutoff: 4 },
    };
    const spec = specs[timbre];
    filter.frequency.value = freq * spec.cutoff;
    const oscs: OscillatorNode[] = [];
    spec.ratios.forEach((r, i) => {
      const o = c.createOscillator();
      o.type = spec.type;
      o.frequency.value = freq * r;
      o.detune.value = (i % 2 ? 1 : -1) * spec.detune * (0.5 + rnd());
      const g = c.createGain();
      g.gain.value = (timbre === 'glass' ? 0.5 / (i + 1) : 0.22) / Math.sqrt(spec.ratios.length);
      // Slow independent amplitude drift so the drone is never static.
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.05 + rnd() * 0.12;
      const lg = c.createGain();
      lg.gain.value = g.gain.value * 0.45;
      lfo.connect(lg).connect(g.gain);
      lfo.start();
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o, lfo);
    });
    // Slow filter breathing.
    const breath = c.createOscillator();
    breath.frequency.value = 0.07;
    const bg = c.createGain();
    bg.gain.value = freq * spec.cutoff * 0.25;
    breath.connect(bg).connect(filter.frequency);
    breath.start();
    oscs.push(breath);
    if (timbre === 'choir') {
      // Two vowel formants make it voice-like.
      for (const f of [700, 1150]) {
        const bp = c.createBiquadFilter();
        bp.type = 'peaking';
        bp.frequency.value = f;
        bp.Q.value = 4;
        bp.gain.value = 9;
        filter.connect(bp).connect(out);
      }
    } else filter.connect(out);
    out.connect(this.dest(opts, 'music'));
    const base = this.handle(out, opts.level ?? 0.5, oscs);
    const tonal = oscs.filter((_, i) => i % 2 === 0 && i < spec.ratios.length * 2);
    return {
      ...base,
      setFreq: (f, s = 1) => {
        tonal.forEach((o, i) => o.frequency.setTargetAtTime(f * spec.ratios[i]!, c.currentTime, Math.max(s / 3, 0.01)));
        filter.frequency.setTargetAtTime(f * spec.cutoff, c.currentTime, Math.max(s / 3, 0.01));
      },
      setBrightness: (v, s = 1) =>
        filter.frequency.setTargetAtTime(freq * (1 + clamp(v) * spec.cutoff * 2), c.currentTime, Math.max(s / 3, 0.01)),
    };
  }

  /** Karplus-Strong plucked string (lyre, harp). `brightness` 0..1 shapes the decay. */
  pluck(freq: number, opts: NoteOptions & { brightness?: number } = {}): void {
    const c = this.ctx;
    if (!c) return;
    const dur = opts.duration ?? 2.6;
    const bright = opts.brightness ?? 0.6;
    const key = `${Math.round(freq * 10)}:${dur}:${bright}`;
    let buf = this.pluckCache.get(key);
    if (!buf) {
      const rate = c.sampleRate;
      const n = Math.floor(rate * dur);
      buf = c.createBuffer(1, n, rate);
      const d = buf.getChannelData(0);
      const period = Math.max(2, Math.round(rate / freq));
      const rng = seededRandom(key);
      // Burst of filtered noise as the "pluck".
      let prev = 0;
      for (let i = 0; i < period; i++) {
        const w = rng() * 2 - 1;
        prev = prev + (w - prev) * (0.35 + bright * 0.65);
        d[i] = prev;
      }
      const damp = 0.494 + bright * 0.0055;
      for (let i = period; i < n; i++) d[i] = (d[i - period]! + d[i - period + 1]!) * damp;
      for (let i = 0; i < 64 && i < n; i++) d[n - 1 - i] = d[n - 1 - i]! * (i / 64);
      if (this.pluckCache.size > 64) this.pluckCache.clear();
      this.pluckCache.set(key, buf);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = (opts.level ?? 0.5) * 0.9;
    src.connect(g).connect(this.dest(opts, 'music'));
    src.start(c.currentTime + (opts.when ?? 0));
    src.onended = () => g.disconnect();
  }

  /** Breathy flute: a sine with a little second harmonic, vibrato and band-passed breath noise. */
  flute(freq: number, opts: NoteOptions = {}): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.when ?? 0);
    const dur = opts.duration ?? 1.6;
    const level = (opts.level ?? 0.4) * 0.5;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 0.14);
    out.gain.setTargetAtTime(level * 0.8, t + 0.2, 0.3);
    out.gain.setTargetAtTime(0, t + dur - 0.25, 0.1);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const g2 = c.createGain();
    g2.gain.value = 0.18;
    const vib = c.createOscillator();
    vib.frequency.value = 4.6;
    const vg = c.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(freq * 0.006, t + 0.6);
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    const n = c.createBufferSource();
    n.buffer = this.noise();
    n.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2;
    bp.Q.value = 1.2;
    const ng = c.createGain();
    ng.gain.value = 0.35;
    o.connect(out);
    o2.connect(g2).connect(out);
    n.connect(bp).connect(ng).connect(out);
    out.connect(this.dest(opts, 'music'));
    for (const s of [o, o2, vib, n]) {
      s.start(t);
      s.stop(t + dur + 0.4);
    }
    o.onended = () => out.disconnect();
  }

  /** Soft horn: detuned saws through a lowpass that opens with the note. */
  horn(freq: number, opts: NoteOptions = {}): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.when ?? 0);
    const dur = opts.duration ?? 2.4;
    const level = (opts.level ?? 0.4) * 0.35;
    const out = c.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 0.25);
    out.gain.setTargetAtTime(0, t + dur - 0.5, 0.2);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(freq * 1.2, t);
    lp.frequency.linearRampToValueAtTime(freq * 4.5, t + 0.4);
    lp.frequency.setTargetAtTime(freq * 2.2, t + 0.5, 0.6);
    const oscs = [-6, 5].map((det) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.6);
      return o;
    });
    lp.connect(out).connect(this.dest(opts, 'music'));
    oscs[0]!.onended = () => out.disconnect();
  }

  /** A warm sustained chord swell (deliverance moments). */
  chord(freqs: number[], opts: NoteOptions & { timbre?: Timbre } = {}): void {
    const dur = opts.duration ?? 6;
    for (const f of freqs) {
      const d = this.drone(f, opts.timbre ?? 'warm', { level: 0, bus: opts.bus, to: opts.to });
      const when = (opts.when ?? 0) * 1000;
      setTimeout(() => d.setLevel((opts.level ?? 0.5) / Math.sqrt(freqs.length), dur * 0.3), when);
      setTimeout(() => d.stop(dur * 0.5), when + dur * 500);
    }
  }

  /** A struck bell (inharmonic partials with long decay). */
  bell(freq: number, opts: NoteOptions = {}): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.when ?? 0);
    const dur = opts.duration ?? 5;
    const out = c.createGain();
    out.gain.value = (opts.level ?? 0.4) * 0.5;
    [[1, 1], [2.0, 0.55], [2.76, 0.4], [5.4, 0.22], [8.93, 0.1]].forEach(([r, a], i) => {
      const o = c.createOscillator();
      o.frequency.value = freq * r!;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a!, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 0.7));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.1);
      if (i === 0) o.onended = () => out.disconnect();
    });
    out.connect(this.dest(opts, 'music'));
  }

  // -------------------------------------------------------------------------------------------
  // Noise beds
  // -------------------------------------------------------------------------------------------

  /** Wind bed. `speed` 0 (a gentle breath) .. 1 (roaring). Gusts on its own. */
  wind(speed = 0.2, opts: { level?: number; bus?: Bus } = {}): WindHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const src = this.noiseSource()!;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    const hs = c.createBiquadFilter();
    hs.type = 'lowpass';
    const g = c.createGain();
    const out = c.createGain();
    const gust = c.createOscillator();
    gust.frequency.value = 0.09;
    const gustGain = c.createGain();
    gust.connect(gustGain).connect(bp.frequency);
    const gust2 = c.createOscillator();
    gust2.frequency.value = 0.23;
    const gust2Gain = c.createGain();
    gust2.connect(gust2Gain).connect(g.gain);
    gust.start();
    gust2.start();
    src.connect(bp).connect(hs).connect(g).connect(out).connect(this.dest(opts, 'ambience'));
    const apply = (v: number, s: number) => {
      const k = clamp(v);
      const tc = Math.max(s / 3, 0.01);
      const t = c.currentTime;
      bp.frequency.setTargetAtTime(220 + k * k * 900, t, tc);
      bp.Q.setTargetAtTime(0.9 - k * 0.5, t, tc);
      hs.frequency.setTargetAtTime(900 + k * 5000, t, tc);
      g.gain.setTargetAtTime(0.25 + k * 1.3, t, tc);
      gustGain.gain.setTargetAtTime(60 + k * 380, t, tc);
      gust2Gain.gain.setTargetAtTime(0.08 + k * 0.4, t, tc);
    };
    apply(speed, 0);
    return { ...this.handle(out, opts.level ?? 0.5, [src, gust, gust2]), setSpeed: (v, s = 1) => apply(v, s) };
  }

  /** Rain bed. `intensity` 0..1. */
  rain(intensity = 0.5, opts: { level?: number; bus?: Bus } = {}): SoundHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    const hiss = this.noiseSource(1.3)!;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500 - intensity * 1200;
    const hg = c.createGain();
    hg.gain.value = 0.12 + intensity * 0.3;
    const body = this.noiseSource(0.6)!;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const bg = c.createGain();
    bg.gain.value = 0.15 + intensity * 0.5;
    hiss.connect(hp).connect(hg).connect(out);
    body.connect(lp).connect(bg).connect(out);
    out.connect(this.dest(opts, 'ambience'));
    return this.handle(out, opts.level ?? 0.5, [hiss, body]);
  }

  /** Fire: a low roar with irregular crackles (lamp flame, hearth). */
  fire(opts: { level?: number; bus?: Bus; crackle?: number } = {}): SoundHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    const roar = this.noiseSource(0.4)!;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const rg = c.createGain();
    rg.gain.value = 0.5;
    roar.connect(lp).connect(rg).connect(out);
    out.connect(this.dest(opts, 'ambience'));
    let alive = true;
    const pop = () => {
      if (!alive) return;
      const t = c.currentTime;
      const s = c.createBufferSource();
      s.buffer = this.noise();
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + Math.random() * 4000;
      bp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.25 + Math.random() * 0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05);
      s.connect(bp).connect(g).connect(out);
      s.start(t, Math.random());
      s.stop(t + 0.1);
      setTimeout(pop, (40 + Math.random() * 420) / (opts.crackle ?? 1));
    };
    pop();
    return this.handle(out, opts.level ?? 0.4, [roar], () => (alive = false));
  }

  /** Crowd murmur: formant-filtered noise voices with slow, speech-like amplitude motion. */
  crowd(opts: { level?: number; bus?: Bus; voices?: number } = {}): SoundHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    const sources: AudioScheduledSourceNode[] = [];
    const n = opts.voices ?? 6;
    for (let i = 0; i < n; i++) {
      const src = this.noiseSource(0.5 + Math.random() * 0.5)!;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 280 + Math.random() * 900;
      bp.Q.value = 3 + Math.random() * 3;
      const g = c.createGain();
      g.gain.value = 0.3;
      const lfo = c.createOscillator();
      lfo.frequency.value = 1.5 + Math.random() * 3.5;
      const lg = c.createGain();
      lg.gain.value = 0.28;
      lfo.connect(lg).connect(g.gain);
      const sweep = c.createOscillator();
      sweep.frequency.value = 0.2 + Math.random() * 0.5;
      const sg = c.createGain();
      sg.gain.value = 180;
      sweep.connect(sg).connect(bp.frequency);
      lfo.start();
      sweep.start();
      src.connect(bp).connect(g).connect(out);
      sources.push(src, lfo, sweep);
    }
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    out.connect(lp).connect(this.dest(opts, 'ambience'));
    return this.handle(out, opts.level ?? 0.35, sources, () => setTimeout(() => lp.disconnect(), 4000));
  }

  /** A loop of slow breathing (filtered noise). `rate` in breaths per minute. */
  breathing(rate = 14, opts: { level?: number; bus?: Bus } = {}): SoundHandle & { setRate(bpm: number): void } {
    const c = this.ctx;
    if (!c) return { ...this.nullHandle, setRate() {} };
    const out = c.createGain();
    const src = this.noiseSource(0.8)!;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0;
    const lfo = c.createOscillator();
    lfo.frequency.value = rate / 60;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(g.gain);
    const fg = c.createGain();
    fg.gain.value = 350;
    lfo.connect(fg).connect(bp.frequency);
    lfo.start();
    src.connect(bp).connect(g).connect(out).connect(this.dest(opts, 'sfx'));
    return { ...this.handle(out, opts.level ?? 0.3, [src, lfo]), setRate: (bpm) => lfo.frequency.setTargetAtTime(bpm / 60, c.currentTime, 0.5) };
  }

  // -------------------------------------------------------------------------------------------
  // One-shots
  // -------------------------------------------------------------------------------------------

  private burst(o: { when?: number; dur: number; freq: number; q?: number; type?: BiquadFilterType; level: number; attack?: number; sweepTo?: number; bus?: Bus; to?: AudioNode | null }): void {
    const c = this.ctx!;
    const t = c.currentTime + (o.when ?? 0);
    const s = c.createBufferSource();
    s.buffer = this.noise();
    const f = c.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.level, t + (o.attack ?? 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f).connect(g).connect(this.dest(o));
    s.start(t, Math.random() * 1.5);
    s.stop(t + o.dur + 0.05);
    s.onended = () => g.disconnect();
  }

  private thump(o: { when?: number; from: number; to: number; dur: number; level: number; bus?: Bus; dest?: AudioNode | null }): void {
    const c = this.ctx!;
    const t = c.currentTime + (o.when ?? 0);
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(o.from, t);
    osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g).connect(o.dest ?? this.out(o.bus ?? 'sfx')!);
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
    osc.onended = () => g.disconnect();
  }

  /** One roll of thunder. `distance` 0 (overhead crack) .. 1 (far rumble). */
  thunder(opts: NoteOptions & { distance?: number } = {}): void {
    if (!this.ctx) return;
    const d = clamp(opts.distance ?? 0.5);
    const level = (opts.level ?? 0.7) * (1 - d * 0.5);
    const base = { when: opts.when, bus: opts.bus ?? ('ambience' as Bus), to: opts.to };
    if (d < 0.6) this.burst({ ...base, dur: 0.35, freq: 2400, type: 'highpass', level: level * (0.6 - d), attack: 0.002 });
    this.burst({ ...base, dur: 2.2 + d * 2.5, freq: 260 - d * 120, sweepTo: 50, type: 'lowpass', level: level * 1.6, attack: 0.03 + d * 0.2 });
    this.thump({ when: opts.when, from: 70, to: 28, dur: 1.4 + d, level: level * 0.9, bus: opts.bus ?? 'ambience', dest: opts.to });
  }

  /**
   * Thunder shaped into a hoofbeat gallop (UNDERNEATH: "who rides on the heavens").
   * Schedules `bars` gallop figures (da-da-DUM) at `bpm`. @returns a cancel function.
   */
  gallop(bpm = 96, bars = 8, opts: { level?: number; distance?: number; bus?: Bus } = {}): () => void {
    if (!this.ctx) return () => {};
    const beat = 60 / bpm;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const pattern: [number, number][] = [[0, 0.55], [0.22, 0.7], [0.44, 1]];
    for (let b = 0; b < bars; b++) {
      timers.push(
        setTimeout(() => {
          for (const [off, gain] of pattern) {
            const lv = (opts.level ?? 0.6) * gain;
            const when = off * beat;
            this.thump({ when, from: 95, to: 34, dur: 0.38, level: lv, bus: opts.bus ?? 'ambience' });
            this.burst({ when, dur: 0.5, freq: 300 - (opts.distance ?? 0.4) * 150, sweepTo: 60, type: 'lowpass', level: lv * 0.9, bus: opts.bus ?? 'ambience' });
          }
        }, b * beat * 1000),
      );
    }
    return () => timers.forEach(clearTimeout);
  }

  /** A looping heartbeat (lub-dub) with live BPM and a `skip()` for dropped beats. */
  heartbeat(bpm = 64, opts: { level?: number; bus?: Bus } = {}): HeartbeatHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    out.connect(this.dest(opts, 'sfx'));
    let rate = bpm;
    let alive = true;
    let skipNext = false;
    let timer: ReturnType<typeof setTimeout>;
    const beat = () => {
      if (!alive) return;
      if (!skipNext) {
        this.thump({ from: 68, to: 38, dur: 0.16, level: 0.9, dest: out });
        this.thump({ when: 0.17, from: 58, to: 34, dur: 0.2, level: 0.6, dest: out });
      }
      skipNext = false;
      timer = setTimeout(beat, 60000 / rate);
    };
    beat();
    return {
      ...this.handle(out, opts.level ?? 0.5, [], () => {
        alive = false;
        clearTimeout(timer);
      }),
      setBpm: (b) => (rate = clamp(b, 20, 220)),
      skip: () => (skipNext = true),
    };
  }

  /** A physical impact. `strength` 0..1 scales weight and brightness. */
  impact(strength = 0.6, opts: NoteOptions = {}): void {
    if (!this.ctx) return;
    const s = clamp(strength);
    const lv = (opts.level ?? 0.8) * (0.3 + s * 0.7);
    this.thump({ when: opts.when, from: 120 + s * 60, to: 36, dur: 0.25 + s * 0.35, level: lv, bus: opts.bus, dest: opts.to });
    this.burst({ when: opts.when, dur: 0.12 + s * 0.2, freq: 900 + s * 2500, level: lv * 0.5, q: 0.7, bus: opts.bus, to: opts.to });
  }

  /** A rattle of chain links. `intensity` 0..1 controls how many links ring. */
  chainRattle(intensity = 0.5, opts: NoteOptions = {}): void {
    if (!this.ctx) return;
    const n = 2 + Math.floor(clamp(intensity) * 8);
    for (let i = 0; i < n; i++) {
      this.burst({
        when: (opts.when ?? 0) + i * (0.018 + Math.random() * 0.04),
        dur: 0.05 + Math.random() * 0.09,
        freq: 1800 + Math.random() * 5200,
        q: 14 + Math.random() * 12,
        level: (opts.level ?? 0.5) * (0.5 + Math.random() * 0.9),
        bus: opts.bus,
        to: opts.to,
      });
    }
  }

  /** A sharp metallic snap (the chain pulling taut). */
  chainSnap(opts: NoteOptions = {}): void {
    if (!this.ctx) return;
    this.burst({ when: opts.when, dur: 0.5, freq: 3200, q: 9, level: (opts.level ?? 0.8) * 1.2, bus: opts.bus, to: opts.to });
    this.burst({ when: opts.when, dur: 0.9, freq: 5100, q: 18, level: (opts.level ?? 0.8) * 0.6, bus: opts.bus, to: opts.to });
    this.impact(0.5, opts);
  }

  /** Looping stone-on-stone (or chain-on-ground) scrape. Drive `setLevel` from physics speed. */
  stoneScrape(opts: { level?: number; bus?: Bus; to?: AudioNode | null } = {}): SoundHandle {
    const c = this.ctx;
    if (!c) return this.nullHandle;
    const out = c.createGain();
    const src = this.noiseSource(0.7)!;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 520;
    bp.Q.value = 1.6;
    const grit = c.createGain();
    grit.gain.value = 0.6;
    const lfo = c.createOscillator();
    lfo.type = 'sawtooth';
    lfo.frequency.value = 23;
    const lg = c.createGain();
    lg.gain.value = 0.4;
    lfo.connect(lg).connect(grit.gain);
    lfo.start();
    src.connect(bp).connect(grit).connect(out).connect(this.dest(opts));
    return this.handle(out, opts.level ?? 0, [src, lfo]);
  }

  /** Something breaking apart: a cascade of impacts and falling grit. `size` 0..1. */
  crumble(size = 0.5, opts: NoteOptions = {}): void {
    if (!this.ctx) return;
    const s = clamp(size);
    const n = 4 + Math.floor(s * 12);
    const lv = opts.level ?? 0.7;
    for (let i = 0; i < n; i++) {
      const when = (opts.when ?? 0) + Math.pow(i / n, 1.4) * (0.5 + s * 1.6) + Math.random() * 0.05;
      this.impact(0.25 + Math.random() * 0.6 * (1 - i / n), { when, level: lv * (1 - (i / n) * 0.6), bus: opts.bus, to: opts.to });
    }
    this.burst({ when: opts.when, dur: 1.2 + s * 2, freq: 1400, sweepTo: 300, type: 'lowpass', level: lv * 0.35, attack: 0.15, bus: opts.bus, to: opts.to });
  }

  /** A short digital stutter (WRETCHED's corrupted input). */
  stutter(opts: NoteOptions = {}): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + (opts.when ?? 0);
    const o = c.createOscillator();
    o.type = 'square';
    const g = c.createGain();
    g.gain.value = 0;
    for (let i = 0; i < 5; i++) {
      o.frequency.setValueAtTime(180 + Math.random() * 900, t + i * 0.022);
      g.gain.setValueAtTime(i % 2 ? 0 : (opts.level ?? 0.25) * 0.3, t + i * 0.022);
    }
    g.gain.setValueAtTime(0, t + 0.11);
    o.connect(g).connect(this.dest(opts));
    o.start(t);
    o.stop(t + 0.13);
    o.onended = () => g.disconnect();
  }

  // -------------------------------------------------------------------------------------------
  // UI sound kit (DESIGN.md 5.7): every interactive element has a sound, mixed very low
  // -------------------------------------------------------------------------------------------

  readonly ui = {
    /** A soft airy tick. */
    hover: (): void => {
      if (!this.ctx) return;
      this.burst({ dur: 0.045, freq: 5200, q: 1.2, type: 'highpass', level: 0.05, bus: 'ui' });
    },
    /** A warm muted thunk. */
    click: (): void => {
      if (!this.ctx) return;
      this.thump({ from: 190, to: 84, dur: 0.09, level: 0.3, bus: 'ui' });
      this.burst({ dur: 0.03, freq: 1800, q: 0.8, level: 0.04, bus: 'ui' });
    },
    /** A gentle rising chime. */
    open: (): void => this.chime([587.33, 880], 0.07),
    /** A gentle falling chime. */
    close: (): void => this.chime([880, 587.33], 0.07),
    /** A soft confirmation (completing something). */
    confirm: (): void => this.chime([587.33, 739.99, 880, 1174.66], 0.06),
  };

  private chime(freqs: number[], gap: number): void {
    const c = this.ctx;
    if (!c) return;
    freqs.forEach((f, i) => {
      const t = c.currentTime + i * gap;
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(this.out('ui')!);
      o.start(t);
      o.stop(t + 0.6);
      o.onended = () => g.disconnect();
    });
  }
}
