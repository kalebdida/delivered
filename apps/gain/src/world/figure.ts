// The visitor: a hooded figure in a heavy cloak, with no face (the hood opens onto shadow). A small
// procedural skeleton blends three poses (sitting on the ledge, standing or walking, kneeling in
// the light); arms and legs are solved with two-bone IK so hands can reach and feet can step.
// The cloak is core Verlet cloth pinned at the shoulders, colliding with the body, so it drapes
// over the knees when seated and swings when walking.
import {
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  Color,
  DoubleSide,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { Verlet, damp } from '@delivered/core';
import { clothMaps } from './textures';

const UP = new Vector3(0, 1, 0);
const THIGH = 0.44;
const SHIN = 0.43;
const UPPER = 0.29;
const FORE = 0.27;

interface Pose {
  pelvis: Vector3;
  chest: Vector3;
  head: Vector3;
  feet: [Vector3, Vector3];
  hands: [Vector3, Vector3];
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Poses in the figure's local frame (facing +Z, origin on the floor under the pelvis). */
const POSES: Record<'stand' | 'sit' | 'kneel', Pose> = {
  stand: { pelvis: v(0, 0.92, 0), chest: v(0, 1.3, 0.01), head: v(0, 1.62, 0.03), feet: [v(0.11, 0.05, 0.02), v(-0.11, 0.05, 0.02)], hands: [v(0.24, 0.84, 0.06), v(-0.24, 0.84, 0.06)] },
  sit: { pelvis: v(0, 0.55, -0.06), chest: v(0, 0.9, 0.05), head: v(0, 1.15, 0.17), feet: [v(0.15, 0.05, 0.44), v(-0.12, 0.05, 0.47)], hands: [v(0.12, 0.64, 0.3), v(-0.1, 0.64, 0.32)] },
  kneel: { pelvis: v(0, 0.66, -0.08), chest: v(0, 1.02, -0.02), head: v(0, 1.31, 0.0), feet: [v(0.12, 0.05, -0.42), v(-0.12, 0.05, -0.42)], hands: [v(0.26, 0.98, 0.24), v(-0.26, 0.98, 0.24)] },
};

/** Two-bone IK: from root toward target with bone lengths a, b; the joint bends toward pole. */
function ik(root: Vector3, target: Vector3, a: number, b: number, pole: Vector3, outJoint: Vector3, outEnd: Vector3): void {
  const dir = target.clone().sub(root);
  let d = dir.length();
  const max = a + b - 1e-4;
  if (d > max) {
    dir.multiplyScalar(max / d);
    d = max;
  }
  d = Math.max(d, Math.abs(a - b) + 1e-4);
  outEnd.copy(root).add(dir);
  const n = dir.clone().normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = pole.clone().sub(n.clone().multiplyScalar(pole.dot(n)));
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1);
  p.normalize();
  outJoint.copy(root).addScaledVector(n, x).addScaledVector(p, h);
}

/** A capsule mesh laid between two points. */
class Limb {
  readonly mesh: Mesh;
  constructor(radius: number, length: number, material: MeshStandardMaterial) {
    this.mesh = new Mesh(new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }
  place(a: Vector3, b: Vector3): void {
    this.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    const d = b.clone().sub(a);
    const len = d.length();
    if (len > 1e-5) this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  }
}

const COLS = 15;
const ROWS = 15;
const ROW_STEP = 0.072;
const ang = (c: number) => Math.PI * 0.13 + (c / (COLS - 1)) * Math.PI * 1.74;

/** The cloak: Verlet cloth in world space, written into a local-space mesh each frame. */
class Cloak {
  readonly sim: Verlet;
  readonly mesh: Mesh;
  private readonly geo: BufferGeometry;
  private readonly local: Float32Array;
  /** Collision spheres (world): x, y, z, r. */
  spheres: number[] = [];
  /** Extra world colliders (the stone ledge). */
  collide: ((p: Float32Array, i: number) => void) | null = null;

  constructor(material: MeshPhysicalMaterial) {
    const n = COLS * ROWS;
    this.sim = new Verlet(n, { iterations: 7, damping: 0.965 });
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const a = ang(c);
        const rad = 0.2 + r * 0.02;
        this.sim.setPoint(r * COLS + c, Math.sin(a) * rad, 1.4 - r * ROW_STEP, Math.cos(a) * rad);
      }
    }
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (c < COLS - 1) this.sim.constrain(i, i + 1);
        if (r < ROWS - 1) this.sim.constrain(i, i + COLS);
        if (c < COLS - 2) this.sim.constrain(i, i + 2, undefined, 0.35);
        if (r < ROWS - 2) this.sim.constrain(i, i + COLS * 2, undefined, 0.5);
      }
    }
    for (let c = 0; c < COLS; c++) this.sim.pin(c);
    this.sim.floorY = 0.015;

    this.geo = new BufferGeometry();
    this.local = new Float32Array(n * 3);
    this.geo.setAttribute('position', new BufferAttribute(this.local, 3));
    const uv = new Float32Array(n * 2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        uv[(r * COLS + c) * 2] = c / (COLS - 1);
        uv[(r * COLS + c) * 2 + 1] = 1 - r / (ROWS - 1);
      }
    }
    this.geo.setAttribute('uv', new BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let c = 0; c < COLS - 1; c++) {
        const i = r * COLS + c;
        idx.push(i, i + COLS, i + 1, i + 1, i + COLS, i + COLS + 1);
      }
    }
    this.geo.setIndex(idx);
    this.mesh = new Mesh(this.geo, material);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }

  /** Place the pinned top row around the shoulders (world), opening at the front. */
  pinTo(neck: Vector3, frame: Matrix4): void {
    for (let c = 0; c < COLS; c++) {
      const a = ang(c);
      const p = new Vector3(Math.sin(a) * 0.235, -0.04 - Math.abs(Math.cos(a)) * 0.015, Math.cos(a) * 0.17 - 0.01).add(neck).applyMatrix4(frame);
      this.sim.movePin(c, p.x, p.y, p.z);
    }
  }

  /** Hang the whole cloak straight down from its pins (no settling flail on entry). */
  reset(): void {
    const p = this.sim.positions;
    for (let r = 1; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = (r * COLS + c) * 3;
        const t = c * 3;
        p[i] = p[t]!;
        p[i + 1] = p[t + 1]! - r * ROW_STEP;
        p[i + 2] = p[t + 2]!;
      }
    }
    this.sim.previous.set(p);
  }

  step(dt: number): void {
    this.sim.step(dt);
    const p = this.sim.positions;
    const s = this.spheres;
    for (let i = COLS; i < this.sim.count; i++) {
      const o = i * 3;
      for (let k = 0; k < s.length; k += 4) {
        const dx = p[o]! - s[k]!;
        const dy = p[o + 1]! - s[k + 1]!;
        const dz = p[o + 2]! - s[k + 2]!;
        const r = s[k + 3]! + 0.014;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 1e-5;
          p[o] = s[k]! + (dx / d) * r;
          p[o + 1] = s[k + 1]! + (dy / d) * r;
          p[o + 2] = s[k + 2]! + (dz / d) * r;
        }
      }
      this.collide?.(p, i);
    }
  }

  write(inv: Matrix4): void {
    const p = this.sim.positions;
    const e = inv.elements;
    for (let i = 0; i < this.sim.count; i++) {
      const x = p[i * 3]!;
      const y = p[i * 3 + 1]!;
      const z = p[i * 3 + 2]!;
      this.local[i * 3] = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      this.local[i * 3 + 1] = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      this.local[i * 3 + 2] = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
    }
    this.geo.attributes.position!.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  dispose(): void {
    this.geo.dispose();
  }
}

