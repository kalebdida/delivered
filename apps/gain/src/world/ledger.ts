// CH1's ledger: the things people live for, each with its own short life and its own way of
// failing; the ash they leave; the carved ζημία (LOSS) column it slides into; and the column of
// light, κέρδος (GAIN), that appears beside it when the visitor steps into the beam.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { clamp, easing, glsl, seededRandom, smoothstep } from '@delivered/core';
import type { LedgerId } from '../logic/sentence';
import { text3d } from './text3d';

// ---------------------------------------------------------------------------------------------
// Dissolve: any standard material can burn away into ash along a noise front.
// ---------------------------------------------------------------------------------------------

export interface Dissolve {
  amount: { value: number };
  edge: { value: Color };
}

/** Patch a standard material so `amount` 0..1 eats it away with a glowing edge. */
export function dissolvable(mat: MeshStandardMaterial, edge = '#8a8580', scale = 9): Dissolve {
  const d: Dissolve = { amount: { value: 0 }, edge: { value: new Color(edge) } };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = d.amount;
    shader.uniforms.uDissolveEdge = d.edge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uDissolve; uniform vec3 uDissolveEdge; varying vec3 vDisPos;\n${glsl.hash}\n${glsl.simplex3D}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float dn = snoise(vDisPos * ${scale.toFixed(1)}) * 0.5 + 0.5;
        if (dn < uDissolve * 1.08 - 0.04) discard;
        float de = 1.0 - smoothstep(0.0, 0.06, dn - (uDissolve * 1.08 - 0.04));
        totalEmissiveRadiance += uDissolveEdge * de * step(0.001, uDissolve) * 1.6;`,
      );
  };
  mat.customProgramCacheKey = () => `gain-dissolve-${scale}`;
  return d;
}

// ---------------------------------------------------------------------------------------------
// Ash: CPU particles with a few behaviours, then a stream into the column.
// ---------------------------------------------------------------------------------------------

export type AshMode = 'sand' | 'flutter' | 'puff' | 'flake' | 'chunk';

const ASH_MAX = 2400;

export class AshField {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly vel = new Float32Array(ASH_MAX * 3);
  private readonly life = new Float32Array(ASH_MAX);
  private readonly mode = new Uint8Array(ASH_MAX);
  private readonly seed = new Float32Array(ASH_MAX);
  /** Gathering: start point, control point, progress, delay. */
  private readonly from = new Float32Array(ASH_MAX * 3);
  private readonly gatherT = new Float32Array(ASH_MAX).fill(-1);
  private readonly delay = new Float32Array(ASH_MAX);
  private target = new Vector3();
  private head = 0;
  private readonly mat: ShaderMaterial;
  private readonly rng = seededRandom('ash');
  /** Called once for each particle that reaches the column. */
  onArrive: (() => void) | null = null;

  constructor() {
    const g = new BufferGeometry();
    this.pos = new Float32Array(ASH_MAX * 3).fill(-999);
    this.col = new Float32Array(ASH_MAX * 3);
    this.size = new Float32Array(ASH_MAX);
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; uniform float uPixelRatio; varying vec3 vColor; varying float vA;
        void main(){ vColor = aColor; vA = step(0.001, aSize);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uPixelRatio * (4.0 / max(-mv.z, 0.3)); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * vA; if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a * 0.9); }`,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 14;
  }

  /** Spawn one particle. */
  emit(p: Vector3, v: Vector3, color: Color, mode: AshMode, size = 3): void {
    const i = this.head;
    this.head = (this.head + 1) % ASH_MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.col.set([color.r, color.g, color.b], i * 3);
    this.size[i] = size;
    this.life[i] = 0;
    this.mode[i] = ['sand', 'flutter', 'puff', 'flake', 'chunk'].indexOf(mode);
    this.seed[i] = this.rng();
    this.gatherT[i] = -1;
  }

  /** Send everything that is still drifting into the column's mouth. */
  gather(target: Vector3, spread = 1.4): void {
    this.target.copy(target);
    for (let i = 0; i < ASH_MAX; i++) {
      if (this.size[i]! <= 0 || this.gatherT[i]! >= 0) continue;
      this.from.set([this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!], i * 3);
      this.gatherT[i] = 0;
      this.delay[i] = this.rng() * spread;
    }
  }

  get active(): number {
    let n = 0;
    for (let i = 0; i < ASH_MAX; i++) if (this.size[i]! > 0) n++;
    return n;
  }

  update(dt: number, floorAt: (x: number, z: number) => number): void {
    const p = this.pos;
    const v = this.vel;
    for (let i = 0; i < ASH_MAX; i++) {
      if (this.size[i]! <= 0) continue;
      const o = i * 3;
      this.life[i]! += dt;
      if (this.gatherT[i]! >= 0) {
        if (this.delay[i]! > 0) {
          this.delay[i]! -= dt;
          continue;
        }
        const t = (this.gatherT[i] = Math.min(1, this.gatherT[i]! + dt * 0.75));
        const e = easing.inOutCubic(t);
        // Arc: up and over, then down into the column's mouth.
        const fx = this.from[o]!;
        const fy = this.from[o + 1]!;
        const fz = this.from[o + 2]!;
        const cx = (fx + this.target.x) / 2;
        const cy = Math.max(fy, this.target.y) + 0.5 + this.seed[i]! * 0.25;
        const cz = (fz + this.target.z) / 2;
        const a = (1 - e) * (1 - e);
        const b = 2 * (1 - e) * e;
        const c = e * e;
        p[o] = a * fx + b * cx + c * this.target.x + Math.sin(this.seed[i]! * 40 + t * 6) * 0.03 * (1 - t);
        p[o + 1] = a * fy + b * cy + c * this.target.y;
        p[o + 2] = a * fz + b * cz + c * this.target.z;
        if (t >= 1) {
          this.size[i] = 0;
          p[o + 1] = -999;
          this.onArrive?.();
        }
        continue;
      }
      const m = this.mode[i]!;
      const s = this.seed[i]!;
      const life = this.life[i]!;
      if (m === 0) {
        v[o + 1]! -= 4.5 * dt;
      } else if (m === 1) {
        v[o + 1] = -0.28 - s * 0.1;
        v[o] = Math.sin(life * 3 + s * 20) * 0.35;
        v[o + 2] = Math.cos(life * 2.3 + s * 13) * 0.2;
      } else if (m === 2) {
        v[o + 1]! -= 0.35 * dt;
        v[o]! *= 1 - dt * 1.5;
        v[o + 1]! *= 1 - dt * 1.2;
        v[o + 2]! *= 1 - dt * 1.5;
      } else if (m === 3) {
        v[o + 1] = -0.18 - s * 0.12;
        v[o] = Math.sin(life * 2.1 + s * 30) * 0.18;
      } else {
        v[o + 1]! -= 7.5 * dt;
      }
      p[o]! += v[o]! * dt;
      p[o + 1]! += v[o + 1]! * dt;
      p[o + 2]! += v[o + 2]! * dt;
      const floor = floorAt(p[o]!, p[o + 2]!) + 0.01 + s * 0.015;
      if (p[o + 1]! < floor) {
        p[o + 1] = floor;
        v[o] = v[o + 1] = v[o + 2] = 0;
      }
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.aColor!.needsUpdate = true;
    g.attributes.aSize!.needsUpdate = true;
  }

  clear(): void {
    this.size.fill(0);
    this.pos.fill(-999);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}

// ---------------------------------------------------------------------------------------------
// The objects.
// ---------------------------------------------------------------------------------------------

/** Samples on an object's surface (world space), for emitting ash where it actually is. */
function surfacePoints(obj: Object3D, n: number, rng: () => number): Vector3[] {
  const out: Vector3[] = [];
  const meshes: Mesh[] = [];
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if ((o as Mesh).isMesh && o.visible) meshes.push(o as Mesh);
  });
  if (!meshes.length) return out;
  for (let i = 0; i < n; i++) {
    const m = meshes[Math.floor(rng() * meshes.length)]!;
    const pos = m.geometry.attributes.position!;
    const k = Math.floor(rng() * pos.count);
    out.push(new Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(m.matrixWorld));
  }
  return out;
}

