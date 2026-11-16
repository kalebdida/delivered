// GAIN's sound: the cell (drips, a chain shifting, the low stone drone), each ledger object's
// warm motif and its collapse, the moonbeam's faint shimmer, and the one resolved chord.
import { scale, type AudioEngine, type DroneHandle, type SoundHandle } from '@delivered/core';
import type { LedgerId } from './logic/sentence';

const D = scale('D3', 'ionian');

/** A water drop in a stone room: a short falling sine with a soft click. */
export function drip(audio: AudioEngine, level = 0.25): void {
  const ctx = audio.ctx;
  const out = audio.out('ambience');
  if (!ctx || !out || !audio.unlocked) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const f = 1400 + Math.random() * 900;
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.09);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.2);
}

/** Notes (scale degrees) and the voice of each object's motif. */
const MOTIFS: Record<LedgerId | 'christ', { notes: number[]; voice: 'pluck' | 'flute' | 'bell' | 'horn' }> = {
  coins: { notes: [7, 9, 11, 14], voice: 'pluck' },
  laurel: { notes: [4, 7, 9, 11], voice: 'horn' },
  cushion: { notes: [0, 2, 4, 2], voice: 'flute' },
  scroll: { notes: [9, 7, 11, 9], voice: 'bell' },
  heart: { notes: [2, 4, 6, 9], voice: 'flute' },
  mirror: { notes: [11, 14, 16, 18], voice: 'bell' },
  written: { notes: [4, 6, 7, 9], voice: 'pluck' },
  christ: { notes: [0, 4, 7, 11], voice: 'bell' },
};

function play(audio: AudioEngine, voice: string, freq: number, when: number, level: number, duration: number): void {
  const o = { when, level, duration };
  if (voice === 'pluck') audio.pluck(freq, o);
  else if (voice === 'flute') audio.flute(freq, o);
  else if (voice === 'horn') audio.horn(freq / 2, o);
  else audio.bell(freq, o);
}

/** The life at its height: the object's warm motif, played twice. */
export function motif(audio: AudioEngine, id: LedgerId, level = 0.32): void {
  const m = MOTIFS[id];
  for (let r = 0; r < 2; r++) m.notes.forEach((n, i) => play(audio, m.voice, D.freq(n), r * 1.5 + i * 0.36, level * (r ? 0.75 : 1), 1.2));
}

/** The same motif collapsing: detuned, slower, fading, a semitone rub. */
export function collapse(audio: AudioEngine, id: LedgerId, level = 0.22): void {
  const m = MOTIFS[id];
  m.notes.forEach((n, i) => {
    const f = D.freq(n) * (1 - 0.03 * (i + 1));
    play(audio, m.voice, f, i * 0.55, level * (1 - i * 0.2), 1.8);
    if (i === 1) play(audio, m.voice, f * 1.059, i * 0.55 + 0.05, level * 0.5, 1.6);
  });
}

/** When "Christ" fills the blank: every motif returns at once, resolved into one chord. */
export function resolve(audio: AudioEngine): void {
  const notes = [0, 4, 7, 9, 11, 14, 16];
  notes.forEach((n, i) => audio.bell(D.freq(n), { when: i * 0.12, level: 0.18, duration: 5 }));
  audio.chord([D.freq(-7), D.freq(0), D.freq(4), D.freq(7), D.freq(11)], { level: 0.3, duration: 9, timbre: 'choir' });
  Object.values(MOTIFS).forEach((m, i) => play(audio, m.voice, D.freq(m.notes[m.notes.length - 1]!), 1.2 + i * 0.09, 0.12, 3));
}

/** The beam's faint high shimmer, present the whole time. */
export function shimmer(audio: AudioEngine): DroneHandle {
  const d = audio.drone(D.freq(21), 'glass', { level: 0.035, bus: 'ambience' });
  return d;
}

/** The cell's low stone-room drone. */
export function cellDrone(audio: AudioEngine): SoundHandle {
  return audio.drone(D.freq(-14), 'dark', { level: 0.12, bus: 'ambience' });
}

/** A bell-like chain tone for CH2; `n` climbs a chord as more guards light up. */
export function chainTone(audio: AudioEngine, n: number, level = 0.2): void {
  const chord = [0, 4, 7, 11, 14, 16, 18, 21];
  audio.bell(D.freq(chord[n % chord.length]!), { level, duration: 2.6 });
}
