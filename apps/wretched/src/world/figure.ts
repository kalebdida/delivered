// The visitor: a figure of soft matte clay-light. Procedural walk cycle with a two-bone IK foot
// plant on the terrain, and a few blendable poses (strain, strike, kneel, look up, fall).
import { CapsuleGeometry, Color, DoubleSide, Group, LatheGeometry, Mesh, MeshStandardMaterial, SphereGeometry, Vector2, Vector3, type Object3D } from 'three';
import { clamp, damp } from '@delivered/core';
import { heightAt } from './terrain';

const THIGH = 0.45;
const SHIN = 0.45;
const HIP_Y = 0.94;

export interface Pose {
  /** Forward lean of the torso (radians, negative leans back). */
  lean: number;
  /** 0 standing .. 1 on the knees. */
  kneel: number;
  /** Head pitch (negative looks up). */
  head: number;
  /** Arms raised forward/up (0 .. 1). */
  reach: number;
  /** 0 .. 1 lying on the ground (yanked off the feet). */
  fall: number;
  /** Strike swing of the right arm, 0 .. 1. */
  strike: number;
  /** Strain: both arms pull back on the chain. */
  strain: number;
}

const ZERO: Pose = { lean: 0, kneel: 0, head: 0, reach: 0, fall: 0, strike: 0, strain: 0 };

