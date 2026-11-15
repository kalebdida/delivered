import type { ImpulseJoint, Physics, RigidBody, Vec3 } from './physics';

export interface ChainOptions {
  /** World position of the first link. */
  from: Vec3;
  /** World position of the last link. */
  to: Vec3;
  /** Number of links (default 14). */
  links?: number;
  /** Link collider radius (default 0.06). */
  radius?: number;
  density?: number;
  /** Attach the first link to this body (at `fromAnchor` in its local space). */
  fromBody?: RigidBody;
  fromAnchor?: Vec3;
  /** Attach the last link to this body. */
  toBody?: RigidBody;
  toAnchor?: Vec3;
  /**
   * Stretch (metres beyond rest length, per joint) at which a joint snaps.
   * `Infinity` (default) makes the chain unbreakable no matter what the visitor does.
   */
  breakStretch?: number;
  onBreak?: (jointIndex: number) => void;
  /** Collision groups for the links. */
  group?: number;
}

export interface Chain {
  /** One rigid body per link, first to last. */
  links: RigidBody[];
  /** Joints between links (and to the end bodies). Entries become null once broken. */
  joints: (ImpulseJoint | null)[];
  /** Distance between link centres at rest. */
  spacing: number;
  /** Current tension estimate, 0 (slack) .. 1+ (about to break). */
  tension(): number;
  /** Break a joint deliberately (deliverance). Index into `joints`. */
  breakAt(jointIndex: number): void;
  dispose(): void;
}

const ZERO = { x: 0, y: 0, z: 0 };

/**
 * A chain of capsule links joined by spherical joints. Breakable when `breakStretch` is finite:
 * a joint snaps when its two anchors are pulled further apart than that.
 */
export function createChain(physics: Physics, opts: ChainOptions): Chain {
  const { R, world } = physics;
  const n = opts.links ?? 14;
  const radius = opts.radius ?? 0.06;
  const breakStretch = opts.breakStretch ?? Infinity;
  const d = { x: opts.to.x - opts.from.x, y: opts.to.y - opts.from.y, z: opts.to.z - opts.from.z };
  const length = Math.hypot(d.x, d.y, d.z) || 1;
  const spacing = length / Math.max(1, n - 1);
  const half = spacing / 2;
  const links: RigidBody[] = [];
  const joints: (ImpulseJoint | null)[] = [];
  // Orientation: rotate local Y onto the chain direction.
  const dir = { x: d.x / length, y: d.y / length, z: d.z / length };
  const q = quatFromY(dir);

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(opts.from.x + d.x * t, opts.from.y + d.y * t, opts.from.z + d.z * t)
        .setRotation(q)
        .setLinearDamping(0.25)
        .setAngularDamping(0.9),
    );
    const c = R.ColliderDesc.capsule(Math.max(half - radius, 0.01), radius).setDensity(opts.density ?? 6).setFriction(0.8);
    if (opts.group !== undefined) c.setCollisionGroups(opts.group);
    world.createCollider(c, body);
    links.push(body);
  }
  const pairs: { a: RigidBody; b: RigidBody; aAnchor: Vec3; bAnchor: Vec3 }[] = [];
  if (opts.fromBody) pairs.push({ a: opts.fromBody, b: links[0]!, aAnchor: opts.fromAnchor ?? ZERO, bAnchor: { x: 0, y: -half, z: 0 } });
  for (let i = 0; i < n - 1; i++) {
    pairs.push({ a: links[i]!, b: links[i + 1]!, aAnchor: { x: 0, y: half, z: 0 }, bAnchor: { x: 0, y: -half, z: 0 } });
  }
  if (opts.toBody) pairs.push({ a: links[n - 1]!, b: opts.toBody, aAnchor: { x: 0, y: half, z: 0 }, bAnchor: opts.toAnchor ?? ZERO });
  for (const p of pairs) {
    joints.push(world.createImpulseJoint(R.JointData.spherical(p.aAnchor, p.bAnchor), p.a, p.b, true));
  }

  const stretchOf = (i: number): number => {
    const p = pairs[i]!;
    const a = worldPoint(p.a, p.aAnchor);
    const b = worldPoint(p.b, p.bAnchor);
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  };
  const breakAt = (i: number) => {
    const j = joints[i];
    if (!j) return;
    world.removeImpulseJoint(j, true);
    joints[i] = null;
    opts.onBreak?.(i);
  };
  const off = Number.isFinite(breakStretch)
    ? physics.onStep(() => {
        for (let i = 0; i < joints.length; i++) if (joints[i] && stretchOf(i) > breakStretch) breakAt(i);
      })
    : () => {};

  return {
    links,
    joints,
    spacing,
    tension() {
      let max = 0;
      for (let i = 0; i < joints.length; i++) if (joints[i]) max = Math.max(max, stretchOf(i));
      return Number.isFinite(breakStretch) ? max / breakStretch : max / 0.05;
    },
    breakAt,
    dispose() {
      off();
      for (const j of joints) if (j) world.removeImpulseJoint(j, true);
      for (const b of links) physics.remove(b);
      links.length = 0;
      joints.length = 0;
    },
  };
}