interface Part {
  mesh: Mesh;
  mat: MeshStandardMaterial;
  dissolve: Dissolve;
  base: Color;
  aged: Color;
}

export abstract class LedgerObject {
  abstract readonly id: LedgerId;
  readonly group = new Group();
  /** Inner group the life animates (the outer one floats and is dragged). */
  readonly body = new Group();
  readonly home = new Vector3();
  /** Picking radius. */
  radius = 0.17;
  /** 0..1 hover/focus glow. */
  focus = 0;
  /** True once its life has been lived. */
  spent = false;
  protected parts: Part[] = [];
  protected rng = seededRandom('ledger');
  protected t = Math.random() * 10;
  /** Ash colour and behaviour. */
  protected ashColor = new Color('#7a7470');
  protected ashMode: AshMode = 'sand';

  constructor() {
    this.group.add(this.body);
  }

  protected part(mesh: Mesh, color: string, aged: string, opts: { metal?: number; rough?: number; emissive?: string; ei?: number; edge?: string; scale?: number } = {}): Mesh {
    const mat = new MeshStandardMaterial({
      color,
      metalness: opts.metal ?? 0,
      roughness: opts.rough ?? 0.6,
      emissive: opts.emissive ?? '#000000',
      emissiveIntensity: opts.ei ?? 1,
    });
    mesh.material = mat;
    mesh.castShadow = true;
    const dissolve = dissolvable(mat, opts.edge ?? '#6e6a66', opts.scale ?? 9);
    this.parts.push({ mesh, mat, dissolve, base: new Color(color), aged: new Color(aged) });
    this.body.add(mesh);
    return mesh;
  }

