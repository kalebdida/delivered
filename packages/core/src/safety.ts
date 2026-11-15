import { Emitter, createStore, rawGet, rawSet } from './storage';

/** The three rooms. */
export type AppId = 'wretched' | 'underneath' | 'gain';
export const APP_IDS: readonly AppId[] = ['wretched', 'underneath', 'gain'];

// ---------------------------------------------------------------------------------------------
// Preferences shared by the whole site (persisted under delivered:core:*)
// ---------------------------------------------------------------------------------------------

export type QualityPreference = 'auto' | 'low' | 'medium' | 'high';

export interface Preferences {
  volume: number;
  muted: boolean;
  quality: QualityPreference;
  reduceFlashing: boolean;
  /** `null` follows the OS `prefers-reduced-motion` setting. */
  reducedMotion: boolean | null;
}

const prefStore = createStore('core');
const DEFAULT_PREFS: Preferences = {
  volume: 0.8,
  muted: false,
  quality: 'auto',
  reduceFlashing: false,
  reducedMotion: null,
};

let prefs: Preferences = { ...DEFAULT_PREFS, ...prefStore.get<Partial<Preferences>>('prefs', {}) };
const prefEvents = new Emitter<{ change: Preferences }>();

export const preferences = {
  get(): Readonly<Preferences> {
    return prefs;
  },
  set(patch: Partial<Preferences>): void {
    prefs = { ...prefs, ...patch };
    prefStore.set('prefs', prefs);
    applyMotionAttribute();
    prefEvents.emit('change', prefs);
  },
  onChange(fn: (p: Preferences) => void): () => void {
    return prefEvents.on('change', fn);
  },
};

function osReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when movement should be replaced by gentle crossfades (OS setting or the Settings panel). */
export function prefersReducedMotion(): boolean {
  return prefs.reducedMotion ?? osReducedMotion();
}

function applyMotionAttribute(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.toggleAttribute('data-reduced-motion', prefersReducedMotion());
}
applyMotionAttribute();
if (typeof matchMedia !== 'undefined') {
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotionAttribute);
}

// ---------------------------------------------------------------------------------------------
// Flash limiter
// ---------------------------------------------------------------------------------------------

export interface FlashLimiterOptions {
  /** Max flashes per rolling second (default 2, well under the WCAG limit of 3). */
  maxPerSecond?: number;
  /** A luminance change below this (0..1) is not a flash and always passes. */
  threshold?: number;
  now?: () => number;
}

/**
 * Global flash limiter. Anything that rapidly changes screen luminance (white-outs, lightning,
 * glitch bursts) must ask first. PostFX and the Director do this automatically.
 *
 * `request(delta)` returns the luminance change you are allowed to apply: the full value, or a
 * reduced one when the budget is spent or the visitor enabled "reduce flashing".
 */
export class FlashLimiter {
  private times: number[] = [];
  private readonly max: number;
  private readonly threshold: number;
  private readonly now: () => number;
  /** When true, every flash is clamped to the threshold (set from Settings "reduce flashing"). */
  reduce = false;

  constructor(opts: FlashLimiterOptions = {}) {
    this.max = opts.maxPerSecond ?? 2;
    this.threshold = opts.threshold ?? 0.1;
    this.now = opts.now ?? (() => performance.now());
  }

  /** @param delta desired luminance change, 0..1. @returns allowed change, 0..delta. */
  request(delta: number): number {
    const d = Math.abs(delta);
    if (d <= this.threshold) return delta;
    const soft = Math.sign(delta) * this.threshold;
    if (this.reduce) return soft;
    const t = this.now();
    this.times = this.times.filter((x) => t - x < 1000);
    if (this.times.length >= this.max) return soft;
    this.times.push(t);
    return delta;
  }

  /** Flashes granted in the last second. */
  get recent(): number {
    const t = this.now();
    return this.times.filter((x) => t - x < 1000).length;
  }
}

/** The shared limiter used by PostFX and the Director. */
export const flashLimiter = new FlashLimiter();
flashLimiter.reduce = prefs.reduceFlashing;
preferences.onChange((p) => (flashLimiter.reduce = p.reduceFlashing));

// ---------------------------------------------------------------------------------------------
// Completion API
// ---------------------------------------------------------------------------------------------

const completeKey = (appId: AppId) => `delivered:complete:${appId}`;

/** Mark a room as completed. Call this at the end of every room. */
export function markComplete(appId: AppId): void {
  rawSet(completeKey(appId), new Date().toISOString());
}
export function isComplete(appId: AppId): boolean {
  return rawGet(completeKey(appId)) !== null;
}
export function allComplete(): boolean {
  return APP_IDS.every(isComplete);
}

// ---------------------------------------------------------------------------------------------
// Accessibility helpers
// ---------------------------------------------------------------------------------------------

let liveRegion: HTMLElement | null = null;

/** Announce a message to screen readers through a shared polite `aria-live` region. */
export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'dl-sr-only';
    liveRegion.setAttribute('role', 'status');
    document.body.appendChild(liveRegion);
  }
  liveRegion.setAttribute('aria-live', politeness);
  liveRegion.textContent = '';
  // A microtask gap makes repeated identical messages re-announce.
  queueMicrotask(() => liveRegion && (liveRegion.textContent = message));
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside `container` (for panels and dialogs). Escape calls `onEscape`.
 * @returns a release function that restores focus to where it was.
 */
export function trapFocus(container: HTMLElement, onEscape?: () => void): () => void {
  const previous = document.activeElement as HTMLElement | null;
  const items = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onEscape) {
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = items();
    if (!list.length) return;
    const first = list[0]!;
    const last = list[list.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKey);
  (items()[0] ?? container).focus({ preventScroll: true });
  return () => {
    container.removeEventListener('keydown', onKey);
    previous?.focus?.({ preventScroll: true });
  };
}

/** Light haptic tap on devices that support it (Android). Never constant. */
export function haptic(pattern: number | number[] = 12): void {
  if (prefersReducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
