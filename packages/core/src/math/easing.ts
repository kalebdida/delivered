/** Easing functions. All take and return a value in 0..1. Nothing in DELIVERED moves linearly. */
export type Ease = (t: number) => number;

export const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (a === b ? 0 : (v - a) / (b - a));
export const remap = (v: number, a: number, b: number, c: number, d: number): number =>
  lerp(c, d, clamp(invLerp(a, b, v)));
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp(invLerp(a, b, v));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent damping: move `a` toward `b` with rate `lambda` (higher is faster). */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const easing = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t: number) => t * t * t * t,
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  /** The DESIGN.md camera and panel curve (`--ease-in-out-quart`). */
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: (t: number) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  /** The DESIGN.md entrance curve (`--ease-out-expo`). */
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: (t: number) =>
    t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
} satisfies Record<string, Ease>;

/**
 * The "breath" idle curve: a slow asymmetric sine (inhale a little faster than exhale).
 * @param time seconds
 * @param period seconds per breath (default 6)
 * @returns 0..1
 */
export function breath(time: number, period = 6): number {
  const p = (time / period) % 1;
  const warped = p < 0.42 ? (p / 0.42) * 0.5 : 0.5 + ((p - 0.42) / 0.58) * 0.5;
  return 0.5 - 0.5 * Math.cos(warped * Math.PI * 2);
}
