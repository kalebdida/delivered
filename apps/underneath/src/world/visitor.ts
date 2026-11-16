// The visitor: a small cloaked figure with an inner glow. The cloak is core Verlet cloth simulated
// in the figure's own frame, with the airflow as wind. On islands a platformer controller (jump,
// coyote time, ledge grab) moves it; in the fall the chapters drive its position directly.
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, PointLight, Quaternion,
  SphereGeometry, Vector3,
} from 'three';
import { createCloth, damp, type Verlet } from '@delivered/core';
import type { Material } from 'three';

/**
 * A fresnel rim on the side facing a light behind the figure (the low sun, lightning, the arms
 * below), so the small figure always separates from the sky. Shared by every visitor material.
 */
export const RIM = {
  uRimColor: { value: new Color('#ffd08a') },
  uRim: { value: 1.2 },
  /** Direction toward the rim light, in view space (set per frame). */
  uRimDir: { value: new Vector3(0, 0, -1) },
};
function withRim<M extends Material>(m: M): M {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, RIM);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRim; uniform vec3 uRimDir;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(abs(dot(normal, vv)), 0.0, 1.0), 1.5);
          float side = clamp(dot(normal, uRimDir) * 0.9 + 0.4, 0.0, 1.0);
          totalEmissiveRadiance += uRimColor * fr * side * uRim;
          // A little self-light so the figure never turns into a black hole on its shadowed side.
          totalEmissiveRadiance += diffuseColor.rgb * 0.16;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'underneath-rim';
  return m;
}

export interface Platform {
  x: number;
  z: number;
  /** Top surface height. */
  y: number;
  /** Radius for circles; for boxes the half extents are `hx`/`hz`. */
  r: number;
  hx?: number;
  hz?: number;
  rot?: number;
  /** Optional extra test (crumbling islands: is the chunk under this point still there?). */
  solidAt?: (x: number, z: number) => boolean;
  /** Edges can be grabbed (circles only). */
  ledge?: boolean;
  /** Carried platforms move the visitor with them. */
  vx?: number;
  vz?: number;
  vy?: number;
}

export function onPlatform(p: Platform, x: number, z: number): boolean {
  let inside: boolean;
  if (p.hx !== undefined && p.hz !== undefined) {
    const c = Math.cos(-(p.rot ?? 0));
    const s = Math.sin(-(p.rot ?? 0));
    const dx = x - p.x;
    const dz = z - p.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    inside = Math.abs(lx) <= p.hx && Math.abs(lz) <= p.hz;
  } else inside = Math.hypot(x - p.x, z - p.z) <= p.r;
  return inside && (!p.solidAt || p.solidAt(x, z));
}

export interface MoveInput {
  /** Desired horizontal direction in world space (length ≤ 1). */
  dx: number;
  dz: number;
  jumpPressed: boolean;
  jumpHeld: boolean;
}

/** Third-person platformer motion. Pure apart from the platform list it is given. */
export class Platformer {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  grounded = false;
  ground: Platform | null = null;
  hanging: Platform | null = null;
  private coyote = 0;
  private buffer = 0;
  private climb = 0;
  airTime = 0;
  speed = 4.4;
  gravity = 24;
  jumpSpeed = 8.6;
  /** Called on landing with the impact speed. */
  onLand: ((v: number) => void) | null = null;
  onJump: (() => void) | null = null;
  onGrab: (() => void) | null = null;

