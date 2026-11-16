// Care rule: the left ("depart") door can never be opened, by any input or physics exploit.
import { describe, expect, it } from 'vitest';
import * as doors from '../src/logic/doors';
import { DEPART, insideVeil, request, resolveVeil, type Point2, type Veil } from '../src/logic/doors';

const veil: Veil = { center: { x: -1.2, z: -2.4 }, radius: 0.9 };
const safe: Point2 = { x: 0, z: 0 };

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('the depart door', () => {
  it('always answers "not yet", whatever is asked and however often', () => {
    for (let i = 0; i < 10_000; i++) expect(request('depart')).toBe('not-yet');
    expect(request('remain')).toBe('open');
    expect(DEPART.state).toBe('sealed');
  });

  it('cannot have its state changed', () => {
    expect(Object.isFrozen(DEPART)).toBe(true);
    expect(() => {
      (DEPART as { state: string }).state = 'open';
    }).toThrow();
    expect(DEPART.state).toBe('sealed');
  });

  it('has no code path that opens it', () => {
    const names = Object.keys(doors);
    expect(names.some((n) => /open|unseal|depart.*(go|enter)/i.test(n))).toBe(false);
  });

  it('keeps a random walker on this side of the veil', () => {
    const rnd = lcg(7);
    let p: Point2 = { ...safe };
    for (let i = 0; i < 50_000; i++) {
      // Walk with a bias toward the door, sometimes sprinting at absurd speeds.
      const speed = rnd() < 0.02 ? 50 : 1.5;
      const dt = rnd() < 0.01 ? 5 : 1 / 60;
      const toDoor = { x: veil.center.x - p.x, z: veil.center.z - p.z };
      const len = Math.hypot(toDoor.x, toDoor.z) || 1;
      const next = {
        x: p.x + ((toDoor.x / len) * 0.7 + (rnd() - 0.5)) * speed * dt,
        z: p.z + ((toDoor.z / len) * 0.7 + (rnd() - 0.5)) * speed * dt,
      };
      p = resolveVeil(veil, p, next, safe).p;
      expect(insideVeil(veil, p)).toBe(false);
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true);
    }
  });

  it('resists teleports straight into or behind the doorway', () => {
    const targets: Point2[] = [veil.center, { x: veil.center.x, z: veil.center.z - 5 }, { x: veil.center.x + 0.1, z: veil.center.z + 0.1 }, { x: -1.2, z: -3.3 }];
    for (const t of targets) {
      const r = resolveVeil(veil, safe, t, safe);
      expect(insideVeil(veil, r.p)).toBe(false);
      expect(r.p.z).toBeGreaterThan(veil.center.z);
      expect(r.pushed).toBe(true);
    }
  });

  it('works the same with the room on the other side of the wall', () => {
    const front: Veil = { center: { x: 1.15, z: 2.4 }, radius: 0.9, room: -1 };
    const rnd = lcg(11);
    let p: Point2 = { ...safe };
    for (let i = 0; i < 20_000; i++) {
      const next = { x: p.x + (rnd() - 0.4) * 0.3, z: p.z + (rnd() - 0.3) * 0.3 };
      p = resolveVeil(front, p, rnd() < 0.01 ? { x: 1.15, z: 9 } : next, safe).p;
      expect(insideVeil(front, p)).toBe(false);
      expect(p.z).toBeLessThan(2.4);
    }
  });

  it('ignores NaN and Infinity, and recovers from a corrupted previous position', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const r = resolveVeil(veil, safe, { x: bad, z: bad }, safe);
      expect(r.p).toEqual(safe);
      const r2 = resolveVeil(veil, { x: bad, z: 0 }, veil.center, safe);
      expect(insideVeil(veil, r2.p)).toBe(false);
    }
    const inside = resolveVeil(veil, veil.center, veil.center, safe);
    expect(insideVeil(veil, inside.p)).toBe(false);
  });
});
