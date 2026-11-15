import { describe, expect, it } from 'vitest';
import { heightAt } from '../src/world/terrain';
import { ATTRACTORS, MONOLITHS, PATH } from '../src/world/layout';
import { partial, registerScripture } from '@delivered/core';
import { scripture } from '../src/scripture';

describe('wretched layout', () => {
  it('keeps the walking path gentle until the hill', () => {
    for (let z = 0; z > PATH.law; z -= 2) {
      const slope = Math.abs(heightAt(0, z - 1) - heightAt(0, z + 1)) / 2;
      expect(slope).toBeLessThan(0.25);
    }
  });

  it('puts the light on a hill above the plain', () => {
    expect(heightAt(0, PATH.light)).toBeGreaterThan(heightAt(0, PATH.arena) + 8);
  });

  it('has a cliff on the right of the arena, and none on the path', () => {
    expect(heightAt(PATH.cliffX + 3, PATH.arena)).toBeLessThan(heightAt(PATH.cliffX - 1, PATH.arena) - 5);
    expect(Math.abs(heightAt(0, PATH.arena) - heightAt(4, PATH.arena))).toBeLessThan(1);
  });

  it('keeps attractors and monoliths off the cliff and beside the path', () => {
    for (const [x] of ATTRACTORS) expect(Math.abs(x)).toBeGreaterThan(5);
    for (const [x] of MONOLITHS) expect(Math.abs(x)).toBeGreaterThan(2.5);
  });
});

describe('wretched scripture', () => {
  it('serves partial quotations by reference', () => {
    registerScripture(scripture);
    expect(partial('Romans 7:24', 1, 'en')).toBe('Who will deliver me out of the body of this death?');
    expect(scripture.every((e) => e.partial && e.translation === 'WEB')).toBe(true);
  });
});