  /** Idle float. */
  idle(dt: number): void {
    this.t += dt;
    this.body.position.y = Math.sin(this.t * 0.9) * 0.025;
    this.body.rotation.y += dt * 0.25;
    const glow = 0.04 + this.focus * 0.4;
    for (const p of this.parts) if (p.mat.emissive.getHex() === 0) p.mat.emissiveIntensity = glow;
  }

  /** The life at its height: warm and glowing (0..1). */
  flourish(v: number): void {
    this.body.scale.setScalar(1 + v * 0.3);
    for (const p of this.parts) {
      if (!p.mat.userData.emissiveSet) {
        p.mat.userData.emissiveSet = true;
        p.mat.userData.baseEmissive = p.mat.emissive.clone();
        p.mat.userData.baseEI = p.mat.emissiveIntensity;
      }
      p.mat.emissive.copy(p.mat.userData.baseEmissive as Color).lerp(new Color('#ffb25c'), v * 0.25);
    }
  }

  /** The years: colour drains toward its aged look (0..1). */
  age(v: number): void {
    for (const p of this.parts) p.mat.color.copy(p.base).lerp(p.aged, v);
  }

  /** Its own way of failing, `v` 0..1 over about three seconds. Emits ash as it goes. */
  abstract crumble(v: number, dt: number, ash: AshField): void;

  /** Shared helper: dissolve every part and shed ash proportionally. */
  protected shed(v: number, dt: number, ash: AshField, rate = 220, mode: AshMode = this.ashMode, size = 2.6): void {
    for (const p of this.parts) p.dissolve.amount.value = clamp(v);
    if (v <= 0 || v >= 1.02) return;
    const n = Math.round(rate * dt * (1.2 - v));
    for (const s of surfacePoints(this.body, n, this.rng)) {
      const vel = new Vector3((this.rng() - 0.5) * 0.3, (this.rng() - 0.3) * 0.25, (this.rng() - 0.5) * 0.3);
      if (mode === 'puff') vel.multiplyScalar(2.5).add(new Vector3(0, 0.25, 0));
      ash.emit(s, vel, this.ashColor.clone().multiplyScalar(0.8 + this.rng() * 0.4), mode, size * (0.6 + this.rng() * 0.8));
    }
  }

  /** Quietly dissolve away with a gold edge (what is left when the sentence completes). */
  fade(v: number): void {
    for (const p of this.parts) {
      p.dissolve.amount.value = Math.max(p.dissolve.amount.value, v);
      p.dissolve.edge.value.set('#F5C76B');
    }
    if (v >= 1) this.group.visible = false;
  }