  step(dt: number, input: MoveInput, platforms: readonly Platform[]): void {
    this.buffer = input.jumpPressed ? 0.14 : Math.max(0, this.buffer - dt);
    if (this.hanging) return this.hang(dt, input);

    const accel = this.grounded ? 30 : 11;
    const tx = input.dx * this.speed;
    const tz = input.dz * this.speed;
    this.vel.x += Math.max(-accel * dt, Math.min(accel * dt, tx - this.vel.x));
    this.vel.z += Math.max(-accel * dt, Math.min(accel * dt, tz - this.vel.z));

    if (this.grounded) {
      this.coyote = 0.12;
      const g = this.ground;
      if (g) {
        this.pos.x += (g.vx ?? 0) * dt;
        this.pos.z += (g.vz ?? 0) * dt;
        this.pos.y += (g.vy ?? 0) * dt;
      }
    } else this.coyote = Math.max(0, this.coyote - dt);

    if (this.buffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vel.y = this.jumpSpeed;
      this.grounded = false;
      this.ground = null;
      this.coyote = 0;
      this.buffer = 0;
      this.onJump?.();
    }
    if (!this.grounded) {
      const g = this.vel.y > 0 && !input.jumpHeld ? this.gravity * 1.8 : this.gravity;
      this.vel.y = Math.max(this.vel.y - g * dt, -40);
      this.airTime += dt;
    }

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    if (this.grounded) {
      const g = this.ground;
      if (!g || !onPlatform(g, this.pos.x, this.pos.z)) {
        const other = platforms.find((p) => p !== g && onPlatform(p, this.pos.x, this.pos.z) && Math.abs(p.y - this.pos.y) < 0.35);
        if (other) {
          this.ground = other;
          this.pos.y = other.y;
        } else {
          this.grounded = false;
          this.ground = null;
          this.vel.y = 0;
        }
      } else this.pos.y = g.y;
      return;
    }

    // Landing.
    if (this.vel.y <= 0) {
      for (const p of platforms) {
        if (prevY >= p.y - 0.06 && this.pos.y <= p.y && onPlatform(p, this.pos.x, this.pos.z)) {
          this.onLand?.(-this.vel.y);
          this.pos.y = p.y;
          this.vel.y = 0;
          this.grounded = true;
          this.ground = p;
          this.airTime = 0;
          return;
        }
      }
      // Ledge grab: falling past the rim of a circular island.
      for (const p of platforms) {
        if (!p.ledge || p.hx !== undefined) continue;
        const d = Math.hypot(this.pos.x - p.x, this.pos.z - p.z);
        if (d > p.r - 0.1 && d < p.r + 1.4 && this.pos.y < p.y - 0.7 && this.pos.y > p.y - 1.6) {
          const a = Math.atan2(this.pos.z - p.z, this.pos.x - p.x);
          if (p.solidAt && !p.solidAt(p.x + Math.cos(a) * (p.r - 0.4), p.z + Math.sin(a) * (p.r - 0.4))) continue;
          this.hanging = p;
          this.pos.set(p.x + Math.cos(a) * (p.r + 0.25), p.y - 1.05, p.z + Math.sin(a) * (p.r + 0.25));
          this.vel.set(0, 0, 0);
          this.climb = 0;
          this.onGrab?.();
          return;
        }
      }
    }
  }

  private hang(dt: number, input: MoveInput): void {
    const p = this.hanging!;
    const a = Math.atan2(this.pos.z - p.z, this.pos.x - p.x);
    const inward = -(Math.cos(a) * input.dx + Math.sin(a) * input.dz);
    if (this.climb === 0 && (this.buffer > 0 || inward > 0.5)) this.climb = 0.001;
    if (this.climb > 0) {
      this.climb += dt / 0.38;
      const k = Math.min(1, this.climb);
      const r = p.r + 0.25 - k * 0.85;
      this.pos.set(p.x + Math.cos(a) * r, p.y - 1.05 + Math.sin(k * Math.PI * 0.5) * 1.05, p.z + Math.sin(a) * r);
      if (k >= 1) {
        this.hanging = null;
        this.grounded = true;
        this.ground = p;
        this.pos.y = p.y;
        this.buffer = 0;
      }
    } else if (inward < -0.6 || (p.solidAt && !p.solidAt(p.x + Math.cos(a) * (p.r - 0.4), p.z + Math.sin(a) * (p.r - 0.4)))) {
      this.hanging = null; // let go of the edge, or the edge itself crumbled
      this.vel.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
    }
  }

  teleport(x: number, y: number, z: number, ground: Platform | null = null): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.grounded = !!ground;
    this.ground = ground;
    this.hanging = null;
    this.airTime = 0;
  }
}

const CLOAK_COLS = 6;
const CLOAK_ROWS = 9;