export class Figure {
  readonly group = new Group();
  /** Pose weights; standing is whatever is left. */
  sit = 1;
  kneel = 0;
  /** Facing angle around Y (0 faces +Z). */
  heading = 0;
  /** Speed in m/s, drives the step cycle. */
  speed = 0;
  /** World-space reach targets for each hand, with how much to follow them (0..1). */
  readonly reach: [{ target: Vector3; weight: number }, { target: Vector3; weight: number }] = [
    { target: new Vector3(), weight: 0 },
    { target: new Vector3(), weight: 0 },
  ];
  /** Head tilt toward a world point (0..1). */
  look = { target: new Vector3(), weight: 0 };
  /** Warm inner glow on the robe (later chapters), 0..1. */
  glow = 0;

  private readonly robe: MeshPhysicalMaterial;
  private readonly cloakMat: MeshPhysicalMaterial;
  private readonly torso: Mesh;
  private readonly mantle: Mesh;
  private readonly cloak: Cloak;
  private readonly hood: Group;
  private readonly limbs: Record<'thighL' | 'thighR' | 'shinL' | 'shinR' | 'upperL' | 'upperR' | 'foreL' | 'foreR', Limb>;
  private readonly hands: Mesh[] = [];
  private readonly cuffs: Mesh[] = [];
  private readonly wristW = [new Vector3(), new Vector3()];
  private phase = 0;
  private clock = 0;
  private acc = 0;
  private settled = false;

