// The visible chain: a Verlet rope (core) drawn as 14 heavy iron links in one InstancedMesh.
// Links can glow red-hot (struck) or turn to gold and dissolve (deliverance).
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial,
  Points, Quaternion, ShaderMaterial, TorusGeometry, Vector3,
} from 'three';
import { createRope, type Verlet } from '@delivered/core';
import { PATH } from './layout';

export const LINKS = 14;
const HOT = new Color('#ff4a1a').multiplyScalar(3.2);
// Deeper than the UI gold and only a little over 1.0: brighter would clip to bone and read as white.
const GOLD = new Color('#F2A93C').multiplyScalar(2.3);

export class Chain {
  readonly rope: Verlet;
  readonly mesh: InstancedMesh;
  private readonly material: MeshStandardMaterial;
  private readonly emit: InstancedBufferAttribute;
  /** Per link: heat 0..1 (cools on its own). */
  readonly heat = new Float32Array(LINKS);
  /** Per link: gold 0..1, then dissolve 0..1 (scale to nothing). */
  readonly gold = new Float32Array(LINKS);
  readonly gone = new Float32Array(LINKS);
  /** Per link: seconds since it turned to gold (it holds its gold before it dissolves). */
  readonly goldAge = new Float32Array(LINKS);
  /** A soft gold halo on every gold link, so the chain itself is the brightest thing on the ground. */
  private readonly halo: Points;
  private readonly haloPos: BufferAttribute;
  private readonly haloGlow: BufferAttribute;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly d = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  /** Previous mid point, for scrape speed. */
  private readonly prevMid = new Vector3();
  /** Speed of the chain's middle over the ground (m/s), drives the scrape sound. */
  speed = 0;