  /** Return to a fresh state (replay). */
  reset(): void {
    this.spent = false;
    this.body.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.group.visible = true;
    for (const p of this.parts) {
      p.dissolve.amount.value = 0;
      p.mat.color.copy(p.base);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}

/** Coins: tarnish, slide off the stack one by one and dissolve as they fall. */
class Coins extends LedgerObject {
  readonly id = 'coins';
  private coins: Mesh[] = [];
  private fallAt: number[] = [];
  constructor() {
    super();
    this.ashColor.set('#6f6a55');
    for (let i = 0; i < 11; i++) {
      const c = this.part(new Mesh(new CylinderGeometry(0.048, 0.048, 0.009, 24)), '#d9a440', '#3f4a40', { metal: 0.85, rough: 0.32, edge: '#b48a3c', scale: 26 });
      c.position.set((this.rng() - 0.5) * 0.012, -0.05 + i * 0.0105, (this.rng() - 0.5) * 0.012);
      c.rotation.y = this.rng() * 6;
      this.coins.push(c);
      this.fallAt.push(0.05 + (1 - i / 10) * 0.55 + this.rng() * 0.05);
    }
    // Two loose coins leaning on the stack.
    for (let i = 0; i < 2; i++) {
      const c = this.part(new Mesh(new CylinderGeometry(0.048, 0.048, 0.009, 24)), '#d9a440', '#3f4a40', { metal: 0.85, rough: 0.32, edge: '#b48a3c', scale: 26 });
      c.position.set(i ? 0.06 : -0.065, -0.03, 0.02);
      c.rotation.set(0.2, 0, i ? -1.2 : 1.15);
      this.coins.push(c);
      this.fallAt.push(0.02 + i * 0.05);
    }
  }
  crumble(v: number, dt: number, ash: AshField): void {
    this.coins.forEach((c, i) => {
      const k = clamp((v - this.fallAt[i]!) / 0.35);
      if (k <= 0) return;
      const side = i % 2 ? 1 : -1;
      c.position.x += side * dt * 0.12 * (1 - k);
      c.position.y -= dt * k * 0.55;
      c.rotation.z += side * dt * 2.2 * (1 - k * 0.5);
      const part = this.parts[i]!;
      part.dissolve.amount.value = k;
      if (k > 0.05 && k < 1) {
        for (let n = 0; n < 3; n++) {
          const p = c.getWorldPosition(new Vector3()).add(new Vector3((this.rng() - 0.5) * 0.08, 0, (this.rng() - 0.5) * 0.08));
          ash.emit(p, new Vector3((this.rng() - 0.5) * 0.1, -0.2, (this.rng() - 0.5) * 0.1), new Color('#8a7d58').multiplyScalar(0.7 + this.rng() * 0.6), 'sand', 2.2);
        }
      }
    });
  }
}

/** The laurel crown: the leaves brown and fall one by one, fluttering, then the twig gives. */
class Laurel extends LedgerObject {
  readonly id = 'laurel';
  private leaves: { m: Mesh; at: number; spin: number; drift: Vector3 }[] = [];
  private twig: Mesh;
  constructor() {
    super();
    this.radius = 0.19;
    this.ashColor.set('#6b6046');
    this.ashMode = 'flutter';
    this.twig = this.part(new Mesh(new TorusGeometry(0.11, 0.006, 6, 40)), '#c9a24a', '#4a3d2a', { metal: 0.6, rough: 0.4 });
    this.twig.rotation.x = Math.PI / 2;
    const leafShape = new Shape();
    leafShape.moveTo(0, 0);
    leafShape.quadraticCurveTo(0.018, 0.03, 0, 0.07);
    leafShape.quadraticCurveTo(-0.018, 0.03, 0, 0);
    const leafGeo = new ExtrudeGeometry(leafShape, { depth: 0.002, bevelEnabled: false });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      const m = this.part(new Mesh(leafGeo), '#b9a046', '#5a4a2c', { metal: 0.5, rough: 0.45, edge: '#8a7a4a', scale: 40 });
      m.position.set(Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11);
      m.rotation.set(-Math.PI / 2 + 0.25 + side * 0.5, -a + Math.PI / 2, side * 0.6);
      (m.material as MeshStandardMaterial).side = DoubleSide;
      this.leaves.push({ m, at: 0.03 + (i / 26) * 0.6 + this.rng() * 0.05, spin: (this.rng() - 0.5) * 6, drift: new Vector3((this.rng() - 0.5) * 0.2, 0, (this.rng() - 0.5) * 0.2) });
    }
  }
  crumble(v: number, dt: number, ash: AshField): void {
    for (const l of this.leaves) {
      const k = clamp((v - l.at) / 0.4);
      if (k <= 0) continue;
      l.m.position.y -= dt * (0.12 + k * 0.25);
      l.m.position.x += (l.drift.x + Math.sin(this.t * 4 + l.spin) * 0.25) * dt;
      l.m.position.z += l.drift.z * dt;
      l.m.rotation.z += l.spin * dt;
      l.m.rotation.x += l.spin * 0.5 * dt;
      const p = this.parts.find((q) => q.mesh === l.m)!;
      p.dissolve.amount.value = smoothstep(0.45, 1, k);
      if (k > 0.5 && k < 1 && this.rng() < 0.6) ash.emit(l.m.getWorldPosition(new Vector3()), new Vector3(0, -0.2, 0), this.ashColor, 'flutter', 2.6);
    }
    const tk = clamp((v - 0.6) / 0.4);
    this.parts[0]!.dissolve.amount.value = tk;
    this.twig.scale.set(1, 1, 1 - tk * 0.3);
    if (tk > 0 && tk < 1) for (const s of surfacePoints(this.twig, 2, this.rng)) ash.emit(s, new Vector3(0, -0.1, 0), this.ashColor, 'flake', 2.4);
  }
}

/** The cushion: it sighs flat, its colour drains, and it goes to dust in a slow puff. */
class Cushion extends LedgerObject {
  readonly id = 'cushion';
  constructor() {
    super();
    this.radius = 0.2;
    this.ashColor.set('#6a5c5e');
    this.ashMode = 'puff';
    const g = new BoxGeometry(0.26, 0.09, 0.2, 10, 4, 8);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 0.13;
      const z = pos.getZ(i) / 0.1;
      const puff = (1 - x * x * 0.7) * (1 - z * z * 0.7);
      pos.setY(i, pos.getY(i) * (0.4 + puff * 0.9));
    }
    g.computeVertexNormals();
    this.part(new Mesh(g), '#7a2232', '#4d4547', { rough: 0.85, edge: '#7b6f70', scale: 14 });
    for (const [x, z] of [[-0.13, -0.1], [0.13, -0.1], [-0.13, 0.1], [0.13, 0.1]] as const) {
      const tassel = this.part(new Mesh(new SphereGeometry(0.014, 8, 6)), '#d4a346', '#5c5448', { metal: 0.4, rough: 0.5 });
      tassel.position.set(x, 0, z);
    }
  }
  crumble(v: number, dt: number, ash: AshField): void {
    const deflate = easing.outCubic(clamp(v / 0.45));
    this.body.scale.y = Math.max(0.12, 1.3 - deflate * 1.05);
    this.body.scale.x = this.body.scale.z = 1.3 + deflate * 0.12;
    this.body.rotation.z = Math.sin(this.t * 7) * 0.02 * (1 - deflate);
    this.shed(clamp((v - 0.35) / 0.65), dt, ash, 200, 'puff', 3.2);
  }
}

