/** Modal scale helper for melodies. */
export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  /** Ethiopian qenet (pentatonic modes), for the Amharic heart of the project. */
  tizita: [0, 2, 4, 7, 9],
  bati: [0, 4, 5, 7, 11],
  ambassel: [0, 1, 5, 7, 8],
  anchihoye: [0, 1, 5, 6, 9],
} as const;
export type Mode = keyof typeof MODES;

export const midiToFreq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
export const freqToMidi = (freq: number): number => 69 + 12 * Math.log2(freq / 440);

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Parse 'A3', 'C#4', 'Eb2' into a MIDI number. */
export function noteToMidi(note: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note);
  if (!m) throw new Error(`Bad note name: ${note}`);
  return NOTE[m[1]!.toUpperCase()]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

export interface Scale {
  /** MIDI number of a scale degree (0 = root; negative and beyond-octave degrees wrap). */
  midi(degree: number): number;
  /** Frequency in Hz of a scale degree. */
  freq(degree: number): number;
  /** Frequencies of a chord built from degrees, e.g. `chord([0, 2, 4])`. */
  chord(degrees: number[]): number[];
}

/**
 * ```ts
 * const s = scale('D3', 'dorian');
 * audio.pluck(s.freq(0)); audio.pluck(s.freq(4), { when: 0.4 });
 * ```
 */
export function scale(root: string | number, mode: Mode = 'dorian'): Scale {
  const base = typeof root === 'string' ? noteToMidi(root) : root;
  const steps = MODES[mode];
  const midi = (degree: number) => {
    const n = steps.length;
    const oct = Math.floor(degree / n);
    return base + oct * 12 + steps[((degree % n) + n) % n]!;
  };
  return { midi, freq: (d) => midiToFreq(midi(d)), chord: (ds) => ds.map((d) => midiToFreq(midi(d))) };
}
