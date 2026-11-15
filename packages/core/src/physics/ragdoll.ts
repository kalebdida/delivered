import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type Material } from 'three';
import { collisionGroup, type ImpulseJoint, type Physics, type RigidBody, type Vec3 } from './physics';

export type RagdollPart =
  | 'pelvis' | 'chest' | 'head'
  | 'upperArmL' | 'lowerArmL' | 'upperArmR' | 'lowerArmR'
  | 'upperLegL' | 'lowerLegL' | 'upperLegR' | 'lowerLegR';

export interface RagdollOptions {
  /** World position of the pelvis. */
  position?: Vec3;
  /** Overall height in metres (default 1.75). */
  height?: number;
  density?: number;
  /** Joint stiffness: angular damping applied to every body (default 2.5; higher is stiffer, heavier). */
  stiffness?: number;
  /** Per-joint swing limits in radians, to override defaults. */
  limits?: Partial<Record<'neck' | 'spine' | 'shoulder' | 'elbow' | 'hip' | 'knee', number>>;
  /** Build simple capsule meshes bound to the bodies (default true). Pass a material to style them. */
  meshes?: boolean;
  material?: Material;
  /** Collision group index 0..15 so ragdoll parts ignore each other (default 1). */
  groupIndex?: number;
}

export interface Ragdoll {
  bodies: Record<RagdollPart, RigidBody>;
  joints: ImpulseJoint[];
  /** Capsule dimensions per part, for sampling surface points (shadow particles). */
  shapes: Record<RagdollPart, { halfHeight: number; radius: number }>;
  /** Meshes bound to the bodies (empty group when `meshes: false`). Add to your scene. */
  group: Group;
  /** Apply the same impulse to every body (shove, wind gust). */
  applyImpulse(impulse: Vec3): void;
  /** Move the whole ragdoll so its pelvis is at `position`, clearing velocities. */
  teleport(position: Vec3): void;
  dispose(): void;
}

/**
 * Humanoid ragdoll: 11 capsule bodies joined by limited spherical and revolute joints.
 * Parts do not collide with each other (they share a collision group), only with the world.
 */