  constructor() {
    const wool = clothMaps();
    for (const t of [wool.map, wool.normalMap, wool.roughnessMap]) t.repeat.set(3, 3);
    this.robe = new MeshPhysicalMaterial({ color: '#2c2723', roughness: 1, roughnessMap: wool.roughnessMap, normalMap: wool.normalMap, map: wool.map, sheen: 0.45, sheenColor: new Color('#7d7064'), sheenRoughness: 0.8 });
    this.robe.normalScale.set(1.2, 1.2);
    this.cloakMat = this.robe.clone();
    this.cloakMat.color.set('#26211d');
    this.cloakMat.side = DoubleSide;
    const dark = new MeshStandardMaterial({ color: '#0a0807', roughness: 1 });
    const skin = new MeshStandardMaterial({ color: '#4a3326', roughness: 0.75 });
    const iron = new MeshStandardMaterial({ color: '#2e2b29', roughness: 0.45, metalness: 0.65 });

    // Torso: a lathe from hips to shoulders.
    const tp = [[0.0, 0.0], [0.15, 0.0], [0.18, 0.08], [0.17, 0.22], [0.16, 0.33], [0.12, 0.4], [0.06, 0.44], [0.0, 0.44]].map(([x, y]) => new Vector2(x, y));
    this.torso = new Mesh(new LatheGeometry(tp, 20), this.robe);
    this.torso.castShadow = this.torso.receiveShadow = true;
    // Mantle: the heavy fold of cloth over the shoulders.
    const mp = [[0.0, 0.03], [0.09, 0.03], [0.17, -0.02], [0.215, -0.1], [0.2, -0.15], [0.0, -0.15]].map(([x, y]) => new Vector2(x, y));
    this.mantle = new Mesh(new LatheGeometry(mp, 24), this.cloakMat);
    this.mantle.castShadow = true;
    this.cloak = new Cloak(this.cloakMat);

    // Hood: an outer shell open at the front; inside it only shadow. No face, ever.
    this.hood = new Group();
    const shell = new Mesh(new SphereGeometry(0.14, 22, 16, Math.PI * 0.64, Math.PI * 1.72, 0, Math.PI * 0.82), this.cloakMat);
    shell.scale.set(1, 1.15, 1.12);
    const inner = new Mesh(new SphereGeometry(0.112, 16, 12), dark);
    inner.scale.set(1, 1.06, 1);
    inner.position.z = -0.015;
    // The hood rises to a soft point at the back of the crown.
    const peak = new Mesh(new SphereGeometry(0.11, 14, 10), this.cloakMat);
    peak.position.set(0, 0.035, -0.045);
    peak.scale.set(1.0, 1.25, 1.15);
    // A soft point at the back of the hood, and its fold down the nape: from behind it reads as a hood, not a ball.
    const tip = new Mesh(new ConeGeometry(0.075, 0.16, 12), this.cloakMat);
    tip.position.set(0, 0.11, -0.1);
    tip.rotation.x = -0.75;
    const nape = new Mesh(new ConeGeometry(0.12, 0.2, 14, 1, true), this.cloakMat);
    nape.position.set(0, -0.1, -0.06);
    nape.rotation.x = 0.15;
    this.hood.add(shell, inner, peak, tip, nape);
    this.hood.traverse((o) => ((o as Mesh).castShadow = true));

    this.limbs = {
      thighL: new Limb(0.1, THIGH, this.robe),
      thighR: new Limb(0.1, THIGH, this.robe),
      shinL: new Limb(0.078, SHIN, this.robe),
      shinR: new Limb(0.078, SHIN, this.robe),
      upperL: new Limb(0.062, UPPER, this.robe),
      upperR: new Limb(0.062, UPPER, this.robe),
      foreL: new Limb(0.056, FORE, this.robe),
      foreR: new Limb(0.056, FORE, this.robe),
    };
    for (const l of Object.values(this.limbs)) this.group.add(l.mesh);
    for (let i = 0; i < 2; i++) {
      const hand = new Mesh(new SphereGeometry(0.032, 10, 8), skin);
      hand.scale.set(0.75, 1.2, 0.6);
      hand.castShadow = true;
      this.hands.push(hand);
      const cuff = new Mesh(new TorusGeometry(0.05, 0.014, 6, 16), iron);
      cuff.castShadow = true;
      this.cuffs.push(cuff);
      this.group.add(hand, cuff);
    }
    this.group.add(this.torso, this.mantle, this.hood, this.cloak.mesh);
  }

