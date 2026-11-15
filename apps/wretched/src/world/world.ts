// The persistent world of WRETCHED: built once while the loader shows, staged by each chapter.
import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, PointLight, Vector3, type Mesh, type Object3D,
} from 'three';
import {
  Dust, FOG_PRESETS, HeightFog, Physics, Sky, clamp, corruptionFilter, damp, lerp, type CoreContext, type HeartbeatHandle,
  type ImpulseJoint, type InputFilter, type RigidBody, type SoundHandle, type DroneHandle, type WindHandle,
} from '@delivered/core';
import { Chain, LINKS } from './chain';
import { Double } from './double';
import { Figure } from './figure';
import { PATH } from './layout';
import { Attractors, Beacon, Monoliths, Sparks } from './props';
import { Trail, collisionMesh, createTerrain, heightAt, type TerrainUniforms } from './terrain';

export interface WretchedCtx extends CoreContext {
  world: World;
}

export interface StageOptions {
  /** Where the visitor stands. */
  z: number;
  x?: number;
  /** Chained to the double (the rope joint exists and the chain is drawn). */
  chained: boolean;
  /** Weight 0..1. */
  weight?: number;
  /** Double visibility (0 hidden in fog .. 1 fully exposed). */
  reveal?: number;
  posture?: number;
}

const GOLD = new Color('#F5C76B').multiplyScalar(1.8);
const ASH = new Color('#9A968F');

export class World {
  readonly terrain: Mesh;
  readonly terrainU: TerrainUniforms;
  readonly trail: Trail;
  readonly sky = new Sky();
  readonly fog: HeightFog;
  readonly dust: Dust;
  readonly beacon = new Beacon();
  readonly attractors = new Attractors();
  readonly monoliths: Monoliths;
  readonly figure = new Figure();
  readonly double: Double;
  readonly chain = new Chain();
  readonly sparks: Sparks;
  readonly key: DirectionalLight;
  readonly lawLight: PointLight;
  physics: Physics | null = null;
  private physicsPromise: Promise<Physics> | null = null;
  private anchor: RigidBody | null = null;
  private rope: ImpulseJoint | null = null;
  private ground: RigidBody | null = null;

  // ---- state every chapter drives ----
  /** The double's weight, 0..1: drag, corruption, desaturation, bass. */
  weight = 0;
  /** Self-effort attempts counted in CH4 (used by the postcard). */
  attempts = 0;
  /** "Gentle corruption" accessibility setting. */
  gentle = false;
  /** Visitor can move. */
  movable = true;
  /** Multiplies walking speed. */
  speedScale = 1;
  /** The chain is drawn and pinned to the double. */
  chained = false;
  /** Grace: gold trails, warm rim. */
  grace = false;
  /** Saturation is driven by weight unless a chapter takes over. */
  autoGrade = true;
  /** Clamp x to stay off the cliff edge. */
  maxX = 14;
  readonly velocity = new Vector3();
  /** Seconds the chain has been taut while walking away from the double. */
  tautTime = 0;
  /** Set by the corruption filter while an episode runs. */
  betrayal: string | null = null;
  private betrayalShow = 0;
  /** Law-light exposure at the visitor this frame. */
  exposure = 0;
  /** Distance to the nearest attractor. */
  nearAttractor = Infinity;

  // ---- audio bed (created once audio is unlocked) ----
  private bed: { drone: DroneHandle; wind: WindHandle; scrape: SoundHandle; hum: DroneHandle; law: DroneHandle } | null = null;
  heart: HeartbeatHandle | null = null;

  private readonly v = new Vector3();
  private readonly v2 = new Vector3();
  private readonly ankleV = new Vector3();
  private readonly wristV = new Vector3();
  private lastGroove = new Vector3();
  private time = 0;

