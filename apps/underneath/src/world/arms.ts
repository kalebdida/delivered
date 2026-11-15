// The everlasting arms: vast flowing forms of light across the floor of the world, made of GPU
// particles and luminous Verlet ribbons. Never a body: more a landscape than limbs. A faint gold
// mark rings each wrist (never explained on screen).
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, Group, Mesh, PlaneGeometry, Points, ShaderMaterial, Vector3,
} from 'three';
import { createRope, glsl, seededRandom, type Verlet } from '@delivered/core';

export const ARM_COUNTS = { low: 25_000, medium: 80_000, high: 300_000 } as const;

/** One arm as a curve from a far shoulder to an open hand near the centre (unit scale). */
function armCurve(side: number): CatmullRomCurve3 {
  const s = side;
  return new CatmullRomCurve3([
    new Vector3(s * 1.0, -0.22, -0.55),
    new Vector3(s * 0.78, -0.02, -0.25),
    new Vector3(s * 0.5, 0.05, 0.02),
    new Vector3(s * 0.2, 0.02, 0.1),
    new Vector3(s * 0.045, 0.0, 0.1),
  ]);
}

/** A ribbon of light: a Verlet rope drawn as a flat additive strip. */
class Ribbon {
  readonly rope: Verlet;
  readonly mesh: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: Float32Array;
  constructor(
    points: Vector3[],
    private readonly width: number,
    mat: ShaderMaterial,
  ) {
    const n = points.length;
    this.rope = createRope(points[0]!.toArray() as [number, number, number], points[n - 1]!.toArray() as [number, number, number], n - 1, { iterations: 4, damping: 0.96, gravity: [0, 0, 0] });
    points.forEach((p, i) => this.rope.setPoint(i, p.x, p.y, p.z));
    // Rest lengths from the actual curve, so the ribbon keeps its shape and only sways.
    this.rope.constraints.forEach((c) => (c.rest = points[c.a]!.distanceTo(points[c.b]!)));
    this.rope.pin(0);
    this.pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.write();
  }
  write(): void {
    const p = this.rope.positions;
    const n = this.rope.count;
    for (let i = 0; i < n; i++) {
      const j = Math.min(n - 1, i + 1);
      const k = Math.max(0, i - 1);
      const tx = p[j * 3]! - p[k * 3]!;
      const tz = p[j * 3 + 2]! - p[k * 3 + 2]!;
      const l = Math.hypot(tx, tz) || 1;
      const taper = Math.sin((i / (n - 1)) * Math.PI) * 0.8 + 0.2;
      const w = this.width * taper;
      const sx = (-tz / l) * w;
      const sz = (tx / l) * w;
      this.pos.set([p[i * 3]! + sx, p[i * 3 + 1]! + w * 0.3, p[i * 3 + 2]! + sz, p[i * 3]! - sx, p[i * 3 + 1]! - w * 0.3, p[i * 3 + 2]! - sz], i * 6);
    }
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    this.geo.dispose();
  }
}

export interface ArmsOptions {
  count: number;
  /** World size of the whole form (shoulder to shoulder). */
  scale: number;
  ribbons?: number;
  seed?: string;
}

export class Arms {
  readonly group = new Group();
  readonly uniforms = {
    uTime: { value: 0 },
    uClose: { value: 0 },
    uRise: { value: 0 },
    uLevel: { value: 1 },
    uScale: { value: 1 },
    uPixel: { value: 1 },
    uWarm: { value: new Color('#fff4da') },
    uGold: { value: new Color('#f5c76b') },
    uGlow: { value: 0 },
    uGlowSize: { value: 12 },
  };
  readonly points: Points;
  private readonly ribbons: Ribbon[] = [];
  private readonly ribbonMat: ShaderMaterial;
  private glowMesh!: Mesh;
  private time = 0;
  /** Where a held visitor rests, in local units × scale (the cradle between the hands). */
  readonly cradle = new Vector3(0, 0.05, 0.1);

