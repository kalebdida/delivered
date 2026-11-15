import { describe, expect, it } from 'vitest';
import {
  amplifyFilter, arrowFor, corruptionFilter, delayFilter, driftFilter, dropFilter, emptyActions, graceFilter, HoldMeter,
  Input, invertFilter, redirectFilter, runFilters, smoothFilter,
} from '../src/input';

const fwd = () => ({ ...emptyActions(), moveY: 1 });

describe('InputFilter transforms', () => {
  it('invert flips movement and leaves raw untouched', () => {
    const raw = fwd();
    const out = runFilters(raw, [invertFilter()], 1 / 60, 0);
    expect(out.moveY).toBe(-1);
    expect(raw.moveY).toBe(1);
  });

  it('delay delivers input late', () => {
    const f = delayFilter(300);
    let out = runFilters(fwd(), [f], 0.1, 0);
    expect(out.moveY).toBe(0);
    out = runFilters(fwd(), [f], 0.1, 0.2);
    expect(out.moveY).toBe(0);
    out = runFilters(emptyActions(), [f], 0.1, 0.35);
    expect(out.moveY).toBe(1); // the press from t=0 arrives now, though the key is already up
  });

  it('redirect bends movement toward a target and keeps its magnitude', () => {
    const out = runFilters(fwd(), [redirectFilter(() => ({ x: 1, y: 0 }), 1)], 1 / 60, 0);
    expect(out.moveX).toBeCloseTo(1);
    expect(out.moveY).toBeCloseTo(0);
  });

  it('drop removes movement, drift adds a pull, amplify scales', () => {
    expect(runFilters(fwd(), [dropFilter()], 1 / 60, 0).moveY).toBe(0);
    expect(runFilters(emptyActions(), [driftFilter({ x: 0.4, y: 0 })], 1 / 60, 0).moveX).toBeCloseTo(0.4);
    expect(runFilters(fwd(), [amplifyFilter(1.5)], 1 / 60, 0).moveY).toBeCloseTo(1.5);
  });

  it('smooth eases toward the input', () => {
    const f = smoothFilter(10);
    const a = runFilters(fwd(), [f], 1 / 60, 0).moveY;
    const b = runFilters(fwd(), [f], 1 / 60, 1 / 60).moveY;
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(b).toBeGreaterThan(a);
  });

  it('filters run in order and can be disabled', () => {
    const amp = amplifyFilter(2);
    expect(runFilters(fwd(), [invertFilter(), amp], 1 / 60, 0).moveY).toBe(-2);
    amp.enabled = false;
    expect(runFilters(fwd(), [invertFilter(), amp], 1 / 60, 0).moveY).toBe(-1);
  });

  it('corruption starts and ends episodes and reports them', () => {
    const seen: (string | null)[] = [];
    const f = corruptionFilter({ intensity: 1, kinds: ['invert'], duration: [0.2, 0.2], onBetray: (k) => seen.push(k), seed: 7 });
    let betrayed = 0;
    for (let i = 0; i < 600; i++) {
      const out = runFilters(fwd(), [f], 1 / 60, i / 60);
      if (out.moveY < 0) betrayed++;
    }
    expect(seen).toContain('invert');
    expect(seen).toContain(null);
    expect(betrayed).toBeGreaterThan(0);
    expect(betrayed).toBeLessThan(600); // the visitor can always make some progress
  });

  it('grace is smooth and slightly faster than raw', () => {
    const f = graceFilter(1.15);
    let out = emptyActions();
    for (let i = 0; i < 120; i++) out = runFilters(fwd(), [f], 1 / 60, i / 60);
    expect(out.moveY).toBeCloseTo(1.15, 2);
  });
});

describe('Input', () => {
  it('exposes raw and filtered actions and edge detection', () => {
    const input = new Input({ listen: false });
    input.addFilter(invertFilter());
    input.setRaw({ moveX: 1, primary: true });
    input.update(1 / 60);
    expect(input.raw.moveX).toBe(1);
    expect(input.filtered.moveX).toBe(-1);
    expect(input.betrayed).toBe(true);
    expect(input.arrows()).toEqual({ pressed: '→', went: '←' });
    expect(input.pressed('primary')).toBe(true);
    input.update(1 / 60);
    expect(input.pressed('primary')).toBe(false);
    input.removeFilter('invert');
    input.update(1 / 60);
    expect(input.filtered.moveX).toBe(1);
  });

  it('normalizes diagonals and zeroes filtered output when disabled', () => {
    const input = new Input({ listen: false });
    input.setRaw({ moveX: 1, moveY: 1 });
    input.update(1 / 60);
    expect(Math.hypot(input.raw.moveX, input.raw.moveY)).toBeCloseTo(1);
    input.enabled = false;
    input.update(1 / 60);
    expect(input.filtered.moveX).toBe(0);
    expect(input.raw.moveX).toBeGreaterThan(0);
  });

  it('arrowFor names the eight directions', () => {
    expect(arrowFor(0, 1)).toBe('↑');
    expect(arrowFor(-1, -1)).toBe('↙');
    expect(arrowFor(0.05, 0)).toBe('·');
  });
});

describe('HoldMeter', () => {
  it('fills while held, drains when released, and tires with fatigue', () => {
    const m = new HoldMeter({ fillTime: 1, drainTime: 1 });
    for (let i = 0; i < 30; i++) m.update(1 / 60, true);
    expect(m.value).toBeCloseTo(0.5, 1);
    for (let i = 0; i < 60; i++) m.update(1 / 60, true);
    expect(m.complete).toBe(true);
    for (let i = 0; i < 30; i++) m.update(1 / 60, false);
    expect(m.value).toBeCloseTo(0.5, 1);

    const tired = new HoldMeter({ fillTime: 1, fatigue: 0.5 });
    for (let i = 0; i < 60; i++) tired.update(1 / 60, true);
    expect(tired.value).toBeLessThan(0.9);
  });
});