  /** Extra collider for the cloak (the room sets the stone ledge). */
  set cloakCollider(fn: ((p: Float32Array, i: number) => void) | null) {
    this.cloak.collide = fn;
  }

  /** World position of a wrist (0 right, 1 left), for the chains. */
  wrist(i: 0 | 1): Vector3 {
    return this.wristW[i]!;
  }

  /** World position of the head. */
  headPosition(out = new Vector3()): Vector3 {
    return this.hood.getWorldPosition(out);
  }

  /** Re-hang the cloak (after a teleport). */
  settle(): void {
    this.settled = false;
  }

  private blend(): Pose {
    const st = Math.max(0, 1 - this.sit - this.kneel);
    const mix = (k: (p: Pose) => Vector3) =>
      new Vector3().addScaledVector(k(POSES.stand), st).addScaledVector(k(POSES.sit), this.sit).addScaledVector(k(POSES.kneel), this.kneel);
    return {
      pelvis: mix((p) => p.pelvis),
      chest: mix((p) => p.chest),
      head: mix((p) => p.head),
      feet: [mix((p) => p.feet[0]), mix((p) => p.feet[1])],
      hands: [mix((p) => p.hands[0]), mix((p) => p.hands[1])],
    };
  }

  update(dt: number): void {
    this.clock += dt;
    this.group.rotation.y = this.heading;
    this.group.updateMatrixWorld(true);
    const world = this.group.matrixWorld;
    const pose = this.blend();
    const standW = Math.max(0, 1 - this.sit - this.kneel);
    // Breath and the walking cycle.
    this.phase += dt * (this.speed > 0.05 ? 1.5 + this.speed * 4.2 : 0);
    const breath = Math.sin(this.clock * 1.1) * 0.007;
    pose.chest.y += breath;
    pose.head.y += breath * 1.2;
    const stride = Math.min(1, this.speed / 0.9) * standW;
    if (stride > 0.01) {
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      pose.feet[0].z += s * 0.2 * stride;
      pose.feet[1].z -= s * 0.2 * stride;
      pose.feet[0].y += Math.max(0, c) * 0.07 * stride;
      pose.feet[1].y += Math.max(0, -c) * 0.07 * stride;
      pose.pelvis.y += Math.abs(c) * 0.025 * stride - 0.02 * stride;
      pose.hands[0].z -= s * 0.08 * stride;
      pose.hands[1].z += s * 0.08 * stride;
    }

    // Torso.
    this.torso.position.copy(pose.pelvis);
    const spine = pose.chest.clone().sub(pose.pelvis);
    const spineLen = spine.length();
    const spineDir = spine.clone().normalize();
    this.torso.quaternion.setFromUnitVectors(UP, spineDir);
    this.torso.scale.set(1, (spineLen + 0.12) / 0.44, 1);
    const neck = pose.pelvis.clone().addScaledVector(spineDir, spineLen + 0.12);
    this.mantle.position.copy(neck);
    this.mantle.quaternion.copy(this.torso.quaternion);

    // Head (tilting toward a look target if asked).
    this.hood.position.copy(pose.head);
    const fwd = new Vector3(0, -0.35 * this.sit, 1).normalize();
    if (this.look.weight > 0) {
      const local = this.group.worldToLocal(this.look.target.clone()).sub(pose.head).normalize();
      fwd.lerp(local, this.look.weight).normalize();
    }
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), fwd);
    this.hood.quaternion.slerp(q, dt > 0 ? 1 - Math.exp(-dt * 4) : 1);

    // Legs, and the collision spheres the cloak drapes over.
    const spheres: number[] = [];
    const sphere = (p: Vector3, r: number) => {
      const w = p.clone().applyMatrix4(world);
      spheres.push(w.x, w.y, w.z, r);
    };
    const right = new Vector3(1, 0, 0);
    const legs: Array<['thighL' | 'thighR', 'shinL' | 'shinR', number, 0 | 1]> = [
      ['thighR', 'shinR', 1, 0],
      ['thighL', 'shinL', -1, 1],
    ];
    for (const [th, sh, side, fi] of legs) {
      const hip = pose.pelvis.clone().addScaledVector(right, side * 0.1).add(new Vector3(0, -0.03, 0));
      const knee = new Vector3();
      const foot = new Vector3();
      ik(hip, pose.feet[fi]!, THIGH, SHIN, new Vector3(side * 0.12, 0.25, 1), knee, foot);
      this.limbs[th].place(hip, knee);
      this.limbs[sh].place(knee, foot);
      for (const t of [0.15, 0.5, 0.85]) sphere(hip.clone().lerp(knee, t), 0.11);
      sphere(knee, 0.1);
      for (const t of [0.4, 0.8]) sphere(knee.clone().lerp(foot, t), 0.085);
    }
    sphere(pose.pelvis.clone().add(new Vector3(0, 0.05, 0)), 0.2);
    sphere(pose.pelvis.clone().lerp(neck, 0.45), 0.19);
    sphere(pose.pelvis.clone().lerp(neck, 0.8), 0.18);

    // Arms.
    const arms: Array<['upperR' | 'upperL', 'foreR' | 'foreL', number, 0 | 1]> = [
      ['upperR', 'foreR', 1, 0],
      ['upperL', 'foreL', -1, 1],
    ];
    const inv = world.clone().invert();
    for (const [up, fo, side, hi] of arms) {
      const shoulder = neck.clone().add(new Vector3(side * 0.19, -0.07, 0)).addScaledVector(spineDir, -0.02);
      let target = pose.hands[hi]!.clone();
      const r = this.reach[hi]!;
      if (r.weight > 0) target = target.lerp(r.target.clone().applyMatrix4(inv), r.weight);
      const elbow = new Vector3();
      const wrist = new Vector3();
      ik(shoulder, target, UPPER, FORE, new Vector3(side * 0.6, -0.5, -0.6), elbow, wrist);
      this.limbs[up].place(shoulder, elbow);
      this.limbs[fo].place(elbow, wrist);
      const hand = this.hands[hi]!;
      const fdir = wrist.clone().sub(elbow).normalize();
      hand.position.copy(wrist).addScaledVector(fdir, 0.035);
      hand.quaternion.setFromUnitVectors(UP, fdir);
      const cuff = this.cuffs[hi]!;
      cuff.position.copy(wrist).addScaledVector(fdir, -0.02);
      cuff.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), fdir);
      this.wristW[hi]!.copy(wrist).applyMatrix4(world);
      sphere(shoulder.clone().lerp(elbow, 0.5), 0.075);
      sphere(elbow, 0.07);
      sphere(elbow.clone().lerp(wrist, 0.5), 0.065);
    }

    // Cloak: pin to the shoulders and simulate at a fixed 60 Hz.
    this.cloak.spheres = spheres;
    this.cloak.pinTo(neck, world);
    if (!this.settled) {
      this.cloak.reset();
      for (let i = 0; i < 90; i++) this.cloak.step(1 / 60);
      this.settled = true;
    }
    this.acc = Math.min(this.acc + dt, 1 / 15);
    while (this.acc >= 1 / 60) {
      this.cloak.step(1 / 60);
      this.acc -= 1 / 60;
    }
    this.cloak.write(inv);

    // Glow (warm light from within, later chapters).
    for (const m of [this.robe, this.cloakMat]) {
      m.emissive.set('#ff9a3c');
      m.emissiveIntensity = this.glow * 0.3;
    }
  }

  /** Smoothly move pose weights toward targets. */
  easePose(targetSit: number, targetKneel: number, dt: number, rate = 2.2): void {
    this.sit = damp(this.sit, targetSit, rate, dt);
    this.kneel = damp(this.kneel, targetKneel, rate, dt);
  }

  dispose(): void {
    this.cloak.dispose();
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as MeshStandardMaterial | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}