export function createRagdoll(physics: Physics, opts: RagdollOptions = {}): Ragdoll {
  const { R, world } = physics;
  const H = opts.height ?? 1.75;
  const s = H / 1.75;
  const p0 = opts.position ?? { x: 0, y: 1, z: 0 };
  const gi = opts.groupIndex ?? 1;
  const group = collisionGroup(1 << gi, 0xffff & ~(1 << gi));
  const damping = opts.stiffness ?? 2.5;
  const lim = { neck: 0.5, spine: 0.4, shoulder: 1.4, elbow: 2.2, hip: 1.1, knee: 2.2, ...opts.limits };

  // name: [offset from pelvis (x, y, z), halfHeight, radius]
  const spec: Record<RagdollPart, [number, number, number, number, number]> = {
    pelvis: [0, 0, 0, 0.06, 0.13],
    chest: [0, 0.34, 0, 0.13, 0.15],
    head: [0, 0.68, 0, 0.02, 0.11],
    upperArmL: [-0.24, 0.3, 0, 0.11, 0.05],
    lowerArmL: [-0.24, 0.0, 0, 0.11, 0.045],
    upperArmR: [0.24, 0.3, 0, 0.11, 0.05],
    lowerArmR: [0.24, 0.0, 0, 0.11, 0.045],
    upperLegL: [-0.1, -0.33, 0, 0.15, 0.07],
    lowerLegL: [-0.1, -0.75, 0, 0.15, 0.06],
    upperLegR: [0.1, -0.33, 0, 0.15, 0.07],
    lowerLegR: [0.1, -0.75, 0, 0.15, 0.06],
  };
  const bodies = {} as Record<RagdollPart, RigidBody>;
  const shapes = {} as Ragdoll['shapes'];
  const root = new Group();
  const material =
    opts.material ?? new MeshStandardMaterial({ color: '#cfc8bb', roughness: 0.85, metalness: 0 });
  const ownsMaterial = !opts.material;

  for (const name of Object.keys(spec) as RagdollPart[]) {
    const [x, y, z, hh, r] = spec[name];
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(p0.x + x * s, p0.y + y * s, p0.z + z * s)
        .setLinearDamping(0.2)
        .setAngularDamping(damping)
        .setCcdEnabled(name === 'head' || name === 'pelvis'),
    );
    world.createCollider(
      R.ColliderDesc.capsule(hh * s, r * s).setDensity(opts.density ?? 1.2).setFriction(0.9).setCollisionGroups(group),
      body,
    );
    bodies[name] = body;
    shapes[name] = { halfHeight: hh * s, radius: r * s };
    if (opts.meshes ?? true) {
      const geo = name === 'head' ? new SphereGeometry(r * s * 1.15, 20, 14) : new CapsuleGeometry(r * s, hh * s * 2, 6, 14);
      const mesh = new Mesh(geo, material);
      mesh.castShadow = true;
      mesh.name = name;
      root.add(mesh);
      physics.bind(mesh, body);
    }
  }

  const joints: ImpulseJoint[] = [];
  const at = (part: RagdollPart, wx: number, wy: number): Vec3 => {
    const [x, y] = spec[part];
    return { x: (wx - x) * s, y: (wy - y) * s, z: 0 };
  };
  /** Spherical joint at a point given in pelvis space. */
  const ball = (a: RagdollPart, b: RagdollPart, x: number, y: number, _limit: number) => {
    joints.push(world.createImpulseJoint(R.JointData.spherical(at(a, x, y), at(b, x, y)), bodies[a], bodies[b], true));
  };
  /** Hinge joint around the X axis with limits. */
  const hinge = (a: RagdollPart, b: RagdollPart, x: number, y: number, min: number, max: number) => {
    const data = R.JointData.revolute(at(a, x, y), at(b, x, y), { x: 1, y: 0, z: 0 });
    data.limitsEnabled = true;
    data.limits = [min, max];
    joints.push(world.createImpulseJoint(data, bodies[a], bodies[b], true));
  };
  ball('pelvis', 'chest', 0, 0.15, lim.spine);
  ball('chest', 'head', 0, 0.56, lim.neck);
  ball('chest', 'upperArmL', -0.24, 0.45, lim.shoulder);
  ball('chest', 'upperArmR', 0.24, 0.45, lim.shoulder);
  hinge('upperArmL', 'lowerArmL', -0.24, 0.15, -lim.elbow, 0.05);
  hinge('upperArmR', 'lowerArmR', 0.24, 0.15, -lim.elbow, 0.05);
  ball('pelvis', 'upperLegL', -0.1, -0.12, lim.hip);
  ball('pelvis', 'upperLegR', 0.1, -0.12, lim.hip);
  hinge('upperLegL', 'lowerLegL', -0.1, -0.54, -0.05, lim.knee);
  hinge('upperLegR', 'lowerLegR', 0.1, -0.54, -0.05, lim.knee);

  let disposed = false;
  return {
    bodies,
    joints,
    shapes,
    group: root,
    applyImpulse(impulse) {
      for (const b of Object.values(bodies)) b.applyImpulse(impulse, true);
    },
    teleport(position) {
      const pel = bodies.pelvis.translation();
      const d = { x: position.x - pel.x, y: position.y - pel.y, z: position.z - pel.z };
      for (const b of Object.values(bodies)) {
        const t = b.translation();
        b.setTranslation({ x: t.x + d.x, y: t.y + d.y, z: t.z + d.z }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      joints.length = 0;
      for (const b of Object.values(bodies)) physics.remove(b);
      root.traverse((o) => (o as Mesh).geometry?.dispose());
      if (ownsMaterial) material.dispose();
      root.removeFromParent();
    },
  };
}