export interface RopeOptions {
  from: Vec3;
  to: Vec3;
  segments?: number;
  radius?: number;
  fromBody?: RigidBody;
  toBody?: RigidBody;
}

/**
 * A physical rope: small balls joined by rope joints (max-distance constraints), so it goes slack
 * and collides with the world. For purely visual ropes prefer the cheaper `Verlet`.
 */
export function createPhysicsRope(physics: Physics, opts: RopeOptions): { nodes: RigidBody[]; dispose(): void } {
  const { R, world } = physics;
  const n = opts.segments ?? 16;
  const nodes: RigidBody[] = [];
  const joints: ImpulseJoint[] = [];
  const d = { x: opts.to.x - opts.from.x, y: opts.to.y - opts.from.y, z: opts.to.z - opts.from.z };
  const seg = Math.hypot(d.x, d.y, d.z) / n;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const b = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(opts.from.x + d.x * t, opts.from.y + d.y * t, opts.from.z + d.z * t)
        .setLinearDamping(0.4)
        .setAngularDamping(1),
    );
    world.createCollider(R.ColliderDesc.ball(opts.radius ?? 0.03).setDensity(2), b);
    nodes.push(b);
    if (i > 0) joints.push(world.createImpulseJoint(R.JointData.rope(seg, ZERO, ZERO), nodes[i - 1]!, b, true));
  }
  if (opts.fromBody) joints.push(world.createImpulseJoint(R.JointData.spherical(ZERO, ZERO), opts.fromBody, nodes[0]!, true));
  if (opts.toBody) joints.push(world.createImpulseJoint(R.JointData.spherical(ZERO, ZERO), nodes[n]!, opts.toBody, true));
  return {
    nodes,
    dispose() {
      joints.forEach((j) => world.removeImpulseJoint(j, true));
      nodes.forEach((b) => physics.remove(b));
    },
  };
}

function worldPoint(body: RigidBody, local: Vec3): Vec3 {
  const t = body.translation();
  const r = body.rotation();
  // rotate local by quaternion r
  const { x, y, z } = local;
  const ix = r.w * x + r.y * z - r.z * y;
  const iy = r.w * y + r.z * x - r.x * z;
  const iz = r.w * z + r.x * y - r.y * x;
  const iw = -r.x * x - r.y * y - r.z * z;
  return {
    x: t.x + ix * r.w + iw * -r.x + iy * -r.z - iz * -r.y,
    y: t.y + iy * r.w + iw * -r.y + iz * -r.x - ix * -r.z,
    z: t.z + iz * r.w + iw * -r.z + ix * -r.y - iy * -r.x,
  };
}

/** Quaternion rotating +Y onto unit vector `d`. */
export function quatFromY(d: Vec3): { x: number; y: number; z: number; w: number } {
  const dot = d.y;
  if (dot < -0.9999) return { x: 1, y: 0, z: 0, w: 0 };
  // cross((0,1,0), d) = (d.z, 0, -d.x)
  const q = { x: d.z, y: 0, z: -d.x, w: 1 + dot };
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
