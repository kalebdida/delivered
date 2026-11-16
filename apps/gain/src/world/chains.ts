// The wrist chains: core Verlet ropes from the wall rings to the manacles, drawn as instanced iron
// links (alternate links turned 90°). Each link can glow gold on its own, so a wave of light can
// run along the chain (CH2), and the whole chain can warm (after CH1).
import {
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { createRope, type Verlet } from '@delivered/core';
import { BENCH } from './layout';

const LINK = 0.072;
const UP = new Vector3(0, 1, 0);

export class Chain {
  readonly rope: Verlet;
  readonly mesh: InstancedMesh;
  readonly links: number;
  /** Per-link gold glow 0..1+ (the chapter writes it; decays on its own). */
  readonly glow: Float32Array;
  /** Base warmth everywhere on the chain, 0..1. */
  warmth = 0;
  private readonly glowAttr: InstancedBufferAttribute;
  private readonly mat: MeshStandardMaterial;
  private readonly prev: Float32Array;
  /** Average point speed in the last step (m/s), for rattle sounds and waves. */
  energy = 0;

  constructor(from: Vector3, to: Vector3, length: number) {
    const segments = Math.max(4, Math.round(length / LINK));
    this.links = segments;
    this.rope = createRope([from.x, from.y, from.z], [to.x, to.y, to.z], segments, { iterations: 14, damping: 0.982 });
    // Rest length so the whole chain is `length` long, whatever the start distance.
    for (const c of this.rope.constraints) c.rest = length / segments;
    this.rope.pin(0);
    this.rope.floorY = 0.015;
    this.prev = new Float32Array(this.rope.positions);

    const g = new TorusGeometry(LINK * 0.42, 0.0085, 6, 12);
    g.scale(0.62, 1, 1);
    this.mat = new MeshStandardMaterial({ color: '#34302c', roughness: 0.42, metalness: 0.7, emissive: new Color('#F5C76B'), emissiveIntensity: 1 });
    this.mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vGlow;');
    };
    this.mat.customProgramCacheKey = () => 'gain-chain';
    this.mesh = new InstancedMesh(g, this.mat, segments);
    this.glow = new Float32Array(segments);
    this.glowAttr = new InstancedBufferAttribute(new Float32Array(segments), 1);
    this.mesh.geometry.setAttribute('aGlow', this.glowAttr);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** Fix the first link to a wall ring. */
  attach(ring: Vector3): void {
    this.rope.pin(0, [ring.x, ring.y, ring.z]);
  }

  /** Let the wall end go: the chain hangs from the wrist and drags on the floor. */
  detach(): void {
    this.rope.unpin(0);
  }

  /** Move the free end (the wrist). */
  setEnd(p: Vector3): void {
    this.rope.pin(this.rope.count - 1, [p.x, p.y, p.z]);
  }

  /** Give every point a push (a shake). */
  impulse(x: number, y: number, z: number): void {
    const p = this.rope.positions;
    const q = this.rope.previous;
    for (let i = 1; i < this.rope.count - 1; i++) {
      const k = Math.sin((i / (this.rope.count - 1)) * Math.PI);
      q[i * 3] = p[i * 3]! - x * k;
      q[i * 3 + 1] = p[i * 3 + 1]! - y * k;
      q[i * 3 + 2] = p[i * 3 + 2]! - z * k;
    }
  }

  step(dt: number): void {
    this.rope.step(dt);
    // Rest on the stone ledge as well as the floor.
    const p = this.rope.positions;
    for (let i = 0; i < this.rope.count; i++) {
      const x = p[i * 3]!;
      const z = p[i * 3 + 2]!;
      if (x > BENCH.x0 && x < BENCH.x1 && z > BENCH.z0 && z < BENCH.z1 && p[i * 3 + 1]! < BENCH.height + 0.015) p[i * 3 + 1] = BENCH.height + 0.015;
    }
    let e = 0;
    for (let i = 0; i < p.length; i++) {
      const d = p[i]! - this.prev[i]!;
      e += d * d;
    }
    this.prev.set(p);
    this.energy = Math.sqrt(e / this.rope.count) / Math.max(dt, 1e-4);
  }

  update(dt: number): void {
    const p = this.rope.positions;
    const m = new Matrix4();
    const q = new Quaternion();
    const roll = new Quaternion();
    const a = new Vector3();
    const b = new Vector3();
    const mid = new Vector3();
    const s = new Vector3(1, 1, 1);
    for (let i = 0; i < this.links; i++) {
      a.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
      b.set(p[i * 3 + 3]!, p[i * 3 + 4]!, p[i * 3 + 5]!);
      mid.copy(a).add(b).multiplyScalar(0.5);
      const d = b.sub(a);
      const len = d.length() || 1e-4;
      q.setFromUnitVectors(UP, d.divideScalar(len));
      roll.setFromAxisAngle(UP, i % 2 ? Math.PI / 2 : 0);
      q.multiply(roll);
      s.set(1, Math.max(0.8, len / LINK), 1);
      m.compose(mid, q, s);
      this.mesh.setMatrixAt(i, m);
      this.glow[i] = Math.max(0, this.glow[i]! - dt * 0.9);
      this.glowAttr.setX(i, this.warmth * 0.35 + this.glow[i]! * 2.6);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glowAttr.needsUpdate = true;
  }

  /** World position of a point along the chain (0 ring .. 1 wrist). */
  pointAt(t: number, out = new Vector3()): Vector3 {
    const i = Math.round(t * (this.rope.count - 1));
    const p = this.rope.positions;
    return out.set(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
