import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, type Object3D } from 'three';

export type Rapier = typeof RAPIER_NS;
export type RigidBody = RAPIER_NS.RigidBody;
export type World = RAPIER_NS.World;
export type ImpulseJoint = RAPIER_NS.ImpulseJoint;
export type Vec3 = { x: number; y: number; z: number };

let rapierPromise: Promise<Rapier> | null = null;

/** Load and initialize Rapier once (the WASM is fetched lazily, off the critical path). */
export function loadRapier(): Promise<Rapier> {
  rapierPromise ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = (m.default ?? m) as Rapier;
    await R.init();
    return R;
  });
  return rapierPromise;
}

export interface PhysicsOptions {
  gravity?: Vec3;
}

/**
 * Async Rapier wrapper. Owns the world, steps it at the fixed rate, and keeps meshes in sync.
 *
 * ```ts
 * const physics = await Physics.create();
 * physics.addGround(0);
 * const body = physics.addBox({ x: 0, y: 4, z: 0 }, { x: 0.5, y: 0.5, z: 0.5 });
 * physics.bind(mesh, body);
 * loop.onFixed((dt) => physics.step(dt));
 * loop.onFrame(() => physics.sync());
 * ```
 */
export class Physics {
  readonly world: World;
  private bindings = new Map<number, { object: Object3D; body: RigidBody }>();
  private stepListeners = new Set<(dt: number) => void>();
  private debugLines: LineSegments | null = null;
  /** Bodies already removed. Rapier recycles handles, so a stale body must never be removed twice. */
  private removed = new WeakSet<RigidBody>();

  private constructor(
    /** The Rapier namespace, for anything the helpers do not cover. */
    readonly R: Rapier,
    opts: PhysicsOptions,
  ) {
    this.world = new R.World(opts.gravity ?? { x: 0, y: -9.81, z: 0 });
  }

  static async create(opts: PhysicsOptions = {}): Promise<Physics> {
    return new Physics(await loadRapier(), opts);
  }

  /** Advance the simulation. Call from `loop.onFixed`. */
  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    for (const fn of this.stepListeners) fn(dt);
  }

  /** Run a callback after every physics step (chains use this to check for breaks). */
  onStep(fn: (dt: number) => void): () => void {
    this.stepListeners.add(fn);
    return () => this.stepListeners.delete(fn);
  }

  /** Keep `object` at `body`'s transform. The object must be in world space (parented to the scene). */
  bind(object: Object3D, body: RigidBody): void {
    this.bindings.set(body.handle, { object, body });
  }
  unbind(body: RigidBody): void {
    this.bindings.delete(body.handle);
  }

  /** Copy body transforms to bound objects. Call from `loop.onFrame`. */
  sync(): void {
    for (const { object, body } of this.bindings.values()) {
      const t = body.translation();
      const r = body.rotation();
      object.position.set(t.x, t.y, t.z);
      object.quaternion.set(r.x, r.y, r.z, r.w);
    }
    if (this.debugLines?.visible) this.updateDebug();
  }

  /** A fixed infinite-ish ground slab with its top at `y`. */
  addGround(y = 0, size = 200, friction = 0.9): RigidBody {
    const body = this.world.createRigidBody(this.R.RigidBodyDesc.fixed().setTranslation(0, y - 0.5, 0));
    this.world.createCollider(this.R.ColliderDesc.cuboid(size, 0.5, size).setFriction(friction), body);
    return body;
  }

  /** A dynamic (or fixed/kinematic) box. `half` are half extents. */
  addBox(position: Vec3, half: Vec3, opts: BodyOptions = {}): RigidBody {
    const body = this.world.createRigidBody(this.bodyDesc(opts).setTranslation(position.x, position.y, position.z));
    this.world.createCollider(this.tune(this.R.ColliderDesc.cuboid(half.x, half.y, half.z), opts), body);
    return body;
  }
  addBall(position: Vec3, radius: number, opts: BodyOptions = {}): RigidBody {
    const body = this.world.createRigidBody(this.bodyDesc(opts).setTranslation(position.x, position.y, position.z));
    this.world.createCollider(this.tune(this.R.ColliderDesc.ball(radius), opts), body);
    return body;
  }
  /** A capsule along the body's local Y axis. */
  addCapsule(position: Vec3, halfHeight: number, radius: number, opts: BodyOptions = {}): RigidBody {
    const body = this.world.createRigidBody(this.bodyDesc(opts).setTranslation(position.x, position.y, position.z));
    this.world.createCollider(this.tune(this.R.ColliderDesc.capsule(halfHeight, radius), opts), body);
    return body;
  }

  bodyDesc(opts: BodyOptions): RAPIER_NS.RigidBodyDesc {
    const R = this.R;
    const d =
      opts.type === 'fixed' ? R.RigidBodyDesc.fixed()
      : opts.type === 'kinematic' ? R.RigidBodyDesc.kinematicPositionBased()
      : R.RigidBodyDesc.dynamic();
    d.setLinearDamping(opts.linearDamping ?? 0.05).setAngularDamping(opts.angularDamping ?? 0.3);
    if (opts.ccd) d.setCcdEnabled(true);
    return d;
  }
  tune(c: RAPIER_NS.ColliderDesc, opts: BodyOptions): RAPIER_NS.ColliderDesc {
    c.setFriction(opts.friction ?? 0.7).setRestitution(opts.restitution ?? 0.1).setDensity(opts.density ?? 1);
    if (opts.group !== undefined) c.setCollisionGroups(opts.group);
    return c;
  }

  /** Remove a body, its colliders and joints, and its mesh binding. Safe to call twice. */
  remove(body: RigidBody): void {
    if (this.removed.has(body)) return;
    this.removed.add(body);
    this.bindings.delete(body.handle);
    if (this.world.bodies.contains(body.handle)) this.world.removeRigidBody(body);
  }

  /**
   * Wireframe view of every collider. The debug tools show it when the URL has `?debug`.
   * Add the returned object to your scene.
   */
  debugObject(): LineSegments {
    if (!this.debugLines) {
      this.debugLines = new LineSegments(
        new BufferGeometry(),
        new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 }),
      );
      this.debugLines.frustumCulled = false;
      this.debugLines.renderOrder = 999;
    }
    return this.debugLines;
  }
  private updateDebug(): void {
    const { vertices, colors } = this.world.debugRender();
    const g = this.debugLines!.geometry;
    g.setAttribute('position', new BufferAttribute(vertices, 3));
    g.setAttribute('color', new BufferAttribute(colors, 4));
  }

  dispose(): void {
    this.bindings.clear();
    this.stepListeners.clear();
    if (this.debugLines) {
      this.debugLines.geometry.dispose();
      (this.debugLines.material as LineBasicMaterial).dispose();
      this.debugLines.removeFromParent();
    }
    this.world.free();
  }
}

export interface BodyOptions {
  type?: 'dynamic' | 'fixed' | 'kinematic';
  density?: number;
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
  ccd?: boolean;
  /** Rapier collision groups bitmask (membership << 16 | filter). */
  group?: number;
}

/** Build a collision group mask: bodies in `member` collide only with groups in `filter`. */
export const collisionGroup = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);
