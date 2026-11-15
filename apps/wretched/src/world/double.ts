// The double: "the body of this death". A Rapier ragdoll (loaded lazily) wrapped in a shadow-particle
// shader. Heavy and sad, never a monster: a dark silhouette trailing smoke, two faint ember eyes.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Matrix4, NormalBlending, Points, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { createRagdoll, glsl, seededRandom, type Physics, type Ragdoll, type RagdollPart, type RigidBody } from '@delivered/core';
import { heightAt } from './terrain';

const PARTS: RagdollPart[] = [
  'pelvis', 'chest', 'head', 'upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR', 'upperLegL', 'lowerLegL', 'upperLegR', 'lowerLegR',
];
/** Rough surface share per part, so particles spread evenly over the body. */
const SHARE = [0.11, 0.2, 0.09, 0.05, 0.045, 0.05, 0.045, 0.1, 0.085, 0.1, 0.085];
/** Fallback capsule sizes (pelvis-relative layout) used before Rapier has loaded. */
const SHAPES: Record<RagdollPart, [number, number]> = {
  pelvis: [0.06, 0.13], chest: [0.13, 0.15], head: [0.02, 0.11], upperArmL: [0.11, 0.05], lowerArmL: [0.11, 0.045],
  upperArmR: [0.11, 0.05], lowerArmR: [0.11, 0.045], upperLegL: [0.15, 0.07], lowerLegL: [0.15, 0.06], upperLegR: [0.15, 0.07],
  lowerLegR: [0.15, 0.06],
};
/** Lying pose offsets (x, y, z from the pelvis) for the placeholder before physics exists. */
const LYING: Record<RagdollPart, [number, number, number]> = {
  pelvis: [0, 0, 0], chest: [0, 0, -0.34], head: [0, 0, -0.68], upperArmL: [-0.24, 0, -0.3], lowerArmL: [-0.26, 0, -0.02],
  upperArmR: [0.24, 0, -0.3], lowerArmR: [0.26, 0, -0.02], upperLegL: [-0.1, 0, 0.33], lowerLegL: [-0.1, 0, 0.75],
  upperLegR: [0.1, 0, 0.33], lowerLegR: [0.1, 0, 0.75],
};

const VERT = /* glsl */ `
uniform mat4 uBones[11];
uniform float uTime, uReveal, uDissolve, uSize, uPixelRatio, uFlare;
uniform vec3 uWind;
attribute float aBone;
attribute vec3 aLocal;
attribute vec4 aSeed;
varying float vAlpha;
varying float vSmoke;
${glsl.hash}
void main(){
  mat4 B = uBones[int(aBone + 0.5)];
  float smoke = step(0.72, aSeed.x);
  float life = fract(uTime * (0.18 + aSeed.y * 0.22) + aSeed.z);
  vec3 jitter = (aSeed.yzw - 0.5) * 0.035 * (1.0 + uFlare);
  vec3 wp = (B * vec4(aLocal + jitter, 1.0)).xyz;
  // Smoke trails up and back with the wind.
  vec3 drift = vec3(sin(uTime * 0.7 + aSeed.w * 6.28) * 0.12, life * 0.55, cos(uTime * 0.5 + aSeed.y * 6.28) * 0.12) + uWind * life;
  wp += drift * smoke;
  // Dissolve: every particle lifts away as ash on the wind, staggered by its seed.
  float d = clamp(uDissolve * 1.6 - aSeed.y * 0.6, 0.0, 1.0);
  wp += (vec3(0.0, 1.6, 0.0) + uWind * 5.0 + (aSeed.wzy - 0.5) * 2.4) * d * d;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = uSize * (smoke > 0.5 ? 1.0 + life * 2.2 : 1.0) * (0.6 + aSeed.w * 0.8);
  gl_PointSize = size * uPixelRatio * (8.0 / -mv.z);
  float hidden = mix(0.16, 1.0, uReveal);
  vAlpha = hidden * (smoke > 0.5 ? (1.0 - life) * 0.45 : 0.85) * (1.0 - d);
  vSmoke = smoke;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uEdge;
varying float vAlpha;
varying float vSmoke;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r) * vAlpha;
  vec3 col = mix(uColor, uEdge, vSmoke * 0.5);
  gl_FragColor = vec4(col, a);
}`;