/** The scroll of credentials: the seal cracks and drops, the scroll splits into flakes. */
class Scroll extends LedgerObject {
  readonly id = 'scroll';
  private seal: Mesh;
  private sealFall = 0;
  constructor() {
    super();
    this.radius = 0.19;
    this.ashColor.set('#7d7362');
    this.ashMode = 'flake';
    const roll = this.part(new Mesh(new CylinderGeometry(0.035, 0.035, 0.28, 24)), '#e2cfa2', '#7d6a4a', { rough: 0.8, edge: '#a08a60', scale: 16 });
    roll.rotation.z = Math.PI / 2;
    const flap = this.part(new Mesh(new PlaneGeometry(0.24, 0.1)), '#e8d8b0', '#806c4c', { rough: 0.85, edge: '#a08a60', scale: 16 });
    (flap.material as MeshStandardMaterial).side = DoubleSide;
    flap.position.set(0, -0.045, 0.04);
    flap.rotation.x = -0.9;
    for (const s of [-1, 1]) {
      const knob = this.part(new Mesh(new CylinderGeometry(0.012, 0.012, 0.05, 10)), '#4a2e1c', '#2e2622', { rough: 0.6 });
      knob.rotation.z = Math.PI / 2;
      knob.position.x = s * 0.165;
    }
    const ribbon = this.part(new Mesh(new TorusGeometry(0.037, 0.005, 6, 24)), '#8a1f2a', '#4b3c3c', { rough: 0.7 });
    ribbon.rotation.y = Math.PI / 2;
    this.seal = this.part(new Mesh(new CylinderGeometry(0.022, 0.024, 0.008, 18)), '#9a1c22', '#3e3535', { rough: 0.35, emissive: '#000000', edge: '#7a2a2a', scale: 30 });
    this.seal.rotation.x = Math.PI / 2;
    this.seal.position.set(0, 0, 0.041);
  }
  crumble(v: number, dt: number, ash: AshField): void {
    // The seal splits and falls first.
    if (v > 0.08) {
      this.sealFall += dt;
      this.seal.position.y -= this.sealFall * dt * 2.2;
      this.seal.rotation.z += dt * 3;
      const sp = this.parts.find((p) => p.mesh === this.seal)!;
      sp.dissolve.amount.value = clamp(this.sealFall / 0.9);
    }
    const k = clamp((v - 0.2) / 0.8);
    for (const p of this.parts) if (p.mesh !== this.seal) p.dissolve.amount.value = k;
    if (k > 0 && k < 1) {
      for (const s of surfacePoints(this.body, Math.round(160 * dt), this.rng)) {
        ash.emit(s, new Vector3((this.rng() - 0.5) * 0.15, -0.05, (this.rng() - 0.5) * 0.15), new Color('#8c8068').multiplyScalar(0.7 + this.rng() * 0.5), 'flake', 3.4);
      }
    }
  }
}

