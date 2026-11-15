import {
  DataTexture,
  FloatType,
  InstancedMesh,
  Matrix4,
  NearestFilter,
  Quaternion,
  RGBAFormat,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Rng } from './random';

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

/** Vector helpers that do not allocate. */
export const vec = {
  /** Exponential damp `a` toward `b` in place. */
  damp(a: Vector3, b: Vector3, lambda: number, dt: number): Vector3 {
    return a.lerp(b, 1 - Math.exp(-lambda * dt));
  },
  /** Limit the length of `v` in place. */
  clampLength(v: Vector3, max: number): Vector3 {
    const l = v.length();
    return l > max ? v.multiplyScalar(max / l) : v;
  },
  /** Distance on the XZ plane. */
  distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  },
  /** Angle in radians of an XZ direction, 0 = +Z. */
  heading(x: number, z: number): number {
    return Math.atan2(x, z);
  },
};

export interface InstanceTransform {
  position: Vector3 | [number, number, number];
  rotation?: Quaternion;
  scale?: number | Vector3;
}

/** Create an InstancedMesh and fill its matrices from a callback. */
export function createInstances(
  geometry: BufferGeometry,
  material: Material,
  count: number,
  place: (i: number) => InstanceTransform,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, count);
  for (let i = 0; i < count; i++) setInstance(mesh, i, place(i));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Write one instance transform. Remember `mesh.instanceMatrix.needsUpdate = true`. */
export function setInstance(mesh: InstancedMesh, i: number, t: InstanceTransform): void {
  if (Array.isArray(t.position)) _p.fromArray(t.position);
  else _p.copy(t.position);
  if (t.rotation) _q.copy(t.rotation);
  else _q.identity();
  if (typeof t.scale === 'number') _s.setScalar(t.scale);
  else if (t.scale) _s.copy(t.scale);
  else _s.setScalar(1);
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
}

/** Scatter helper: a random point on a disc of `radius` on the XZ plane. */
export function scatterDisc(rng: Rng, radius: number): [number, number, number] {
  const r = Math.sqrt(rng()) * radius;
  const a = rng() * Math.PI * 2;
  return [Math.cos(a) * r, 0, Math.sin(a) * r];
}

/**
 * Vertex-animation-texture helper. Bakes `frames` snapshots of `vertexCount` positions into a
 * float texture (one row per frame). Sample in a vertex shader with
 * `texture2D(vat, vec2((vertexId + 0.5) / vertexCount, (frame + 0.5) / frames)).xyz`.
 */
export function bakeVAT(
  vertexCount: number,
  frames: number,
  sample: (frame: number, out: Float32Array) => void,
): DataTexture {
  const data = new Float32Array(vertexCount * frames * 4);
  const row = new Float32Array(vertexCount * 3);
  for (let f = 0; f < frames; f++) {
    sample(f, row);
    for (let v = 0; v < vertexCount; v++) {
      const o = (f * vertexCount + v) * 4;
      data[o] = row[v * 3]!;
      data[o + 1] = row[v * 3 + 1]!;
      data[o + 2] = row[v * 3 + 2]!;
      data[o + 3] = 1;
    }
  }
  const tex = new DataTexture(data, vertexCount, frames, RGBAFormat, FloatType);
  tex.minFilter = tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}
