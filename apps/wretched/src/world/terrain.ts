// The ash plain: one displaced mesh, a footprint/groove trail texture, monolith light pools and
// the colour wave of deliverance, all in one patched MeshStandardMaterial.
import {
  BufferAttribute, Color, DataTexture, LinearFilter, Mesh, MeshStandardMaterial, PlaneGeometry, RGFormat,
  UnsignedByteType, Vector2, Vector3, Vector4,
} from 'three';
import { createNoise, smoothstep } from '@delivered/core';
import { PATH } from './layout';

const noise = createNoise('wretched-ash');

/** Ground height at a world XZ point. Gentle on the path, dunes off it, the hill at the end, a cliff in the arena. */
export function heightAt(x: number, z: number): number {
  const ax = Math.abs(x);
  const off = smoothstep(5, 38, ax);
  let h = noise.fbm2(x * 0.025, z * 0.025, 4) * (0.5 + off * 7) + noise.noise2(x * 0.22, z * 0.22) * 0.06;
  // Hill under the light.
  const dz = z - PATH.light;
  h += 15 * Math.exp(-(dz * dz) / (2 * 34 * 34)) * Math.exp(-(x * x) / (2 * 40 * 40));
  // A cliff edge on the right of the struggle arena.
  const zw = smoothstep(PATH.arena + 26, PATH.arena + 14, z) * smoothstep(PATH.arena - 30, PATH.arena - 16, z);
  h -= 9 * smoothstep(PATH.cliffX, PATH.cliffX + 1.6, x) * zw;
  return h;
}

/** Trail texture: R = footprints and grooves (pressed), G = warmth left by grace. */
export class Trail {
  readonly texture: DataTexture;
  private readonly data: Uint8Array;
  readonly w: number;
  readonly h: number;
  /** World rectangle covered: x0, z0 (near), size x, size z. */
  readonly rect = new Vector4(-24, 30, 48, -330);
  private dirty = false;
  private lastUpload = 0;

