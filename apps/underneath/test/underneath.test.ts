import { describe, expect, it } from 'vitest';
import { FallModel } from '../src/world/fall';
import { CatchSystem, simulateLetGo } from '../src/world/play';
import { COLUMN, LAYERS, altitudeMetres, dominantLayer, layerAt } from '../src/world/layers';
import { seededRandom } from '@delivered/core';

describe('sky column', () => {
  it('blends five layers that always sum to one', () => {
    for (let y = -50; y <= 2700; y += 7) {
      const w = layerAt(y);
      const sum = LAYERS.reduce((s, k) => s + w[k], 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
  it('puts each layer at its altitude', () => {
    expect(dominantLayer(COLUMN.islands)).toBe('heights');
    expect(dominantLayer(1700)).toBe('storm');
    expect(dominantLayer(1100)).toBe('night');
    expect(dominantLayer(500)).toBe('fog');
    expect(dominantLayer(40)).toBe('underneath');
    expect(altitudeMetres(2400)).toBe(12000);
    expect(altitudeMetres(-3)).toBe(0);
  });
});

describe('the first fall cannot be stopped', () => {
  const adversaries: [string, (t: number, r: () => number) => { x: number; y: number; posture: number; lookUp: number; holding: boolean }][] = [
    ['spread and look up forever', () => ({ x: 0, y: 0, posture: -1, lookUp: 1, holding: false })],
    ['hold every grab', () => ({ x: 0, y: 0, posture: -1, lookUp: 1, holding: true })],
    ['garbage input', () => ({ x: NaN, y: Infinity, posture: -Infinity, lookUp: NaN, holding: true })],
    ['random mashing', (_t, r) => ({ x: r() * 2 - 1, y: r() * 2 - 1, posture: r() * 2 - 1, lookUp: r(), holding: r() > 0.3 })],
    ['steer out of the column', () => ({ x: 1, y: 1, posture: -1, lookUp: 0, holding: false })],
  ];
  for (const [name, input] of adversaries) {
    it(`arrives within the time limit: ${name}`, () => {
      const rng = seededRandom(name);
      const fall = new FallModel();
      let lastY = fall.y;
      let t = 0;
      while (!fall.done && t < 200) {
        fall.step(1 / 60, input(t, () => rng()));
        expect(fall.y).toBeLessThanOrEqual(lastY);
        lastY = fall.y;
        t += 1 / 60;
      }
      expect(fall.done).toBe(true);
      expect(t).toBeLessThanOrEqual(fall.opts.maxDuration + 0.1);
      expect(Math.hypot(fall.x, fall.z)).toBeLessThan(fall.opts.radius * 1.6);
    });
  }
  it('takes about 90 s when the visitor just falls', () => {
    const fall = new FallModel();
    let t = 0;
    while (!fall.done) {
      fall.step(1 / 60, { x: 0, y: 0, posture: 0, lookUp: 0, holding: false });
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(75);
    expect(t).toBeLessThan(100.1);
  });
});

describe('every let-go in the playground is caught', () => {
  it('catches from any height and speed, above the floor', () => {
    const sys = new CatchSystem(2346, 2330);
    const rng = seededRandom('let-go');
    for (let i = 0; i < 400; i++) {
      const y0 = 2346 + rng.range(-20, 140);
      const vy0 = rng.range(-30, 25);
      sys.release();
      const r = simulateLetGo(sys, y0, vy0);
      expect(r.plan).not.toBeNull();
      expect(r.caughtAt).toBeLessThan(30);
      expect(r.plan!.y).toBeGreaterThan(sys.floor);
    }
    expect(sys.caught).toBe(sys.letGo);
  });
  it('varies the catch', () => {
    const sys = new CatchSystem(10, 0);
    const kinds = new Set(Array.from({ length: 5 }, () => sys.plan(5).kind));
    expect(kinds.size).toBe(5);
  });
});