  constructor(readonly opts: ArmsOptions) {
    const rng = seededRandom(opts.seed ?? 'arms');
    const count = opts.count;
    const pos = new Float32Array(count * 3);
    const data = new Float32Array(count * 4); // t along arm, side, seed, gold
    const curves = [armCurve(-1), armCurve(1)];
    const p = new Vector3();
    const tan = new Vector3();
    const nrm = new Vector3();
    const bin = new Vector3();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const c = curves[side < 0 ? 0 : 1]!;
      const roll = rng();
      // Most particles in the arms, a fifth spread as open fingers of light at the hand.
      const fingers = roll < 0.28;
      let t = fingers ? 0.86 + rng() * 0.14 : Math.pow(rng(), 0.6);
      t = Math.min(0.999, t);
      c.getPointAt(t, p);
      c.getTangentAt(t, tan);
      nrm.set(0, 1, 0).cross(tan).normalize();
      bin.copy(tan).cross(nrm).normalize();
      const thick = 0.11 * (1 - t * 0.55) + 0.01;
      const a = rng() * Math.PI * 2;
      const r = thick * Math.sqrt(rng()) * (rng() < 0.15 ? 2.2 : 1);
      let x = p.x + nrm.x * Math.cos(a) * r + bin.x * Math.sin(a) * r * 0.55;
      let y = p.y + nrm.y * Math.cos(a) * r + bin.y * Math.sin(a) * r * 0.55;
      let z = p.z + nrm.z * Math.cos(a) * r + bin.z * Math.sin(a) * r * 0.55;
      if (fingers) {
        const f = Math.floor(rng() * 5);
        const spread = (f - 2) * 0.3;
        const len = (t - 0.86) / 0.14;
        const dir = Math.atan2(tan.z, tan.x) + spread;
        x = p.x + Math.cos(dir) * len * 0.05 + (rng() - 0.5) * 0.006;
        z = p.z + Math.sin(dir) * len * 0.05 + (rng() - 0.5) * 0.006;
        y = p.y + Math.sin(len * 2.2) * 0.04 + (rng() - 0.5) * 0.008;
      }
      pos.set([x, y, z], i * 3);
      const gold = Math.abs(t - 0.82) < 0.012 ? 1 : rng() < 0.03 ? 0.5 : 0;
      data.set([t, side, rng(), gold], i * 4);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aData', new BufferAttribute(data, 4));
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aData; uniform float uTime; uniform float uClose; uniform float uRise; uniform float uScale; uniform float uPixel;
        varying float vA; varying float vGold; varying float vT;
        ${glsl.simplex3D}
        void main(){
          float t = aData.x; float side = aData.y; float seed = aData.z;
          vec3 p = position;
          // Closing: the hands (t > 0.55) turn inward and up around the wrist.
          float k = smoothstep(0.5, 1.0, t) * uClose;
          vec3 pivot = vec3(side * 0.22, 0.02, 0.1);
          vec3 d = p - pivot;
          float ang = -side * k * 0.5;
          d = vec3(d.x * cos(ang) - d.y * sin(ang), d.x * sin(ang) + d.y * cos(ang), d.z);
          p = pivot + d;
          p.y += k * 0.015 + uRise * 0.02 * (1.0 - t * 0.5);
          // Flow: particles drift along the form and shimmer.
          float n = snoise(p * 9.0 + vec3(0.0, uTime * 0.12, seed));
          p += vec3(snoise(p * 5.0 + uTime * 0.05), n, snoise(p * 5.0 - uTime * 0.05 + 7.0)) * 0.006;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float size = (0.6 + seed * 1.6 + aData.w * 2.0) * uScale * 0.0016 * uPixel;
          gl_PointSize = clamp(size * 900.0 / -mv.z, 1.0, 22.0);
          vA = (0.35 + 0.65 * fract(seed * 13.7 + uTime * 0.07)) * (0.6 + 0.4 * n);
          vGold = aData.w; vT = t;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm; uniform vec3 uGold; uniform float uLevel;
        varying float vA; varying float vGold; varying float vT;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a * vA * uLevel;
          vec3 col = mix(uWarm, uGold, clamp(vGold + (1.0 - vT) * 0.3, 0.0, 1.0)) * (1.2 + vGold * 1.8);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;

    this.ribbonMat = new ShaderMaterial({
      uniforms: { uTime: this.uniforms.uTime, uLevel: this.uniforms.uLevel, uWarm: this.uniforms.uWarm },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime; uniform float uLevel; uniform vec3 uWarm; varying vec2 vUv;
        void main(){
          float edge = smoothstep(0.0, 0.5, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
          float flow = 0.55 + 0.45 * sin(vUv.x * 28.0 - uTime * 1.3);
          float a = edge * edge * flow * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.85, vUv.x) * 0.55 * uLevel;
          gl_FragColor = vec4(uWarm * 1.8 * a, a);
        }`,
    });
    const nr = opts.ribbons ?? 10;
    for (let i = 0; i < nr; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const c = armCurve(side);
      const off = new Vector3((rng() - 0.5) * 0.08, 0.02 + rng() * 0.05, (rng() - 0.5) * 0.08);
      const t0 = rng() * 0.3;
      const pts = Array.from({ length: 18 }, (_, k) => c.getPointAt(Math.min(0.99, t0 + (k / 17) * (0.98 - t0))).add(off));
      const rb = new Ribbon(pts, 0.012 + rng() * 0.012, this.ribbonMat);
      rb.rope.wind = (x, _y, z, tt) => [Math.sin(tt * 0.6 + x * 9) * 0.05, Math.sin(tt * 0.8 + z * 7) * 0.08, Math.cos(tt * 0.5 + x * 5) * 0.05];
      this.ribbons.push(rb);
      this.group.add(rb.mesh);
    }
    this.group.add(this.points);
    // A warm glow where the visitor rests: the focal point of the catch.
    const glow = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        uniforms: { uGlow: this.uniforms.uGlow, uSize: this.uniforms.uGlowSize, uC: { value: new Vector3(0.0, 0.05, 0.1) } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        vertexShader: `uniform float uSize; uniform vec3 uC; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(uC, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uGlow; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = (exp(-d * 7.0) * 0.8 + exp(-d * 2.5) * 0.3) * smoothstep(1.0, 0.7, d) * uGlow; gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * 1.6, a); }`,
      }),
    );
    glow.frustumCulled = false;
    glow.renderOrder = 4;
    this.glowMesh = glow;
    this.group.add(glow);
    this.group.scale.setScalar(opts.scale);
    this.uniforms.uScale.value = opts.scale;
  }

  /** World position of the cradle. */
  cradleWorld(out: Vector3): Vector3 {
    this.group.updateMatrixWorld();
    return out.copy(this.cradle).applyMatrix4(this.group.matrixWorld);
  }

  update(dt: number, pixelRatio: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uPixel.value = pixelRatio;
    if (!this.group.visible) return;
    for (const r of this.ribbons) {
      r.rope.step(Math.min(dt, 1 / 30));
      r.write();
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
    this.ribbonMat.dispose();
    this.ribbons.forEach((r) => r.dispose());
    this.glowMesh.geometry.dispose();
    (this.glowMesh.material as ShaderMaterial).dispose();
    this.group.removeFromParent();
  }
}