  constructor(texelsPerMetre: number) {
    this.w = Math.round(48 * texelsPerMetre);
    this.h = Math.round(330 * texelsPerMetre);
    this.data = new Uint8Array(this.w * this.h * 2);
    this.texture = new DataTexture(this.data, this.w, this.h, RGFormat, UnsignedByteType);
    this.texture.magFilter = this.texture.minFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** Press an oval into the ground. `angle` is the heading, `channel` 0 = press, 1 = gold. */
  stamp(x: number, z: number, rx: number, rz: number, angle: number, strength = 1, channel = 0): void {
    const u = ((x - this.rect.x) / this.rect.z) * this.w;
    const v = ((z - this.rect.y) / this.rect.w) * this.h;
    const sx = (rx / this.rect.z) * this.w;
    const sz = (rz / -this.rect.w) * this.h;
    const r = Math.ceil(Math.max(sx, sz)) + 1;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const px = Math.round(u) + i;
        const py = Math.round(v) + j;
        if (px < 0 || py < 0 || px >= this.w || py >= this.h) continue;
        const lx = (i * c - j * s) / Math.max(sx, 0.5);
        const lz = (i * s + j * c) / Math.max(sz, 0.5);
        const d = lx * lx + lz * lz;
        if (d > 1) continue;
        const k = (px + py * this.w) * 2 + channel;
        this.data[k] = Math.min(255, Math.max(this.data[k]!, Math.round(255 * strength * (1 - d * d))));
      }
    }
    this.dirty = true;
  }

  /** Upload at most a few times a second. */
  update(time: number): void {
    if (this.dirty && time - this.lastUpload > 0.2) {
      this.texture.needsUpdate = true;
      this.dirty = false;
      this.lastUpload = time;
    }
  }

  clear(): void {
    this.data.fill(0);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

export interface TerrainUniforms {
  uTrail: { value: DataTexture };
  uTrailRect: { value: Vector4 };
  uWaveCenter: { value: Vector2 };
  uWave: { value: number };
  uPools: { value: Vector4[] };
  uPoolColor: { value: Color };
  uTime: { value: number };
}

export const MAX_POOLS = 6;

export function createTerrain(segX: number, segZ: number, trail: Trail): { mesh: Mesh; uniforms: TerrainUniforms; material: MeshStandardMaterial } {
  const geo = new PlaneGeometry(120, 340, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 30 - 170);
  const pos = geo.attributes.position as BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const uniforms: TerrainUniforms = {
    uTrail: { value: trail.texture },
    uTrailRect: { value: trail.rect },
    uWaveCenter: { value: new Vector2(0, 0) },
    uWave: { value: -1 },
    uPools: { value: Array.from({ length: MAX_POOLS }, () => new Vector4(0, 0, 1, 0)) },
    uPoolColor: { value: new Color('#E8F1FF') },
    uTime: { value: 0 },
  };
  const material = new MeshStandardMaterial({ color: '#9A968F', roughness: 0.97, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform sampler2D uTrail; uniform vec4 uTrailRect; uniform vec2 uWaveCenter; uniform float uWave, uTime;
        uniform vec4 uPools[${MAX_POOLS}]; uniform vec3 uPoolColor;
        float th(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(th(i), th(i+vec2(1,0)), f.x), mix(th(i+vec2(0,1)), th(i+vec2(1,1)), f.x), f.y); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 tuv = vec2((vWPos.x - uTrailRect.x) / uTrailRect.z, (vWPos.z - uTrailRect.y) / uTrailRect.w);
        vec2 tr = (tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0) ? texture2D(uTrail, tuv).rg : vec2(0.0);
        float grain = vn(vWPos.xz * 3.1) * 0.6 + vn(vWPos.xz * 0.35) * 0.4;
        diffuseColor.rgb *= 0.86 + grain * 0.22;
        diffuseColor.rgb *= 1.0 - tr.r * 0.42;
        // The colour wave of deliverance: warm ochre and a hint of green life behind the front.
        float wd = distance(vWPos.xz, uWaveCenter);
        float behind = uWave > 0.0 ? smoothstep(uWave, uWave - 14.0, wd) : 0.0;
        vec3 warm = mix(vec3(0.72, 0.6, 0.44), vec3(0.55, 0.6, 0.42), vn(vWPos.xz * 0.12));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * warm * 1.45, behind);
        float front = uWave > 0.0 ? exp(-pow((wd - uWave) * 0.35, 2.0)) : 0.0;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        for (int i = 0; i < ${MAX_POOLS}; i++) {
          vec4 p = uPools[i];
          float d = distance(vWPos.xz, p.xy) / p.z;
          totalEmissiveRadiance += uPoolColor * p.w * 0.16 * smoothstep(1.0, 0.0, d) * (0.85 + 0.15 * sin(uTime * 0.7 + float(i)));
        }
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * (front * 0.55 + tr.g * 0.5);`,
      );
  };
  material.customProgramCacheKey = () => 'wretched-terrain';
  const mesh = new Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, uniforms, material };
}

/** Coarse collision mesh around the path for the double's ragdoll (Rapier trimesh). */
export function collisionMesh(): { vertices: Float32Array; indices: Uint32Array } {
  const x0 = -22;
  const x1 = 22;
  const z0 = 28;
  const z1 = PATH.light - 10;
  const step = 1;
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z0 - z1) / step) + 1;
  const vertices = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 - j * step;
      const k = (i + j * nx) * 3;
      vertices[k] = x;
      vertices[k + 1] = heightAt(x, z);
      vertices[k + 2] = z;
    }
  }
  const indices = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let n = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = i + j * nx;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], n);
      n += 6;
    }
  }
  return { vertices, indices };
}

/** Unused helper kept tiny: a normal at a point (for placing things flush with the ground). */
export function normalAt(x: number, z: number, out = new Vector3()): Vector3 {
  const e = 0.3;
  return out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e)).normalize();
}