  constructor() {
    this.rope = createRope([0, 0.1, 0], [0, 0.1, PATH.chain], LINKS, { iterations: 14, damping: 0.97, slack: 1, gravity: [0, -14, 0] });
    this.rope.pin(0);
    this.rope.pin(LINKS);
    const geo = new TorusGeometry(0.075, 0.024, 8, 20);
    geo.scale(0.78, 1.45, 1);
    this.material = new MeshStandardMaterial({ color: '#5d5c62', roughness: 0.38, metalness: 0.92, envMapIntensity: 1 });
    this.emit = new InstancedBufferAttribute(new Float32Array(LINKS * 3), 3);
    this.emit.setUsage(DynamicDrawUsage);
    this.mesh = new InstancedMesh(geo, this.material, LINKS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.geometry.setAttribute('aEmit', this.emit);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aEmit;\nvarying vec3 vEmit;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;')
        // Gold is the metal itself, not a glow laid over iron: the albedo turns with the light.
        .replace('#include <color_fragment>', '#include <color_fragment>\nfloat chainGold = smoothstep(0.15, 0.8, vEmit.g);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.66, 0.2), chainGold);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, chainGold);')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float chainFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          totalEmissiveRadiance += vEmit * mix(1.0, 0.55 + 0.9 * chainFacing, chainGold);`,
        );
    };
    this.material.customProgramCacheKey = () => 'wretched-chain-2';
    const hg = new BufferGeometry();
    this.haloPos = new BufferAttribute(new Float32Array(LINKS * 3), 3).setUsage(DynamicDrawUsage);
    this.haloGlow = new BufferAttribute(new Float32Array(LINKS), 1).setUsage(DynamicDrawUsage);
    hg.setAttribute('position', this.haloPos);
    hg.setAttribute('aGlow', this.haloGlow);
    this.halo = new Points(
      hg,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `attribute float aGlow; varying float vGlow;
          void main(){ vGlow = aGlow; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aGlow * 300.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vGlow;
          void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (exp(-d * 5.0) * 0.9 + exp(-d * 14.0) * 1.4) * smoothstep(1.0, 0.6, d) * min(vGlow, 1.0);
          gl_FragColor = vec4(vec3(1.0, 0.58, 0.14) * a * 1.25, a); }`,
      }),
    );
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 8;
    this.mesh.add(this.halo);
  }

  /** Lay the chain straight between two points (teleports). */
  lay(from: Vector3, to: Vector3): void {
    for (let i = 0; i <= LINKS; i++) {
      const t = i / LINKS;
      this.rope.setPoint(i, from.x + (to.x - from.x) * t, Math.min(from.y, to.y) + 0.05, from.z + (to.z - from.z) * t);
    }
    this.prevMid.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
  }

  fixedUpdate(dt: number, ankle: Vector3, wrist: Vector3 | null, floorY: number): void {
    this.rope.floorY = floorY;
    this.rope.movePin(0, ankle.x, ankle.y, ankle.z);
    if (wrist) this.rope.movePin(LINKS, wrist.x, wrist.y, wrist.z);
    this.rope.step(dt);
  }

  /** Release the far end (the double's wrist) so the links fall free. */
  releaseEnd(): void {
    this.rope.unpin(LINKS);
    this.rope.unpin(0);
  }

  update(dt: number): void {
    const mid = this.rope.getPoint(LINKS >> 1);
    const sp = Math.hypot(mid[0] - this.prevMid.x, mid[2] - this.prevMid.z) / Math.max(dt, 1e-3);
    this.speed += (Math.min(sp, 6) - this.speed) * Math.min(1, dt * 6);
    this.prevMid.set(mid[0], 0, mid[2]);
    for (let i = 0; i < LINKS; i++) {
      this.heat[i] = Math.max(0, this.heat[i]! - dt * 0.28);
      const [ax, ay, az] = this.rope.getPoint(i);
      const [bx, by, bz] = this.rope.getPoint(i + 1);
      this.a.set(ax, ay, az);
      this.b.set(bx, by, bz);
      this.d.subVectors(this.b, this.a);
      const len = this.d.length() || 1e-4;
      this.d.divideScalar(len);
      this.q.setFromUnitVectors(UP, this.d);
      this.q2.setFromAxisAngle(UP, i % 2 ? Math.PI / 2 : 0);
      this.q.multiply(this.q2);
      const g = this.gone[i]!;
      const gd = this.gold[i]!;
      if (gd > 0) this.goldAge[i] = this.goldAge[i]! + dt;
      // A link swells a little as it turns (a breath of light), then shrinks to nothing.
      const swell = 1 + gd * (0.38 + 0.3 * Math.exp(-this.goldAge[i]! * 2.5));
      const sc = Math.max(0.0001, (1 - g) * swell);
      this.s.set(sc, sc, sc);
      this.m.compose(this.a.add(this.b).multiplyScalar(0.5), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.haloPos.setXYZ(i, this.a.x, this.a.y, this.a.z);
      this.haloGlow.setX(i, gd * (1 - g) * (1 + 0.8 * Math.exp(-this.goldAge[i]! * 2)));
      const h = this.heat[i]!;
      this.c.setRGB(0, 0, 0).lerp(HOT, h * h).lerp(GOLD, gd);
      this.emit.setXYZ(i, this.c.r, this.c.g, this.c.b);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.emit.needsUpdate = true;
    this.haloPos.needsUpdate = true;
    this.haloGlow.needsUpdate = true;
  }

  /** World position of a link's centre. */
  linkPosition(i: number, out: Vector3): Vector3 {
    const [ax, ay, az] = this.rope.getPoint(i);
    const [bx, by, bz] = this.rope.getPoint(i + 1);
    return out.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  }

  /** Straight-line distance between the two ends. */
  span(): number {
    const [ax, , az] = this.rope.getPoint(0);
    const [bx, , bz] = this.rope.getPoint(LINKS);
    return Math.hypot(ax - bx, az - bz);
  }

  reset(): void {
    this.heat.fill(0);
    this.gold.fill(0);
    this.gone.fill(0);
    this.goldAge.fill(0);
    this.rope.pin(0);
    this.rope.pin(LINKS);
  }

  dispose(): void {
    this.halo.geometry.dispose();
    (this.halo.material as ShaderMaterial).dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.rope.dispose();
    this.mesh.dispose();
  }
}

const UP = new Vector3(0, 1, 0);