/** The burning heart: its fire cools to grey stone, cracks glow and fade, and it breaks. */
class Heart extends LedgerObject {
  readonly id = 'heart';
  private ember: Part;
  constructor() {
    super();
    this.ashColor.set('#5f5a58');
    this.ashMode = 'chunk';
    const s = new Shape();
    s.moveTo(0, -0.07);
    s.bezierCurveTo(0.02, -0.04, 0.09, -0.01, 0.075, 0.035);
    s.bezierCurveTo(0.065, 0.075, 0.015, 0.075, 0, 0.04);
    s.bezierCurveTo(-0.015, 0.075, -0.065, 0.075, -0.075, 0.035);
    s.bezierCurveTo(-0.09, -0.01, -0.02, -0.04, 0, -0.07);
    const g = new ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 4, curveSegments: 18 });
    g.center();
    this.part(new Mesh(g), '#b8382c', '#5a5654', { rough: 0.45, emissive: '#ff4a1a', ei: 0.6, edge: '#ff7a3a', scale: 22 });
    this.ember = this.parts[0]!;
  }
  override idle(dt: number): void {
    super.idle(dt);
    this.body.rotation.y = Math.sin(this.t * 0.6) * 0.5;
    // A slow heartbeat in the glow.
    const beat = Math.pow(Math.max(0, Math.sin(this.t * 2.4)), 6);
    this.ember.mat.emissiveIntensity = 0.45 + beat * 0.6;
  }
  override age(v: number): void {
    super.age(v);
    this.ember.mat.emissiveIntensity = 0.6 * (1 - v * 0.85);
    this.ember.mat.emissive.set('#ff5a2a').lerp(new Color('#6a2a1a'), v);
  }
  crumble(v: number, dt: number, ash: AshField): void {
    this.ember.mat.emissiveIntensity = Math.max(0, 0.2 * (1 - v * 3));
    this.body.position.y -= dt * 0.05 * v;
    this.shed(easing.inQuad(v), dt, ash, 180, 'chunk', 3.6);
  }
}

/** The mirror: it fogs, cracks, and runs out of its frame as sand. */
class Mirror extends LedgerObject {
  readonly id = 'mirror';
  private glass: Part;
  private crackMat: ShaderMaterial;
  constructor() {
    super();
    this.radius = 0.18;
    this.ashColor.set('#a6a29a');
    this.ashMode = 'sand';
    const frame = this.part(new Mesh(new TorusGeometry(0.085, 0.012, 10, 40)), '#c39a4c', '#4b4438', { metal: 0.8, rough: 0.35 });
    frame.scale.set(0.82, 1.1, 1);
    const handle = this.part(new Mesh(new CylinderGeometry(0.01, 0.014, 0.09, 10)), '#b08a42', '#4b4438', { metal: 0.8, rough: 0.35 });
    handle.position.y = -0.135;
    const glass = this.part(new Mesh(new CylinderGeometry(0.085, 0.085, 0.004, 40)), '#c8d0d8', '#9a9894', { metal: 0.95, rough: 0.06, emissive: '#30343c', ei: 0.6, edge: '#e8e2d4', scale: 34 });
    glass.rotation.x = Math.PI / 2;
    glass.scale.set(0.82, 1, 1.1);
    this.glass = this.parts[this.parts.length - 1]!;
    this.crackMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uCrack: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `uniform float uCrack; varying vec2 vUv;
        ${glsl.hash}
        void main(){
          vec2 p = (vUv - 0.5) * 7.0; vec2 c = vec2(0.6, 0.3);
          vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
          float edge = 1.0 - smoothstep(0.0, 0.06, d2 - d1);
          float reach = smoothstep(uCrack * 0.9, uCrack * 0.9 - 0.25, length(vUv - c) * 1.4);
          float a = edge * reach * step(length(vUv - 0.5), 0.5);
          gl_FragColor = vec4(vec3(0.92, 0.9, 0.86), a * 0.9);
        }`,
    });
    const crack = new Mesh(new PlaneGeometry(0.15, 0.19), this.crackMat);
    crack.position.z = 0.003;
    this.body.add(crack);
    this.crackMat.userData.mesh = crack;
  }
  override age(v: number): void {
    super.age(v);
    // Fogging: the silvering clouds over.
    this.glass.mat.roughness = 0.06 + v * 0.7;
    this.glass.mat.metalness = 0.95 - v * 0.6;
  }
  crumble(v: number, dt: number, ash: AshField): void {
    this.crackMat.uniforms.uCrack!.value = clamp(v / 0.35);
    const k = clamp((v - 0.35) / 0.65);
    (this.crackMat.userData.mesh as Mesh).visible = k < 0.35;
    this.glass.dissolve.amount.value = k;
    for (const p of this.parts) if (p !== this.glass) p.dissolve.amount.value = clamp((v - 0.6) / 0.4);
    if (k > 0 && k < 1) {
      for (let n = 0; n < Math.round(300 * dt); n++) {
        const s = this.glass.mesh.getWorldPosition(new Vector3()).add(new Vector3((this.rng() - 0.5) * 0.12, (this.rng() - 0.5) * 0.16 - 0.04, 0));
        ash.emit(s, new Vector3((this.rng() - 0.5) * 0.04, -0.3, (this.rng() - 0.5) * 0.04), new Color('#c9c3b6').multiplyScalar(0.6 + this.rng() * 0.6), 'sand', 1.8);
      }
    }
  }
  override reset(): void {
    super.reset();
    this.crackMat.uniforms.uCrack!.value = 0;
    (this.crackMat.userData.mesh as Mesh).visible = true;
  }
}

