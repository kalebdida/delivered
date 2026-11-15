import { describe, expect, it, vi } from 'vitest';
import { Loop } from '../src/loop';
import { breath, easing, seededRandom, createNoise, Spring, SPRING_PRESETS } from '../src/math';
import { stepAdaptiveDpr, tierFromGpu, QUALITY_BUDGETS } from '../src/quality';
import { FlashLimiter, allComplete, isComplete, markComplete } from '../src/safety';
import { createStore } from '../src/storage';
import { Verlet, createCloth, createRope } from '../src/verlet';
import { polygonArea, voronoiCells } from '../src/physics/crumble';
import { quatFromY } from '../src/physics/chain';
import { midiToFreq, noteToMidi, scale } from '../src/audio/scale';
import { gradeColor } from '../src/postfx';
import { wrapText } from '../src/ui/postcard';

describe('flash limiter', () => {
  it('allows at most 2 flashes per second', () => {
    let now = 0;
    const f = new FlashLimiter({ now: () => now });
    expect(f.request(0.9)).toBe(0.9);
    now = 200;
    expect(f.request(0.9)).toBe(0.9);
    now = 400;
    expect(f.request(0.9)).toBeCloseTo(0.1); // third within a second is softened to the threshold
    now = 1300;
    expect(f.request(0.9)).toBe(0.9);
  });
  it('ignores sub-threshold changes and clamps everything when reduce is on', () => {
    const f = new FlashLimiter({ now: () => 0 });
    for (let i = 0; i < 10; i++) expect(f.request(0.05)).toBe(0.05);
    expect(f.recent).toBe(0);
    f.reduce = true;
    expect(f.request(1)).toBeCloseTo(0.1);
    expect(f.request(-1)).toBeCloseTo(-0.1);
  });
});

describe('Verlet constraints', () => {
  it('keeps a hanging rope near its rest length', () => {
    const rope = createRope([0, 0, 0], [2, 0, 0], 10, { iterations: 12 });
    rope.pin(0);
    for (let i = 0; i < 600; i++) rope.step(1 / 60);
    let length = 0;
    for (let i = 0; i < 10; i++) length += rope.distance(i, i + 1);
    expect(length).toBeGreaterThan(1.95);
    expect(length).toBeLessThan(2.25);
    const [x, y] = rope.getPoint(10);
    expect(Math.abs(x)).toBeLessThan(0.3); // it swung down under the pin
    expect(y).toBeLessThan(-1.7);
    expect(rope.getPoint(0)).toEqual([0, 0, 0]); // the pin did not move
  });
  it('respects the floor, pins and released constraints', () => {
    const v = new Verlet(2);
    v.setPoint(0, 0, 1, 0);
    v.setPoint(1, 1, 1, 0);
    const c = v.constrain(0, 1);
    v.floorY = 0;
    for (let i = 0; i < 300; i++) v.step(1 / 60);
    expect(v.getPoint(0)[1]).toBeGreaterThanOrEqual(0);
    expect(v.distance(0, 1)).toBeCloseTo(1, 1);
    v.release(c);
    expect(v.constraints.length).toBe(0);
  });
  it('builds cloth with the right topology', () => {
    const cloth = createCloth([0, 2, 0], 1, 1, 4, 3);
    expect(cloth.count).toBe(20);
    expect(cloth.constraints.length).toBe(4 * 4 + 5 * 3 + 2 * 12);
  });
});

describe('loop', () => {
  it('runs fixed steps at 60 Hz with time scaling', () => {
    const loop = new Loop({ autoPause: false });
    const fixed = vi.fn();
    const frame = vi.fn();
    loop.onFixed(fixed);
    loop.onFrame(frame);
    loop.advance(0.05);
    expect(fixed).toHaveBeenCalledTimes(3);
    expect(frame).toHaveBeenCalledTimes(1);
    loop.timeScale = 0;
    loop.advance(0.05);
    expect(fixed).toHaveBeenCalledTimes(3);
    loop.timeScale = 0.2;
    loop.advance(0.1); // 0.02 scaled seconds → 1 step
    expect(fixed).toHaveBeenCalledTimes(4);
  });
});

