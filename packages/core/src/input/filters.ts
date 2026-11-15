import { clamp } from '../math/easing';
import { seededRandom, type Rng } from '../math/random';
import { cloneActions, type Actions } from './actions';

export interface FilterContext {
  dt: number;
  /** Seconds since the Input was created. */
  time: number;
  /** What the visitor actually pressed this frame (never mutated). */
  raw: Readonly<Actions>;
}

/**
 * Middleware that transforms actions before gameplay sees them. Mutate and/or return `actions`.
 * Filters run in registration order (or by `priority`, lower first).
 */
export interface InputFilter {
  id: string;
  priority?: number;
  /** Set false to bypass without removing. */
  enabled?: boolean;
  apply(actions: Actions, ctx: FilterContext): Actions | void;
  /** Called when the filter is removed, to drop internal state. */
  reset?(): void;
}

/** Deliver movement `ms` late (a ring buffer of past inputs). `ms` may be a function for variable lag. */
export function delayFilter(ms: number | (() => number), id = 'delay'): InputFilter {
  let queue: { t: number; x: number; y: number }[] = [];
  return {
    id,
    apply(a, ctx) {
      queue.push({ t: ctx.time, x: a.moveX, y: a.moveY });
      const lag = (typeof ms === 'function' ? ms() : ms) / 1000;
      let out = { x: 0, y: 0 };
      while (queue.length > 1 && queue[1]!.t <= ctx.time - lag) queue.shift();
      const head = queue[0]!;
      if (head.t <= ctx.time - lag) out = head;
      a.moveX = out.x;
      a.moveY = out.y;
    },
    reset() {
      queue = [];
    },
  };
}

/** Invert movement axes: press forward, go backward. */
export function invertFilter(axes: { x?: boolean; y?: boolean } = { x: true, y: true }, id = 'invert'): InputFilter {
  return {
    id,
    apply(a) {
      if (axes.x ?? true) a.moveX = -a.moveX;
      if (axes.y ?? true) a.moveY = -a.moveY;
    },
  };
}

/**
 * Bend movement toward a direction (for example the nearest temptation). `direction` returns a
 * unit-ish XY vector in the same space as moveX/moveY; `strength` 0..1 is how far to bend.
 */
export function redirectFilter(
  direction: () => { x: number; y: number } | null,
  strength: number | (() => number) = 0.6,
  id = 'redirect',
): InputFilter {
  return {
    id,
    apply(a) {
      const d = direction();
      const mag = Math.hypot(a.moveX, a.moveY);
      if (!d || mag < 0.01) return;
      const k = clamp(typeof strength === 'function' ? strength() : strength);
      const len = Math.hypot(d.x, d.y) || 1;
      a.moveX = a.moveX * (1 - k) + (d.x / len) * mag * k;
      a.moveY = a.moveY * (1 - k) + (d.y / len) * mag * k;
    },
  };
}

/** Ignore movement (and optionally buttons) entirely. */
export function dropFilter(opts: { buttons?: boolean } = {}, id = 'drop'): InputFilter {
  return {
    id,
    apply(a) {
      a.moveX = 0;
      a.moveY = 0;
      if (opts.buttons) a.primary = a.secondary = a.hold = false;
    },
  };
}

/** Add a constant or time-varying pull to movement. */
export function driftFilter(
  drift: { x: number; y: number } | ((time: number) => { x: number; y: number }),
  id = 'drift',
): InputFilter {
  return {
    id,
    apply(a, ctx) {
      const d = typeof drift === 'function' ? drift(ctx.time) : drift;
      a.moveX = clamp(a.moveX + d.x, -1, 1);
      a.moveY = clamp(a.moveY + d.y, -1, 1);
    },
  };
}

/** Low-pass movement. Higher `lambda` responds faster (12 is light, 3 is syrupy). */
export function smoothFilter(lambda = 10, id = 'smooth'): InputFilter {
  let x = 0;
  let y = 0;
  return {
    id,
    apply(a, ctx) {
      const k = 1 - Math.exp(-lambda * ctx.dt);
      x += (a.moveX - x) * k;
      y += (a.moveY - y) * k;
      a.moveX = x;
      a.moveY = y;
    },
    reset() {
      x = y = 0;
    },
  };
}

