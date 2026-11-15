/** Deterministic seeded random (mulberry32). Use this instead of Math.random for anything visual. */
export interface Rng {
  /** 0..1 */
  (): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Standard normal via Box-Muller. */
  gauss(): number;
  /** -1 or 1 */
  sign(): number;
  /** Uniform point in the unit sphere. */
  inSphere(): [number, number, number];
}

export function seededRandom(seed: number | string = 1): Rng {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = next as Rng;
  rng.range = (min, max) => min + (max - min) * next();
  rng.int = (min, max) => Math.floor(rng.range(min, max + 1));
  rng.pick = (items) => items[Math.floor(next() * items.length)] as never;
  rng.gauss = () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-9))) * Math.cos(2 * Math.PI * next());
  rng.sign = () => (next() < 0.5 ? -1 : 1);
  rng.inSphere = () => {
    const u = next() * 2 - 1;
    const th = next() * Math.PI * 2;
    const r = Math.cbrt(next());
    const s = Math.sqrt(1 - u * u);
    return [r * s * Math.cos(th), r * u, r * s * Math.sin(th)];
  };
  return rng;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