export class Double {
  readonly points: Points;
  readonly eyes: Points;
  readonly material: ShaderMaterial;
  private readonly eyeMat: ShaderMaterial;
  private readonly bones: Matrix4[] = PARTS.map(() => new Matrix4());
  ragdoll: Ragdoll | null = null;
  private physics: Physics | null = null;
  /** Fallback placement before physics loads (pelvis position). */
  private readonly rest = new Vector3(0, 0.15, 6);
  /** 0 lying · 1 sitting up · 2 standing. */
  posture = 0;
  /** Extra pull back, away from the light (0..1). */
  pull = 0;
  /** Direction the double faces when standing (toward the light by default). */
  readonly face = new Vector3(0, 0, -1);
  private readonly tmpV = new Vector3();
  private readonly tmpQ = new Quaternion();
  private readonly one = new Vector3(1, 1, 1);
  /** Eye brightness 0..1 (go out gently at the end). */
  eyeLevel = 1;

  constructor(count: number) {
    const rng = seededRandom('double');
    const bone = new Float32Array(count);
    const local = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    const pos = new Float32Array(count * 3);
    let p = 0;
    PARTS.forEach((part, bi) => {
      const n = bi === PARTS.length - 1 ? count - p : Math.round(count * SHARE[bi]!);
      const [hh, r] = SHAPES[part];
      for (let i = 0; i < n && p < count; i++, p++) {
        // Sample a capsule surface (cylinder plus hemispheres) along local Y, a little inside for volume.
        const u = rng();
        const ang = rng() * Math.PI * 2;
        const depth = Math.pow(rng(), 0.35);
        const scale = part === 'head' ? 1.15 : 1;
        let x: number;
        let y: number;
        let z: number;
        const capFrac = r / (r + hh * 2);
        if (u < capFrac) {
          const v = rng() * 2 - 1;
          const s = Math.sqrt(1 - v * v);
          x = Math.cos(ang) * s * r;
          z = Math.sin(ang) * s * r;
          y = v * r + (v > 0 ? hh : -hh);
        } else {
          x = Math.cos(ang) * r;
          z = Math.sin(ang) * r;
          y = (rng() * 2 - 1) * hh;
        }
        bone[p] = bi;
        local.set([x * depth * scale, y * scale, z * depth * scale], p * 3);
        seed.set([rng(), rng(), rng(), rng()], p * 4);
      }
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aBone', new BufferAttribute(bone, 1));
    geo.setAttribute('aLocal', new BufferAttribute(local, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 4));
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uBones: { value: this.bones },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uDissolve: { value: 0 },
        uSize: { value: count > 20000 ? 2.8 : count > 8000 ? 3.8 : 5.4 },
        uPixelRatio: { value: 1 },
        uFlare: { value: 0 },
        uWind: { value: new Vector3(0.6, 0.2, 0.9) },
        uColor: { value: new Color('#050405') },
        uEdge: { value: new Color('#1a1416') },
      },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;

    // Two faint ember eyes.
    const eg = new BufferGeometry();
    eg.setAttribute('position', new BufferAttribute(new Float32Array([-0.038, 0.035, 0.1, 0.038, 0.035, 0.1]), 3));
    this.eyeMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color('#FF6A3D') }, uLevel: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `uniform float uPixelRatio; uniform float uLevel;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = (2.0 + uLevel * 4.0) * uPixelRatio * (6.0 / -mv.z) + 1.5; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uLevel;
        void main(){ float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(uColor * (1.0 + uLevel * 4.0) * a, a * min(1.0, uLevel * 1.5)); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.eyes = new Points(eg, this.eyeMat);
    this.eyes.frustumCulled = false;
    this.eyes.matrixAutoUpdate = false;
    this.eyes.renderOrder = 3;
  }

  get ready(): boolean {
    return this.ragdoll !== null;
  }

  /** Create the ragdoll once Rapier has loaded. */
  attachPhysics(physics: Physics): void {
    this.physics = physics;
    const r = this.rest;
    this.ragdoll = createRagdoll(physics, { position: { x: r.x, y: r.y + 1.2, z: r.z }, meshes: false, stiffness: 3, density: 1.4, groupIndex: 2 });
    this.lieAt(r.x, r.z);
  }

  /** Lay the double on its back at a point, head toward -z (toward the visitor/light). */
  lieAt(x: number, z: number, headDir = -1): void {
    this.rest.set(x, heightAt(x, z) + 0.16, z);
    const rd = this.ragdoll;
    if (!rd) return;
    const g = heightAt(x, z);
    // Rotate the standing layout to lie face down along z.
    const q = this.tmpQ.setFromAxisAngle(new Vector3(1, 0, 0), headDir < 0 ? -Math.PI / 2 : Math.PI / 2);
    const spec = PELVIS_REL;
    for (const part of PARTS) {
      const b = rd.bodies[part];
      const o = this.tmpV.set(...spec[part]).applyQuaternion(q);
      b.setTranslation({ x: x + o.x, y: g + 0.18 + Math.max(0, o.y), z: z + o.z }, true);
      b.setRotation(q, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** World position of the right wrist (where the chain is fastened). */
  wrist(out: Vector3): Vector3 {
    const rd = this.ragdoll;
    if (!rd) return out.set(this.rest.x + 0.26, this.rest.y, this.rest.z - 0.13);
    const b = rd.bodies.lowerArmR;
    const t = b.translation();
    const q = b.rotation();
    this.tmpQ.set(q.x, q.y, q.z, q.w);
    return out.set(0, -0.15, 0).applyQuaternion(this.tmpQ).add(this.tmpV.set(t.x, t.y, t.z));
  }

  body(part: RagdollPart): RigidBody | null {
    return this.ragdoll?.bodies[part] ?? null;
  }

  pelvis(out: Vector3): Vector3 {
    const b = this.ragdoll?.bodies.pelvis;
    if (!b) return out.copy(this.rest);
    const t = b.translation();
    return out.set(t.x, t.y, t.z);
  }

  /** Posture forces ("strings of grief" lifting the body), applied every physics step. */
  fixedUpdate(dt: number): void {
    const rd = this.ragdoll;
    if (!rd) return;
    const p = this.posture;
    const pel = rd.bodies.pelvis.translation();
    const g = heightAt(pel.x, pel.z);
    const lift = (part: RagdollPart, target: number, k: number, centre: boolean) => {
      const b = rd.bodies[part];
      const t = b.translation();
      const v = b.linvel();
      const m = b.mass();
      const fy = (k * (g + target - t.y) - 2 * Math.sqrt(k) * v.y + 9.81) * m;
      let fx = 0;
      let fz = 0;
      if (centre) {
        // Keep upper body over the pelvis so a standing double does not topple.
        fx = (k * 0.6 * (pel.x - t.x) - 2 * v.x) * m;
        fz = (k * 0.6 * (pel.z - t.z) - 2 * v.z) * m;
      }
      b.applyImpulse({ x: fx * dt, y: fy * dt, z: fz * dt }, true);
    };
    if (p > 0.05) {
      const s = Math.min(1, p);
      const st = Math.max(0, p - 1);
      lift('pelvis', 0.16 + st * 0.82, 40 * Math.max(st, 0.2), st > 0.3);
      lift('chest', 0.18 + s * 0.38 + st * 0.75, 50 * s, st > 0.1);
      lift('head', 0.2 + s * 0.62 + st * 0.82, 50 * s, st > 0.1);
      if (st > 0.2) {
        lift('lowerLegL', 0.24, 30 * st, false);
        lift('lowerLegR', 0.24, 30 * st, false);
        // Turn to face the light.
        const head = rd.bodies.head.translation();
        rd.bodies.head.applyImpulse({ x: this.face.x * 0.4 * dt * st, y: 0, z: this.face.z * 0.4 * dt * st }, true);
        void head;
      }
    }
    if (this.pull > 0) {
      const m = rd.bodies.pelvis.mass();
      rd.bodies.pelvis.applyImpulse({ x: 0, y: 0, z: this.pull * 6 * m * dt }, true);
    }
    // Never let the double sink through or fly off: clamp to the terrain.
    for (const part of PARTS) {
      const b = rd.bodies[part];
      const t = b.translation();
      const gy = heightAt(t.x, t.z);
      if (t.y < gy + 0.04) {
        b.setTranslation({ x: t.x, y: gy + 0.06, z: t.z }, true);
        const v = b.linvel();
        if (v.y < 0) b.setLinvel({ x: v.x * 0.6, y: 0, z: v.z * 0.6 }, true);
      }
    }
  }

  update(dt: number, time: number, pixelRatio: number): void {
    const u = this.material.uniforms;
    u.uTime!.value = time;
    u.uPixelRatio!.value = pixelRatio;
    u.uFlare!.value = Math.max(0, (u.uFlare!.value as number) - dt * 2.2);
    this.eyeMat.uniforms.uPixelRatio!.value = pixelRatio;
    const rd = this.ragdoll;
    PARTS.forEach((part, i) => {
      if (rd) {
        const b = rd.bodies[part];
        const t = b.translation();
        const q = b.rotation();
        this.bones[i]!.compose(this.tmpV.set(t.x, t.y, t.z), this.tmpQ.set(q.x, q.y, q.z, q.w), this.one);
      } else {
        const o = LYING[part];
        this.bones[i]!.compose(
          this.tmpV.set(this.rest.x + o[0], this.rest.y, this.rest.z + o[2]),
          this.tmpQ.setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2),
          this.one,
        );
      }
    });
    this.eyes.matrix.copy(this.bones[2]!);
    this.eyes.matrixWorldNeedsUpdate = true;
    const flare = u.uFlare!.value as number;
    this.eyeMat.uniforms.uLevel!.value = this.eyeLevel * (0.35 + flare * 0.9) * (0.5 + (u.uReveal!.value as number) * 0.5);
  }

  flare(amount = 1): void {
    this.material.uniforms.uFlare!.value = Math.max(this.material.uniforms.uFlare!.value as number, amount);
  }

  set reveal(v: number) {
    this.material.uniforms.uReveal!.value = v;
  }
  get reveal(): number {
    return this.material.uniforms.uReveal!.value as number;
  }
  set dissolve(v: number) {
    this.material.uniforms.uDissolve!.value = v;
  }
  get dissolve(): number {
    return this.material.uniforms.uDissolve!.value as number;
  }
  set visible(v: boolean) {
    this.points.visible = v;
    this.eyes.visible = v;
  }

  dispose(): void {
    this.ragdoll?.dispose();
    this.ragdoll = null;
    this.points.geometry.dispose();
    this.material.dispose();
    this.eyes.geometry.dispose();
    this.eyeMat.dispose();
    void this.physics;
  }
}

/** The core ragdoll's standing layout (offsets from the pelvis), used to lay it down. */
const PELVIS_REL: Record<RagdollPart, [number, number, number]> = {
  pelvis: [0, 0, 0], chest: [0, 0.34, 0], head: [0, 0.68, 0], upperArmL: [-0.24, 0.3, 0], lowerArmL: [-0.24, 0, 0],
  upperArmR: [0.24, 0.3, 0], lowerArmR: [0.24, 0, 0], upperLegL: [-0.1, -0.33, 0], lowerLegL: [-0.1, -0.75, 0],
  upperLegR: [0.1, -0.33, 0], lowerLegR: [0.1, -0.75, 0],
};