export function clayMaterial(
  color = '#d8cdbd',
  emissive = '#4a3622',
): MeshStandardMaterial & { userData: { rim: { value: Color }; rimPower: { value: number } } } {
  const m = new MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, emissive: new Color(emissive), emissiveIntensity: 1 });
  const rim = { value: new Color('#ffd9a0').multiplyScalar(0.8) };
  const rimPower = { value: 2.6 };
  m.userData.rim = rim;
  m.userData.rimPower = rimPower;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.uniforms.uRimPower = rimPower;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uRimPower;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Subsurface-ish glow: light seems to come from inside at grazing angles.
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * pow(1.0 - facing, uRimPower);`,
      );
  };
  m.customProgramCacheKey = () => 'wretched-clay';
  return m as MeshStandardMaterial & { userData: { rim: { value: Color }; rimPower: { value: number } } };
}

interface Leg {
  side: number;
  thigh: Group;
  shin: Group;
  foot: Mesh;
  /** Foot world position while planted. */
  plant: Vector3;
  planted: boolean;
}

export class Figure {
  readonly group = new Group();
  readonly material = clayMaterial();
  /** The cloak and hood: a heavier, darker cloth than the clay, double-sided so the hood reads hollow. */
  readonly cloth = clayMaterial('#b9ab98', '#2e2116');
  readonly hips = new Group();
  readonly chest = new Group();
  readonly head = new Group();
  private readonly legs: Leg[] = [];
  private readonly arms: { side: number; upper: Group; lower: Group }[] = [];
  private phase = 0;
  readonly pose: Pose = { ...ZERO };
  readonly target: Pose = { ...ZERO };
  /** Heading in radians (0 faces +z). */
  heading = Math.PI;
  /** Current ground speed in m/s (set by the world). */
  speed = 0;
  /** Fires when a foot touches down: (world position, heading). */
  onStep: ((p: Vector3, heading: number, side: number) => void) | null = null;
  private readonly tmp = new Vector3();

  constructor() {
    const m = this.material;
    const cap = (r: number, len: number) => {
      const mesh = new Mesh(new CapsuleGeometry(r, len, 6, 14), m);
      mesh.position.y = -len / 2 - r * 0.2;
      mesh.castShadow = true;
      return mesh;
    };
    this.group.add(this.hips);
    this.hips.position.y = HIP_Y;
    const pelvis = new Mesh(new SphereGeometry(0.15, 20, 14), m);
    pelvis.scale.set(1.15, 0.8, 0.85);
    pelvis.castShadow = true;
    this.hips.add(pelvis, this.chest);
    this.chest.position.y = 0.08;
    const torso = new Mesh(new CapsuleGeometry(0.16, 0.36, 6, 16), m);
    torso.position.y = 0.3;
    torso.scale.set(1.1, 1, 0.75);
    torso.castShadow = true;
    this.chest.add(torso, this.head);
    this.head.position.y = 0.66;
    // Inside the hood there is only shadow: no face, in any room.
    const shade = new MeshStandardMaterial({ color: '#1c1714', roughness: 1 });
    const skull = new Mesh(new SphereGeometry(0.115, 24, 18), shade);
    skull.scale.set(0.92, 1.1, 1);
    skull.position.y = 0.06;
    skull.castShadow = true;
    const neck = new Mesh(new CapsuleGeometry(0.045, 0.08, 4, 8), m);
    neck.position.y = -0.04;
    this.head.add(skull, neck);

    // The silhouette: a hooded cloak. A mantle over the shoulders, a skirt that flares from the
    // hips to below the knee (wide enough for the stride), and a deep hood that shades the face.
    const cloth = this.cloth;
    cloth.side = DoubleSide;
    const lathe = (pts: [number, number][], segs = 28) => {
      const mesh = new Mesh(new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), segs), cloth);
      mesh.castShadow = true;
      return mesh;
    };
    const mantle = lathe([[0.07, 0.64], [0.15, 0.6], [0.25, 0.53], [0.295, 0.42], [0.29, 0.22], [0.28, 0.02], [0.285, -0.08]]);
    mantle.scale.set(1, 1, 0.78);
    this.chest.add(mantle);
    const skirt = lathe([[0.24, 0.04], [0.27, -0.12], [0.3, -0.32], [0.34, -0.52], [0.37, -0.66]]);
    skirt.scale.set(1, 1, 0.92);
    this.hips.add(skirt);
    // Hood: a sphere opened toward the face (+z), drawn back into a soft point behind the head.
    const hood = new Mesh(new SphereGeometry(0.165, 28, 20, Math.PI / 2 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.78), cloth);
    hood.scale.set(1, 1.12, 1.12);
    hood.position.set(0, 0.075, -0.025);
    hood.castShadow = true;
    // Draw the crown back into a soft peak so the hood reads as cloth, not a larger skull.
    const hp = hood.geometry.attributes.position!;
    for (let i = 0; i < hp.count; i++) {
      const y = hp.getY(i);
      const z = hp.getZ(i);
      if (y > 0 && z < 0.02) {
        const k = (y / 0.165) * Math.min(1, (0.02 - z) / 0.12);
        hp.setY(i, y + k * 0.05);
        hp.setZ(i, z - k * 0.07);
      }
    }
    hood.geometry.computeVertexNormals();
    this.head.add(hood);

    for (const side of [-1, 1]) {
      const upper = new Group();
      upper.position.set(side * 0.22, 0.52, 0);
      upper.add(cap(0.05, 0.26));
      const lower = new Group();
      lower.position.y = -0.31;
      lower.add(cap(0.043, 0.24));
      const hand = new Mesh(new SphereGeometry(0.05, 12, 10), m);
      hand.position.y = -0.33;
      hand.scale.set(0.8, 1.1, 0.6);
      lower.add(hand);
      upper.add(lower);
      this.chest.add(upper);
      this.arms.push({ side, upper, lower });

      const thigh = new Group();
      thigh.position.set(side * 0.1, -0.04, 0);
      thigh.add(cap(0.07, THIGH - 0.1));
      const shin = new Group();
      shin.position.y = -THIGH;
      shin.add(cap(0.055, SHIN - 0.1));
      const foot = new Mesh(new CapsuleGeometry(0.045, 0.12, 4, 8), m);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(0, -SHIN + 0.02, 0.05);
      foot.castShadow = true;
      shin.add(foot);
      thigh.add(shin);
      this.hips.add(thigh);
      this.legs.push({ side, thigh, shin, foot, plant: new Vector3(), planted: false });
    }
  }

  get position(): Vector3 {
    return this.group.position;
  }

  /** World position of the left ankle (where the chain is fastened). */
  ankle(out: Vector3): Vector3 {
    const leg = this.legs[0]!;
    return leg.shin.localToWorld(out.set(0, -SHIN + 0.08, 0));
  }

  /** World position of the right hand (for carrying a stone). */
  hand(out: Vector3, side = 1): Vector3 {
    const arm = this.arms.find((a) => a.side === side)!;
    return arm.lower.localToWorld(out.set(0, -0.33, 0));
  }

  get rightHand(): Object3D {
    return this.arms.find((a) => a.side === 1)!.lower;
  }

  place(x: number, z: number, heading = Math.PI): void {
    this.group.position.set(x, heightAt(x, z), z);
    this.heading = heading;
    this.group.rotation.y = heading;
    for (const l of this.legs) l.planted = false;
  }

  update(dt: number, time: number): void {
    const p = this.pose;
    const t = this.target;
    const k = 7;
    (Object.keys(p) as (keyof Pose)[]).forEach((key) => (p[key] = damp(p[key], t[key], key === 'fall' || key === 'strike' ? 10 : k, dt)));

    this.group.rotation.y = this.heading;
    const ground = heightAt(this.group.position.x, this.group.position.z);
    this.group.position.y = ground;

    const sp = this.speed;
    const moving = clamp(sp / 1.6);
    const stride = 0.34 + 0.32 * moving;
    this.phase += (sp / (stride * 2)) * dt * Math.PI * 2 * 0.5;
    const breathe = Math.sin(time * 1.6) * 0.01;
    const bob = Math.abs(Math.sin(this.phase)) * 0.045 * moving;

    // Hips: lowered when kneeling or fallen, bobbing when walking.
    const hipY = HIP_Y - p.kneel * 0.42 - p.fall * 0.72 + bob - 0.03 * moving;
    this.hips.position.y = hipY + breathe * 0.5;
    this.hips.rotation.x = -p.fall * 1.35;
    this.hips.rotation.y = Math.sin(this.phase) * 0.12 * moving;
    this.chest.rotation.x = p.lean + 0.1 * moving + p.kneel * 0.25 + p.strain * -0.32;
    this.chest.rotation.y = -Math.sin(this.phase) * 0.18 * moving;
    this.head.rotation.x = p.head + breathe + p.kneel * 0.3 - p.fall * 0.2;

    // Arms swing against the legs; reach lifts them, strain pulls them back, strike swings the right.
    for (const a of this.arms) {
      const swing = Math.sin(this.phase + (a.side > 0 ? 0 : Math.PI)) * 0.55 * moving;
      a.upper.rotation.x = swing - p.reach * 2.4 + p.strain * 0.7 + (a.side > 0 ? -p.strike * 2.6 : 0) + p.kneel * 0.15;
      a.upper.rotation.z = a.side * (0.08 + p.reach * 0.35 + p.strain * 0.15);
      a.lower.rotation.x = -0.25 - 0.35 * moving - p.strain * 0.9 - (a.side > 0 ? p.strike * 0.4 : 0) - p.reach * 0.2;
    }

    // Legs: stance foot stays planted on the terrain, swing foot arcs forward. Two-bone IK.
    this.group.updateMatrixWorld(true);
    for (const leg of this.legs) {
      const ph = this.phase + (leg.side > 0 ? Math.PI : 0);
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      // Foot target in hip-local space (z forward, y down from the hip).
      let fz = c * stride * 0.5;
      let lift = Math.max(0, s) * 0.13 * moving;
      // Foot planting: ground under the projected foot.
      const local = this.tmp.set(leg.side * 0.1, 0, fz).applyAxisAngle(UP, this.heading).add(this.group.position);
      let fy = heightAt(local.x, local.z) - this.group.position.y + 0.06;
      const stance = s <= 0;
      if (stance && !leg.planted && moving > 0.1) {
        leg.planted = true;
        this.onStep?.(local.clone(), this.heading, leg.side);
      } else if (!stance) leg.planted = false;
      // Kneel: feet slide behind, knees down.
      fz = fz * (1 - p.kneel) - p.kneel * 0.42;
      fy = fy * (1 - p.kneel) + p.kneel * 0.05;
      lift *= 1 - p.kneel;
      const dz = fz;
      const dy = fy + lift - (this.hips.position.y - 0.04);
      const d = clamp(Math.hypot(dz, dy), 0.12, THIGH + SHIN - 0.002);
      const phi = Math.atan2(dz, -dy);
      const alpha = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
      const beta = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
      // Bones point down; rotation.x = -angle swings them forward (+z).
      leg.thigh.rotation.x = -(phi + alpha) * (1 - p.fall);
      leg.shin.rotation.x = (Math.PI - beta) * (1 - p.fall);
      leg.foot.rotation.x = Math.PI / 2 - (leg.thigh.rotation.x + leg.shin.rotation.x) * 0.6;
    }
  }

  dispose(): void {
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.material.dispose();
    this.cloth.dispose();
  }
}

const UP = new Vector3(0, 1, 0);