  constructor(private readonly ctx: WretchedCtx) {
    const { engine, quality } = ctx;
    const b = quality.budget;
    const tier = quality.tier;
    const scene = engine.scene;
    scene.background = new Color('#0C0B0E');

    this.trail = new Trail(tier === 'low' ? 3 : 4);
    const seg = tier === 'high' ? [180, 480] : tier === 'medium' ? [130, 360] : [90, 240];
    const t = createTerrain(seg[0]!, seg[1]!, this.trail);
    this.terrain = t.mesh;
    this.terrainU = t.uniforms;

    this.sky.set({ zenith: '#0C0B0E', horizon: '#2B2A2E', ground: '#0C0B0E', stars: 0, sunIntensity: 0, sunGlow: 0, sunSize: 0.0001 });
    this.fog = new HeightFog(scene, { ...FOG_PRESETS.groundHaze, color: '#2B2A2E', density: 0.017, heightStrength: 0.75, falloff: 0.45 });
    this.dust = new Dust({ count: Math.min(1400, Math.floor(b.maxParticles / 8)), bounds: [16, 5, 16], color: '#b9b4ab', size: 2.6, opacity: 0.4, speed: 0.6 });

    const count = Math.min(tier === 'high' ? 30000 : tier === 'medium' ? 12000 : 5000, b.maxParticles);
    this.double = new Double(count);
    this.monoliths = new Monoliths(tier !== 'low');
    this.sparks = new Sparks(tier === 'low' ? 500 : 1200);

    // Light: the beacon is the key (warm, from ahead), a cool fill from the camera side, a low sky/ground bounce.
    this.key = new DirectionalLight('#FFD9A0', 2.4);
    engine.setupShadowLight(this.key, 9, 60);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.03;
    const fill = new DirectionalLight('#b8b0a4', 1.25);
    fill.position.set(5, 8, 12);
    this.lawLight = new PointLight('#E8F1FF', 0, 12, 1.6);
    scene.add(
      this.sky.mesh, this.terrain, this.beacon.group, this.attractors.group, this.monoliths.group, this.figure.group,
      this.double.points, this.double.eyes, this.chain.mesh, this.sparks.points, this.dust.points,
      this.key, this.key.target, fill, this.lawLight, new HemisphereLight('#3d3b44', '#16141a', 1.1), new AmbientLight('#2B2A2E', 0.4),
    );
    for (const o of [this.terrain, this.figure.group, this.attractors.group, this.monoliths.group, this.chain.mesh] as Object3D[]) this.fog.apply(o);

    this.figure.onStep = (p, heading, side) => {
      this.trail.stamp(p.x, p.z, 0.07, 0.13, heading, 0.85);
      if (this.grace) {
        this.trail.stamp(p.x, p.z, 0.1, 0.16, heading, 0.9, 1);
        this.sparks.emit(this.v.set(p.x, p.y + 0.05, p.z), 6, GOLD, { speed: 0.4, up: 0.5, life: 1.6 });
      } else if (this.figure.speed > 0.5) {
        this.sparks.emit(this.v.set(p.x, p.y + 0.03, p.z), 2, ASH.clone().multiplyScalar(0.25), { speed: 0.3, up: 0.2, life: 0.9 });
      }
      void side;
    };
    this.monoliths.rise = 0;
  }

