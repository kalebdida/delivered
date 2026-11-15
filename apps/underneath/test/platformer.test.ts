import { describe, expect, it } from 'vitest';
import { Platformer, type Platform } from '../src/world/visitor';

describe('platformer', () => {
  const home: Platform = { x: 0, z: 0, y: 2400, r: 6.5, ledge: true };
  const bridge: Platform = { x: 0, z: 8.7, y: 2400, r: 0, hx: 0.75, hz: 2.7, rot: Math.PI / 2 - Math.PI / 2 };
  it('stands still with no input', () => {
    const m = new Platformer();
    m.teleport(0, 2400, 2.5, home);
    for (let i = 0; i < 300; i++) m.step(1 / 60, { dx: 0, dz: 0, jumpPressed: false, jumpHeld: false }, [home, bridge]);
    expect(m.pos.y).toBeCloseTo(2400);
    expect(Math.hypot(m.pos.x, m.pos.z - 2.5)).toBeLessThan(0.01);
  });
  it('jumps and lands', () => {
    const m = new Platformer();
    m.teleport(0, 2400, 0, home);
    m.step(1 / 60, { dx: 0, dz: 0, jumpPressed: true, jumpHeld: true }, [home]);
    expect(m.grounded).toBe(false);
    for (let i = 0; i < 120; i++) m.step(1 / 60, { dx: 0, dz: 0, jumpPressed: false, jumpHeld: true }, [home]);
    expect(m.grounded).toBe(true);
    expect(m.pos.y).toBeCloseTo(2400);
  });
  it('grabs a ledge when walking off and climbs back', () => {
    const m = new Platformer();
    m.teleport(5.5, 2400, 0, home);
    let hung = false;
    for (let i = 0; i < 120; i++) {
      m.step(1 / 60, { dx: 1, dz: 0, jumpPressed: false, jumpHeld: false }, [home]);
      if (m.hanging) hung = true;
      if (hung) break;
    }
    expect(hung).toBe(true);
    for (let i = 0; i < 60; i++) m.step(1 / 60, { dx: -1, dz: 0, jumpPressed: false, jumpHeld: false }, [home]);
    expect(m.grounded).toBe(true);
  });
});