describe('quality', () => {
  it('lowers DPR after 2 s of slow frames and raises it with headroom', () => {
    let s = { dpr: 2, slowFor: 0, fastFor: 0 };
    for (let i = 0; i < 130; i++) s = stepAdaptiveDpr(s, 26, 1 / 60, 2);
    expect(s.dpr).toBe(1.75);
    for (let i = 0; i < 60 * 30; i++) s = stepAdaptiveDpr(s, 30, 1 / 60, 2);
    expect(s.dpr).toBe(1); // never below 1
    for (let i = 0; i < 60 * 60; i++) s = stepAdaptiveDpr(s, 8, 1 / 60, 2);
    expect(s.dpr).toBe(2); // never above the cap
  });
  it('maps GPU tiers and exposes budgets', () => {
    expect(tierFromGpu(0, false)).toBe('low');
    expect(tierFromGpu(2, false)).toBe('medium');
    expect(tierFromGpu(3, false)).toBe('high');
    expect(tierFromGpu(3, true)).toBe('medium');
    expect(tierFromGpu(2, true)).toBe('low');
    expect(QUALITY_BUDGETS.high.maxParticles).toBeGreaterThan(QUALITY_BUDGETS.low.maxParticles);
    expect(QUALITY_BUDGETS.low.clouds).toBe('billboard');
  });
});

describe('math', () => {
  it('easings hit their endpoints', () => {
    for (const fn of Object.values(easing)) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
    expect(breath(0)).toBeCloseTo(0);
    expect(breath(6 * 0.42)).toBeCloseTo(1);
  });
  it('seeded random and noise are deterministic and bounded', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const n = createNoise(1);
    for (let i = 0; i < 200; i++) {
      const v = n.noise3(i * 0.37, i * 0.11, i * 0.53);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
      expect(Math.abs(n.noise2(i * 0.37, i * 0.11))).toBeLessThanOrEqual(1.05);
    }
    expect(createNoise(1).fbm2(1.3, 2.7)).toBe(n.fbm2(1.3, 2.7));
  });
  it('springs settle on their target', () => {
    const s = new Spring(0, SPRING_PRESETS.smooth);
    s.target = 5;
    for (let i = 0; i < 300; i++) s.step(1 / 60);
    expect(s.value).toBeCloseTo(5, 2);
    expect(s.settled).toBe(true);
  });
});

describe('physics helpers (pure parts)', () => {
  it('voronoi chunks tile the slab exactly', () => {
    const cells = voronoiCells(6, 4, 24, 'test');
    expect(cells.length).toBe(24);
    const area = cells.reduce((sum, c) => sum + polygonArea(c.polygon), 0);
    expect(area).toBeCloseTo(24, 4);
  });
  it('quatFromY rotates +Y onto a direction', () => {
    const q = quatFromY({ x: 1, y: 0, z: 0 });
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1);
    expect(q.z).toBeCloseTo(-Math.SQRT1_2);
  });
});

describe('audio scale', () => {
  it('converts notes and builds modal scales', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(midiToFreq(69)).toBe(440);
    const s = scale('D3', 'dorian');
    expect(s.midi(0)).toBe(50);
    expect(s.midi(7)).toBe(62);
    expect(s.midi(-1)).toBe(48);
    expect(s.chord([0, 2, 4]).length).toBe(3);
  });
});

describe('design tokens in code', () => {
  it('the grade never produces pure black or pure white', () => {
    const [r, g, b] = gradeColor([0, 0, 0], {});
    expect(Math.min(r, g, b)).toBeGreaterThan(0.01);
    const [r2, g2, b2] = gradeColor([1, 1, 1], {});
    expect(Math.max(r2, g2, b2)).toBeLessThan(0.99);
  });
  it('postcard text wraps to the measured width', () => {
    const lines = wrapText((s) => s.length * 10, 'I tried seven times to free myself. Then I cried out.', 200);
    expect(lines.every((l) => l.length <= 20)).toBe(true);
    expect(lines.join(' ')).toBe('I tried seven times to free myself. Then I cried out.');
  });
});

describe('storage and completion', () => {
  it('namespaces keys and survives bad JSON', () => {
    const s = createStore('test');
    s.set('n', 3);
    expect(s.get('n', 0)).toBe(3);
    expect(localStorage.getItem('delivered:test:n')).toBe('3');
    localStorage.setItem('delivered:test:bad', '{');
    expect(s.get('bad', 'fallback')).toBe('fallback');
  });
  it('tracks room completion under delivered:complete:<appId>', () => {
    expect(isComplete('gain')).toBe(false);
    markComplete('gain');
    expect(isComplete('gain')).toBe(true);
    expect(localStorage.getItem('delivered:complete:gain')).toBeTruthy();
    expect(allComplete()).toBe(false);
    markComplete('wretched');
    markComplete('underneath');
    expect(allComplete()).toBe(true);
  });
});