/** A sheet of papyrus for the visitor's own word. The ink fades, the sheet browns and flakes. */
export class Written extends LedgerObject {
  readonly id = 'written';
  private word = text3d('', { size: 0.036, color: '#2a1d12', font: 'italic' });
  constructor() {
    super();
    this.radius = 0.17;
    this.ashColor.set('#6e6252');
    this.ashMode = 'flake';
    const g = new PlaneGeometry(0.2, 0.14, 6, 4);
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.pow(Math.abs(pos.getX(i)) / 0.1, 3) * 0.015);
    g.computeVertexNormals();
    const sheet = this.part(new Mesh(g), '#b49c6e', '#5a4430', { rough: 0.95, edge: '#9a7a50', scale: 18 });
    (sheet.material as MeshStandardMaterial).side = DoubleSide;
    this.word.position.z = 0.004;
    this.body.add(this.word);
    this.setWord('');
  }
  /** An empty sheet shows a faint ruled blank, so it reads as "write here". */
  setWord(w: string): void {
    this.word.text = w || '______';
    this.word.fillOpacity = w ? 1 : 0.45;
    this.word.sync();
  }
  override idle(dt: number): void {
    super.idle(dt);
    this.body.rotation.y = Math.sin(this.t * 0.5) * 0.4;
  }
  override age(v: number): void {
    super.age(v);
    this.word.fillOpacity = 1 - v * 0.75;
  }
  crumble(v: number, dt: number, ash: AshField): void {
    this.word.fillOpacity = 0.25 * (1 - v * 2);
    this.body.rotation.x = -v * 0.6;
    this.shed(v, dt, ash, 190, 'flake', 3);
  }
  override reset(): void {
    super.reset();
    this.word.fillOpacity = this.word.text === '______' ? 0.45 : 1;
    this.body.rotation.x = 0;
  }
}

export function createLedgerObjects(): LedgerObject[] {
  return [new Coins(), new Laurel(), new Cushion(), new Scroll(), new Heart(), new Mirror(), new Written()];
}

// ---------------------------------------------------------------------------------------------
// The columns.
// ---------------------------------------------------------------------------------------------

/** The carved ζημία column: a recessed slot that fills with grey ash, gold seams at the end. */
export class LossColumn {
  readonly group = new Group();
  private fill: Mesh;
  private crackMat: ShaderMaterial;
  private levelNow = 0;
  /** 0..1 how full the slot is. */
  level = 0;
  readonly height = 2.2;

  constructor(private readonly stone: MeshStandardMaterial, labelGreek: string, label: string) {
    const h = this.height;
    const shaft = new Mesh(new BoxGeometry(0.44, h, 0.14), stone);
    shaft.position.y = h / 2;
    const base = new Mesh(new BoxGeometry(0.54, 0.16, 0.2), stone);
    base.position.y = 0.08;
    const cap = new Mesh(new BoxGeometry(0.56, 0.14, 0.22), stone);
    cap.position.y = h + 0.07;
    for (const m of [shaft, base, cap]) {
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // The slot: dark glass in front of a rising grey fill.
    const slotBack = new Mesh(new PlaneGeometry(0.15, h - 0.7), new MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.9 }));
    slotBack.position.set(0, 0.25 + (h - 0.7) / 2, 0.071);
    this.fill = new Mesh(new BoxGeometry(0.14, 1, 0.01), new MeshStandardMaterial({ color: '#77716b', roughness: 1, emissive: '#3c3a38', emissiveIntensity: 0.25 }));
    this.fill.position.set(0, 0.25, 0.075);
    this.fill.scale.y = 0.0001;
    this.group.add(slotBack, this.fill);