/** Scale movement (above 1 makes the visitor lighter and faster; values may exceed 1). */
export function amplifyFilter(gain: number | (() => number), id = 'amplify'): InputFilter {
  return {
    id,
    apply(a) {
      const g = typeof gain === 'function' ? gain() : gain;
      a.moveX *= g;
      a.moveY *= g;
    },
  };
}

/** The freedom filter WRETCHED adds after deliverance: smoother, lighter, a little faster. */
export function graceFilter(gain = 1.15, id = 'grace'): InputFilter {
  const smooth = smoothFilter(14);
  return {
    id,
    apply(a, ctx) {
      smooth.apply(a, ctx);
      a.moveX *= gain;
      a.moveY *= gain;
    },
    reset: smooth.reset,
  };
}

export type CorruptionKind = 'invert' | 'delay' | 'redirect' | 'drop' | 'drift';

export interface CorruptionOptions {
  /** 0..1 chance per second-ish that a betrayal episode starts. May be a function of game state. */
  intensity: number | (() => number);
  /** Which betrayals may occur (default all). */
  kinds?: CorruptionKind[];
  /** Episode length in seconds [min, max] (default 0.6..1.8). */
  duration?: [number, number];
  /** Direction for 'redirect' episodes. */
  redirectTo?: () => { x: number; y: number } | null;
  /** Called when an episode starts or ends (drive the glitch pass and HUD from here). */
  onBetray?: (kind: CorruptionKind | null) => void;
  seed?: number | string;
}

/**
 * The unpredictable betrayal filter WRETCHED builds on: randomly starts short episodes of
 * invert, delay, redirect, drop or drift. Compose your own from the primitives if you need more.
 */
export function corruptionFilter(opts: CorruptionOptions, id = 'corruption'): InputFilter & { current: CorruptionKind | null } {
  const rng: Rng = seededRandom(opts.seed ?? 'corruption');
  const kinds = opts.kinds ?? ['invert', 'delay', 'redirect', 'drop', 'drift'];
  const [dMin, dMax] = opts.duration ?? [0.6, 1.8];
  const parts: Record<CorruptionKind, InputFilter> = {
    invert: invertFilter(),
    delay: delayFilter(() => 300 + 600 * lag),
    redirect: redirectFilter(() => opts.redirectTo?.() ?? null, 0.75),
    drop: dropFilter(),
    drift: driftFilter((t) => ({ x: Math.sin(t * 0.7) * 0.55 * driftSign, y: 0 })),
  };
  let lag = 0.5;
  let driftSign = 1;
  let remaining = 0;
  const filter = {
    id,
    current: null as CorruptionKind | null,
    apply(a: Actions, ctx: FilterContext) {
      if (filter.current) {
        remaining -= ctx.dt;
        if (remaining <= 0) {
          parts[filter.current].reset?.();
          filter.current = null;
          opts.onBetray?.(null);
        }
      } else if (Math.hypot(ctx.raw.moveX, ctx.raw.moveY) > 0.2) {
        const p = clamp(typeof opts.intensity === 'function' ? opts.intensity() : opts.intensity);
        if (rng() < p * ctx.dt * 1.5) {
          filter.current = rng.pick(kinds);
          remaining = rng.range(dMin, dMax);
          lag = rng();
          driftSign = rng.sign();
          opts.onBetray?.(filter.current);
        }
      }
      if (filter.current) parts[filter.current].apply(a, ctx);
    },
    reset() {
      filter.current = null;
      remaining = 0;
      Object.values(parts).forEach((p) => p.reset?.());
    },
  };
  return filter;
}

/** Run a list of filters over a copy of `raw`. Pure; used by `Input` and by tests. */
export function runFilters(raw: Readonly<Actions>, filters: readonly InputFilter[], dt: number, time: number): Actions {
  let out = cloneActions(raw);
  const ctx: FilterContext = { dt, time, raw };
  for (const f of filters) {
    if (f.enabled === false) continue;
    out = f.apply(out, ctx) ?? out;
  }
  return out;
}
