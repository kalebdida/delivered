import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshStandardMaterial, Scene } from 'three';
import { HeightFog } from '../src/atmosphere/fog';

describe('HeightFog program cache keys', () => {
  it('keeps materials with different prior patches on different programs', () => {
    const fog = new HeightFog(new Scene());
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    a.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('void main', '// a\nvoid main'); };
    b.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('void main', '// b\nvoid main'); };
    fog.apply(a);
    fog.apply(b);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).toContain('heightFog');
  });

  it('gives unpatched materials one shared fog key that differs from the plain key', () => {
    const fog = new HeightFog(new Scene());
    const plain = new MeshStandardMaterial().customProgramCacheKey();
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    fog.apply(a);
    fog.apply(b);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    expect(a.customProgramCacheKey()).not.toBe(plain);
  });

  it('extends a key the material already set itself', () => {
    const fog = new HeightFog(new Scene());
    const m = new MeshBasicMaterial();
    m.customProgramCacheKey = () => 'room-glow';
    fog.apply(m);
    expect(m.customProgramCacheKey()).toBe('room-glow+heightFog');
  });

  it('patches each material once', () => {
    const fog = new HeightFog(new Scene());
    const m = new MeshStandardMaterial();
    fog.apply(m);
    const key = m.customProgramCacheKey();
    fog.apply(m);
    expect(m.customProgramCacheKey()).toBe(key);
  });
});