  /** Load Rapier (code-split WASM) and build the ragdoll. Safe to call many times. */
  loadPhysics(): Promise<Physics> {
    this.physicsPromise ??= Physics.create().then((physics) => {
      this.physics = physics;
      const { R, world } = physics;
      const { vertices, indices } = collisionMesh();
      this.ground = world.createRigidBody(R.RigidBodyDesc.fixed());
      world.createCollider(R.ColliderDesc.trimesh(vertices, indices).setFriction(0.9), this.ground);
      this.anchor = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.1, 0));
      this.double.attachPhysics(physics);
      this.ctx.loop.onFixed((dt) => this.fixedUpdate(dt));
      return physics;
    });
    return this.physicsPromise;
  }

  /** Put the world into a chapter's starting state. */
  async stage(o: StageOptions): Promise<void> {
    const x = o.x ?? 0;
    this.figure.place(x, o.z);
    this.figure.target.kneel = this.figure.target.fall = this.figure.target.reach = this.figure.target.strain = 0;
    this.figure.target.head = this.figure.target.lean = this.figure.target.strike = 0;
    this.velocity.set(0, 0, 0);
    this.weight = o.weight ?? this.weight;
    this.double.reveal = o.reveal ?? 0.25;
    this.double.posture = o.posture ?? 0;
    this.double.pull = 0;
    this.double.dissolve = 0;
    this.double.eyeLevel = 1;
    this.double.visible = o.chained;
    this.chain.mesh.visible = o.chained;
    this.chain.reset();
    this.movable = true;
    this.grace = false;
    this.speedScale = 1;
    this.maxX = 14;
    if (o.chained) {
      await this.loadPhysics();
      this.attach(x, o.z);
    } else this.detach();
    this.figure.update(0.016, 0);
  }

  /** Lay the double behind the visitor and fasten the chain (ankle → wrist). */
  attach(x: number, z: number): void {
    this.chained = true;
    this.double.visible = true;
    this.chain.mesh.visible = true;
    this.double.lieAt(x + 0.4, z + PATH.chain - 0.2, -1);
    this.figure.group.updateMatrixWorld(true);
    this.figure.ankle(this.ankleV);
    this.double.wrist(this.wristV);
    this.chain.lay(this.ankleV, this.wristV);
    const physics = this.physics;
    const rd = this.double.ragdoll;
    if (!physics || !rd || !this.anchor) return;
    this.anchor.setTranslation(this.ankleV, true);
    if (!this.rope) {
      const data = physics.R.JointData.rope(PATH.chain - 0.1, { x: 0, y: 0, z: 0 }, { x: 0, y: -0.15, z: 0 });
      this.rope = physics.world.createImpulseJoint(data, this.anchor, rd.bodies.lowerArmR, true);
    }
  }

  /** Remove the physical joint (deliverance, or a chapter without the chain). */
  detach(): void {
    if (this.rope && this.physics) this.physics.world.removeImpulseJoint(this.rope, true);
    this.rope = null;
    this.chained = false;
  }

  /** The corrupting InputFilter: chance rises with weight and as the light gets closer. */
  corruption(extra: () => number = () => 0): InputFilter {
    const { ctx } = this;
    return corruptionFilter({
      seed: `wretched${Math.floor(performance.now())}`,
      intensity: () => {
        const progress = clamp(this.figure.position.z / PATH.law);
        const near = this.nearAttractor < 7 ? 1 - this.nearAttractor / 7 : 0;
        const base = Math.min(0.85, this.weight * (0.35 + 0.65 * progress) + near * 0.25 + extra());
        return base * (this.gentle ? 0.45 : 1);
      },
      duration: this.gentle ? [0.4, 1] : [0.6, 1.8],
      redirectTo: () => {
        const n = this.attractors.nearest(this.figure.position);
        if (!n) return null;
        return { x: n.pos.x - this.figure.position.x, y: -(n.pos.z - this.figure.position.z) };
      },
      onBetray: (kind) => {
        this.betrayal = kind;
        if (!kind) return;
        this.betrayalShow = 2.2;
        ctx.postfx.glitchBurst(this.gentle ? 0.35 : 0.7, 0.3);
        ctx.audio.stutter({ level: 0.5 });
        this.heart?.skip();
        this.double.flare(1);
      },
    });
  }

  fixedUpdate(dt: number): void {
    if (!this.physics) return;
    this.figure.ankle(this.ankleV);
    this.anchor?.setNextKinematicTranslation(this.ankleV);
    this.double.fixedUpdate(dt);
    const g = heightAt(this.ankleV.x, this.ankleV.z);
    this.chain.fixedUpdate(dt, this.ankleV, this.chained ? this.double.wrist(this.wristV) : null, g + 0.03);
  }

  update(dt: number): void {
    const { ctx } = this;
    this.time += dt;
    const time = this.time;
    const input = ctx.input.filtered;
    const fig = this.figure;
    this.ensureBed();

    // ---- movement ----
    let mx = this.movable ? input.moveX : 0;
    let my = this.movable ? input.moveY : 0;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const base = 2.5 * this.speedScale;
    // Weight slows; a taut chain, walking away from the double, slows more. Never below 35 %.
    let factor = 1 - this.weight * 0.4;
    const pel = this.double.pelvis(this.v2);
    let taut = 0;
    if (this.chained) {
      const away = this.v.set(fig.position.x - pel.x, 0, fig.position.z - pel.z);
      const dist = away.length();
      away.divideScalar(dist || 1);
      const dot = (mx * away.x + -my * away.z) / Math.max(0.001, Math.hypot(mx, my));
      taut = clamp((dist - (PATH.chain - 0.6)) / 0.6) * Math.max(0, dot);
      factor *= 1 - taut * (0.2 + this.weight * 0.35);
      this.tautTime = taut > 0.5 && mag > 0.6 ? this.tautTime + dt : Math.max(0, this.tautTime - dt * 2);
      this.double.pull = this.weight * 0.6 * (this.double.posture > 0.5 ? 1 : 0.4);
    }
    factor = Math.max(this.movable ? 0.35 : 0, factor);
    this.velocity.x = damp(this.velocity.x, mx * base * factor, 6, dt);
    this.velocity.z = damp(this.velocity.z, -my * base * factor, 6, dt);
    if (fig.target.fall > 0.5 || fig.target.kneel > 0.5) this.velocity.multiplyScalar(Math.max(0, 1 - dt * 8));
    fig.position.x = clamp(fig.position.x + this.velocity.x * dt, -14, this.maxX);
    fig.position.z = clamp(fig.position.z + this.velocity.z * dt, PATH.summit, 14);
    const sp = Math.hypot(this.velocity.x, this.velocity.z);
    fig.speed = sp;
    if (sp > 0.15) {
      const want = Math.atan2(this.velocity.x, this.velocity.z);
      let d = want - fig.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      fig.heading += d * Math.min(1, dt * 7);
    }
    fig.target.lean = taut * 0.25 + this.weight * 0.12;
    fig.material.userData.rim.value.lerp(this.grace ? GOLD_RIM : this.exposure > 0.2 ? COLD_RIM : WARM_RIM, Math.min(1, dt * 2));
    fig.update(dt, time);

    // ---- the double, the chain, grooves ----
    this.double.update(dt, time, ctx.engine.renderer.getPixelRatio());
    if (this.chain.mesh.visible) this.chain.update(dt);
    if (this.chained && this.chain.speed > 0.25) {
      const mid = this.chain.linkPosition(LINKS >> 1, this.v);
      if (mid.distanceTo(this.lastGroove) > 0.18) {
        this.trail.stamp(mid.x, mid.z, 0.05, 0.12, fig.heading, 0.6);
        this.trail.stamp(pel.x, pel.z, 0.22, 0.32, fig.heading, 0.55);
        this.lastGroove.copy(mid);
      }
    }
    this.trail.update(time);

    // ---- law light, attractors ----
    this.exposure = this.monoliths.exposureAt(fig.position);
    const pools = this.terrainU.uPools.value;
    this.monoliths.items.forEach((it, i) => pools[i]?.set(it.pool.x, it.pool.z, 4.6, this.monoliths.rise));
    const nearestPool = this.monoliths.items.reduce((a, b) => (b.pool.distanceTo(fig.position) < a.pool.distanceTo(fig.position) ? b : a));
    this.lawLight.position.set(nearestPool.pool.x, heightAt(nearestPool.pool.x, nearestPool.pool.z) + 3.4, nearestPool.pool.z);
    this.lawLight.color.set('#E8F1FF').lerp(LAW_GOLD, this.monoliths.warmth);
    this.lawLight.intensity = 9 * this.monoliths.rise;
    const near = this.attractors.nearest(fig.position);
    this.nearAttractor = near?.dist ?? Infinity;
    this.attractors.update(time);
    this.monoliths.update(dt);
    this.beacon.update(dt, time, ctx.engine.camera);
    this.terrainU.uTime.value = time;

    // ---- light follows the visitor so the shadow map stays sharp ----
    this.key.position.set(fig.position.x - 4, fig.position.y + 14, fig.position.z - 18);
    this.key.target.position.copy(fig.position);
    this.key.intensity = 2.2 * (0.55 + 0.45 * (1 - this.weight)) * (this.beacon.level > 1 ? 1.3 : 1);
    this.dust.points.position.copy(fig.position).setY(fig.position.y + 2);
    this.dust.update(dt);
    this.sky.update(dt);
    this.sparks.update(dt, ctx.engine.renderer.getPixelRatio());
    this.fog.update();

    // ---- grade and sound follow the weight ----
    if (this.autoGrade) {
      ctx.postfx.params.saturation = lerp(0.95, 0.22, this.weight);
    }
    if (this.bed) {
      this.bed.drone.setFreq(55 - this.weight * 14, 0.5);
      this.bed.drone.setBrightness(0.5 - this.weight * 0.4, 0.5);
      this.bed.drone.setLevel(this.grace ? 0 : 0.18 + this.weight * 0.3, 0.6);
      this.bed.scrape.setLevel(this.chained ? clamp(this.chain.speed / 2.5) * 0.5 : 0, 0.15);
      this.bed.hum.setLevel(this.nearAttractor < 12 && !this.grace ? (1 - this.nearAttractor / 12) * 0.22 : 0, 0.4);
      this.bed.law.setLevel(this.exposure * 0.16 * this.monoliths.rise, 0.5);
    }

    // ---- HUD: what you pressed, where you went ----
    this.betrayalShow -= dt;
    if (this.betrayalShow > 0 || this.betrayal) {
      const { pressed, went } = ctx.input.arrows();
      if (pressed !== '·') ctx.ui.hud.set('bottom-center', ctx.t('wretched.hud.betray', { pressed, went }));
    } else if (this.betrayalShow > -0.2) ctx.ui.hud.set('bottom-center', '');
  }

  private ensureBed(): void {
    const a = this.ctx.audio;
    if (this.bed || !a.unlocked) return;
    this.bed = {
      drone: a.drone(55, 'dark', { level: 0 }),
      wind: a.wind(0.18, { level: 0.25 }),
      scrape: a.stoneScrape({ level: 0 }),
      hum: a.drone(207.6, 'glass', { level: 0 }),
      law: a.drone(1046.5, 'glass', { level: 0 }),
    };
  }

  /** Fade the base bed in or out (CH5 silence, CH6 swell). */
  setBedLevel(level: number, seconds = 2): void {
    if (!this.bed) return;
    this.bed.wind.setLevel(0.25 * level, seconds);
    if (level === 0) this.bed.drone.setLevel(0, seconds);
  }

  dispose(): void {
    this.detach();
    this.double.dispose();
    this.chain.dispose();
    this.figure.dispose();
  }
}

const LAW_GOLD = new Color('#F5C76B');
const WARM_RIM = new Color('#ffd9a0').multiplyScalar(0.85);
const COLD_RIM = new Color('#E8F1FF').multiplyScalar(0.9);
const GOLD_RIM = new Color('#F5C76B').multiplyScalar(1.1);