    const greek = text3d(labelGreek, { font: 'greek', size: 0.085, color: '#a59c90', anchorY: 'middle' });
    greek.position.set(0, h - 0.17, 0.075);
    const latin = text3d(label, { font: 'light', size: 0.05, color: '#8a8278', letterSpacing: 0.25, anchorY: 'middle' });
    latin.position.set(0, h - 0.29, 0.075);
    this.group.add(greek, latin);

    // Gold seams: a crack field over the front, revealed from the bottom up.
    this.crackMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uCrack: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `uniform float uCrack, uTime; varying vec2 vUv;
        ${glsl.hash}
        void main(){
          vec2 p = vUv * vec2(4.0, 18.0);
          vec2 i = floor(p), f = fract(p); float d1 = 9.0, d2 = 9.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); vec2 o = hash22(i + g); float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
          float seam = 1.0 - smoothstep(0.0, 0.07, d2 - d1);
          float grow = smoothstep(uCrack * 1.2, uCrack * 1.2 - 0.2, vUv.y + hash12(i) * 0.15);
          float pulse = 0.8 + 0.2 * sin(uTime * 2.0 + vUv.y * 10.0);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * seam * grow * pulse * 2.4, 1.0);
        }`,
    });
    const seams = new Mesh(new PlaneGeometry(0.44, h), this.crackMat);
    seams.position.set(0, h / 2, 0.0725);
    seams.renderOrder = 8;
    this.group.add(seams);
  }

  /** World position of the slot's mouth (where ash goes in). */
  mouth(out = new Vector3()): Vector3 {
    return this.group.localToWorld(out.set(0, this.height - 0.45, 0.12));
  }

  set crack(v: number) {
    this.crackMat.uniforms.uCrack!.value = v;
  }

  update(dt: number): void {
    this.levelNow += (this.level - this.levelNow) * (1 - Math.exp(-dt * 1.5));
    const hmax = this.height - 0.75;
    this.fill.scale.y = Math.max(0.0001, this.levelNow * hmax);
    this.fill.position.y = 0.25 + (this.levelNow * hmax) / 2;
    this.crackMat.uniforms.uTime!.value += dt;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      if (m.material && m.material !== this.stone) (m.material as Material).dispose();
    });
    this.crackMat.dispose();
    this.group.removeFromParent();
  }
}

/** κέρδος: a column of light, rising from the floor. */
export class GainColumn {
  readonly group = new Group();
  private mat: ShaderMaterial;
  /** 0..1 how far it has risen. */
  rise = 0;
  readonly height = 2.2;

  constructor(labelGreek: string, label: string) {
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uRise: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: /* glsl */ `uniform float uRise, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        ${glsl.hash}
        ${glsl.dither}
        void main(){
          // A column of light, not a solid: bright at its edges, clear through the middle, with
          // threads of light rising inside it.
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(1.0 - facing, 2.2);
          float top = smoothstep(uRise, uRise - 0.12, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
          float threads = pow(0.5 + 0.5 * sin(vUv.x * 62.83 + sin(vUv.y * 9.0 - uTime * 1.3) * 1.5), 6.0);
          float motes = step(0.988, hash12(floor(vec2(vUv.x * 40.0, vUv.y * 120.0 - uTime * 6.0))));
          vec3 c = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 0.96, 0.86), vUv.y) * (rim * 0.9 + 0.07 + threads * 0.16 + motes * 0.5);
          gl_FragColor = vec4(c * top + dither(gl_FragCoord.xy), 1.0);
        }`,
    });
    const shaft = new Mesh(new CylinderGeometry(0.2, 0.22, this.height, 32, 1, true), this.mat);
    shaft.position.y = this.height / 2;
    shaft.renderOrder = 9;
    this.group.add(shaft);
    const greek = text3d(labelGreek, { font: 'greek', size: 0.085, color: new Color('#F5C76B').multiplyScalar(2.2), anchorY: 'middle' });
    greek.position.set(0, this.height + 0.22, 0.05);
    const latin = text3d(label, { font: 'light', size: 0.05, color: new Color('#FFE9B0').multiplyScalar(1.6), letterSpacing: 0.25, anchorY: 'middle' });
    latin.position.set(0, this.height + 0.1, 0.05);
    greek.fillOpacity = latin.fillOpacity = 0;
    this.group.add(greek, latin);
    this.group.userData.labels = [greek, latin];
  }

  update(dt: number): void {
    this.mat.uniforms.uTime!.value += dt;
    this.mat.uniforms.uRise!.value = this.rise * 1.08;
    for (const l of this.group.userData.labels as { fillOpacity: number }[]) l.fillOpacity = clamp((this.rise - 0.7) / 0.3);
    this.group.visible = this.rise > 0.001;
  }

  dispose(): void {
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