export class Visitor {
  readonly group = new Group();
  /** Rotates the body (lean, fall pose) under the heading. */
  readonly body = new Group();
  readonly motion = new Platformer();
  readonly glow: PointLight;
  readonly cloth: Verlet & { cols: number; rows: number };
  private readonly cloak: Mesh;
  private readonly cloakGeo: BufferGeometry;
  private readonly legs: Mesh[] = [];
  private readonly core: Mesh;
  private readonly coreMat: MeshStandardMaterial;
  /** World-space airflow the cloak feels (set by the chapter, e.g. the fall speed). */
  readonly air = new Vector3();
  heading = 0;
  /** 0 standing .. 1 face-down skydive. */
  fallPose = 0;
  /** -1 spread .. 1 tuck. */
  posture = 0;
  /** 0..1 leaning forward onto something. */
  lean = 0;
  glowLevel = 1;
  private walkPhase = 0;
  private readonly _q = new Quaternion();
  private readonly _v = new Vector3();
  private readonly prevPos = new Vector3();
  readonly velocity = new Vector3();

  constructor() {
    // A dusk-blue cloak: the complement of the gold, never a black hole against the sun.
    const cloth = withRim(new MeshStandardMaterial({ color: '#646d98', roughness: 0.7, side: DoubleSide, emissive: new Color('#36385e'), emissiveIntensity: 0.75 }));
    const skin = withRim(new MeshStandardMaterial({ color: '#efe3d0', roughness: 0.6, emissive: new Color('#f5c76b'), emissiveIntensity: 0.12 }));

    const torso = new Mesh(new CapsuleGeometry(0.2, 0.5, 4, 12), cloth);
    torso.position.y = 0.95;
    const head = new Mesh(new SphereGeometry(0.17, 20, 14), skin);
    head.position.y = 1.5;
    // The hood: the cloak drawn up over the head, open at the face.
    const hood = new Mesh(new SphereGeometry(0.205, 24, 16, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.74), cloth);
    hood.position.set(0, 1.51, -0.02);
    hood.scale.set(1, 1.1, 1.06);
    this.coreMat = new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ffd58a'), emissiveIntensity: 3.2 });
    this.core = new Mesh(new SphereGeometry(0.07, 12, 8), this.coreMat);
    this.core.position.set(0, 1.08, 0.17);
    for (const side of [-1, 1]) {
      const leg = new Mesh(new CapsuleGeometry(0.075, 0.5, 3, 8), cloth);
      leg.position.set(side * 0.1, 0.36, 0);
      this.legs.push(leg);
      this.body.add(leg);
    }
    this.body.add(torso, head, hood, this.core);
    this.glow = new PointLight('#ffd9a0', 2.2, 7, 1.6);
    this.glow.position.set(0, 1.1, 0.4);
    this.body.add(this.glow);

    // Cloak: pinned along the shoulders, simulated in the body's frame.
    this.cloth = createCloth([-0.34, 1.36, -0.16], 0.68, 1.15, CLOAK_COLS, CLOAK_ROWS, { iterations: 6, damping: 0.97 });
    for (let c = 0; c <= CLOAK_COLS; c++) this.cloth.pin(c);
    // Shape it: an A-line that wraps around the back and shoulders (narrow at the neck, full at the
    // hem), with the rest lengths taken from that shape so it keeps its fall while it moves.
    for (let r = 0; r <= CLOAK_ROWS; r++) {
      const v = r / CLOAK_ROWS;
      const w = 0.5 + 0.5 * v;
      const span = 2.5 - 0.5 * v;
      const R = w / span;
      for (let c = 0; c <= CLOAK_COLS; c++) {
        const th = (c / CLOAK_COLS - 0.5) * span;
        this.cloth.setPoint(r * (CLOAK_COLS + 1) + c, R * Math.sin(th), 1.38 - v * 1.12, -0.21 + R * (1 - Math.cos(th)) - 0.02 * v);
      }
    }
    for (const k of this.cloth.constraints) {
      const a = this.cloth.getPoint(k.a);
      const b = this.cloth.getPoint(k.b);
      k.rest = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
    for (let c = 0; c <= CLOAK_COLS; c++) this.cloth.pin(c, this.cloth.getPoint(c));
    this.cloth.wind = () => this.windLocal;
    this.cloakGeo = new BufferGeometry();
    this.cloakGeo.setAttribute('position', new BufferAttribute(this.cloth.positions, 3));
    const idx: number[] = [];
    const w = CLOAK_COLS + 1;
    for (let r = 0; r < CLOAK_ROWS; r++) {
      for (let c = 0; c < CLOAK_COLS; c++) {
        const a = r * w + c;
        idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
      }
    }
    this.cloakGeo.setIndex(idx);
    this.cloakGeo.computeVertexNormals();
    this.cloak = new Mesh(this.cloakGeo, cloth);
    this.cloak.frustumCulled = false;
    this.body.add(this.cloak);
    this.group.add(this.body);
    this.group.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
    this.cloak.castShadow = true;
  }

  private windLocal: [number, number, number] = [0, 0, 0];
  private time = 0;

  /** Per frame: pose, cloak, glow. */
  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.velocity.copy(this.group.position).sub(this.prevPos).divideScalar(dt);
    if (this.velocity.length() > 400) this.velocity.set(0, 0, 0); // teleports
    this.prevPos.copy(this.group.position);

    this.group.rotation.y = this.heading;
    const speedH = Math.hypot(this.velocity.x, this.velocity.z);
    const walking = this.fallPose < 0.5 && this.motion.grounded ? Math.min(1, speedH / 4) : 0;
    this.walkPhase += dt * (4 + speedH * 2.2) * (walking > 0.05 ? 1 : 0);
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.walkPhase + i * Math.PI) * 0.7 * walking + (this.fallPose > 0.5 ? -0.25 - this.posture * 0.35 : 0);
      l.position.y = 0.36;
    });
    // Fall pose: face down, chest leading; tuck pitches the head further down.
    const pitch = this.fallPose * (Math.PI * 0.5 - 0.15 + this.posture * 0.25) + this.lean * 0.45;
    this.body.rotation.x = damp(this.body.rotation.x, pitch, 6, dt);
    this.body.position.y = this.fallPose * 0.9;

    // Airflow in the body's frame: world air plus the visitor's own motion, plus a flutter.
    this.group.updateMatrixWorld();
    this.body.getWorldQuaternion(this._q).invert();
    this._v.copy(this.air).sub(this.velocity).multiplyScalar(0.55).applyQuaternion(this._q);
    const flutter = 0.6 + this._v.length() * 0.18;
    const t = this.time;
    this.windLocal = [this._v.x + Math.sin(t * 7.1) * flutter, this._v.y + Math.sin(t * 5.3 + 1) * flutter * 0.6, this._v.z + Math.sin(t * 9.7 + 2) * flutter];
    const g = new Vector3(0, -9.8 * (1 - this.fallPose * 0.85), 0).applyQuaternion(this._q);
    this.cloth.gravity = [g.x, g.y, g.z];
    const steps = Math.min(4, Math.max(1, Math.round(dt / (1 / 60))));
    for (let i = 0; i < steps; i++) this.cloth.step(Math.min(dt, 1 / 30) / steps);
    // Keep the cloak out of the body (a capsule around the torso), so it never clips through.
    const p = this.cloth.positions;
    for (let i = CLOAK_COLS + 1; i < this.cloth.count; i++) {
      const y = p[i * 3 + 1]!;
      if (y < 0.3 || y > 1.4) continue;
      const x = p[i * 3]!;
      const z = p[i * 3 + 2]!;
      const d = Math.hypot(x, z + 0.02);
      if (d < 0.235) {
        const k = 0.235 / Math.max(d, 1e-4);
        p[i * 3] = x * k;
        p[i * 3 + 2] = (z + 0.02) * k - 0.02;
      }
    }
    (this.cloakGeo.attributes.position as BufferAttribute).needsUpdate = true;
    this.cloakGeo.computeVertexNormals();

    const breath = 0.85 + Math.sin(t * 1.6) * 0.15;
    this.coreMat.emissiveIntensity = 3.2 * breath * this.glowLevel;
    this.glow.intensity = 2.2 * breath * this.glowLevel;
  }

  /** Snap the cloak (after a teleport) so it does not whip across the scene. */
  settle(): void {
    this.prevPos.copy(this.group.position);
    this.velocity.set(0, 0, 0);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
