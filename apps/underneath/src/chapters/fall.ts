// CH3 the fall · CH4 רֹכֵב שָׁמַיִם, the rider of the heavens (continues the same fall)
import { AdditiveBlending, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { RopeMesh, createRope, h, type DroneHandle, type HeartbeatHandle, type SoundHandle, type Verlet, type WindHandle } from '@delivered/core';
import { UChapter } from './base';
import { FallModel } from '../world/fall';
import { COLUMN, altitudeMetres } from '../world/layers';
import { islandUnderside } from '../world/islands';
import type { UnderCtx } from '../world/world';

type GrabKind = 'rock' | 'branch' | 'island' | 'kite';

/** Something falling more slowly than the visitor, trailing a rope or string they can grab. */
class Grabbable {
  readonly group = new Group();
  readonly rope: Verlet;
  readonly tube: RopeMesh;
  readonly glint: Mesh;
  state: 'free' | 'held' | 'gone' = 'free';
  held = 0;
  holdFor: number;
  vy: number;
  private spin = new Vector3();
  private readonly segs = 16;

  constructor(
    readonly kind: GrabKind,
    ctx: UnderCtx,
    pos: Vector3,
  ) {
    const m = ctx.world.mats;
    this.group.position.copy(pos);
    this.vy = kind === 'kite' ? 6 : 10;
    this.holdFor = { rock: 0.9, branch: 0.7, island: 1.3, kite: 1.1 }[kind];
    const len = kind === 'island' ? 14 : kind === 'kite' ? 16 : 10;
    if (kind === 'rock') {
      const r = new Mesh(new IcosahedronGeometry(1.3, 1), m.stone);
      this.group.add(r);
    } else if (kind === 'branch') {
      const b = new Mesh(new CylinderGeometry(0.12, 0.22, 5, 7), new MeshStandardMaterial({ color: '#6b5444', roughness: 0.9 }));
      b.rotation.z = Math.PI / 2.4;
      this.group.add(b);
      for (let i = 0; i < 9; i++) {
        const leaf = new Mesh(new ConeGeometry(0.35, 0.8, 5), new MeshStandardMaterial({ color: '#9aa860', roughness: 0.9 }));
        leaf.position.set((Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1);
        leaf.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        this.group.add(leaf);
      }
    } else if (kind === 'island') {
      this.group.add(islandUnderside(2, 7, m.rock));
    } else {
      const kite = new Mesh(new PlaneGeometry(1.8, 2.6), new MeshStandardMaterial({ color: '#d9a441', roughness: 0.6, side: DoubleSide, emissive: new Color('#5a2a10'), emissiveIntensity: 0.3 }));
      kite.rotation.z = Math.PI / 4;
      this.group.add(kite);
    }
    // The rope streams upward from the object in the airflow (simulated in the object's frame).
    this.rope = createRope([0, 0, 0], [0, len, 0], this.segs, { iterations: 8, damping: 0.94, gravity: [0, 0, 0] });
    this.rope.pin(0);
    const t0 = Math.random() * 10;
    this.rope.wind = (_x, y, _z, t) => [Math.sin(t * 3 + y + t0) * 3, 14, Math.cos(t * 2.3 + y * 0.7 + t0) * 3];
    this.tube = new RopeMesh(this.rope, { radius: kind === 'kite' ? 0.025 : 0.07, color: kind === 'branch' ? '#6f7a48' : '#b9a27e' });
    this.group.add(this.tube.mesh);
    this.glint = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy * 1.6; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 3.0); gl_FragColor = vec4(vec3(1.0, 0.86, 0.55) * a * 2.0, a); }`,
      }),
    );
    this.group.add(this.glint);
    this.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6);
  }

  get top(): Vector3 {
    const p = this.rope.getPoint(this.segs);
    return new Vector3(p[0], p[1], p[2]).add(this.group.position);
  }

  update(dt: number, hand: Vector3 | null): void {
    this.group.position.y -= this.vy * dt;
    if (this.state !== 'held') {
      this.group.children[0]!.rotation.x += this.spin.x * dt;
      this.group.children[0]!.rotation.y += this.spin.y * dt;
    }
    if (this.state === 'held' && hand) this.rope.movePin(this.segs, hand.x - this.group.position.x, hand.y - this.group.position.y, hand.z - this.group.position.z);
    this.rope.step(Math.min(dt, 1 / 30));
    this.tube.update();
    const t = this.rope.getPoint(this.segs);
    this.glint.position.set(t[0], t[1], t[2]);
    (this.glint.material as ShaderMaterial).visible = this.state === 'free';
  }

  /** It never holds: the rope snaps, the branch tears, the string slips. */
  release(): void {
    this.state = 'gone';
    this.rope.unpin(this.segs);
    if (this.kind !== 'kite') {
      const c = this.rope.constraints[Math.floor(this.segs * 0.6)];
      if (c) this.rope.release(c);
    }
    this.vy = 16;
  }

  dispose(): void {
    this.tube.dispose();
    this.rope.dispose();
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh !== this.tube.mesh) mesh.geometry.dispose();
    });
    (this.glint.material as ShaderMaterial).dispose();
  }
}

/** The shared fall: model, sounds, HUD, grabs. CH3 and CH4 each own one runner over the same model. */
class FallRunner {
  readonly grabs: Grabbable[] = [];
  holding: Grabbable | null = null;
  private wind: WindHandle;
  private rain: SoundHandle;
  private heart: HeartbeatHandle;
  private alt: HTMLElement;
  private hudT = 0;
  private pathT = 0;
  private hinted = false;

  constructor(
    private readonly ch: UChapter & { ownIt<T extends { stop(): void } | { dispose(): void } | (() => void)>(t: T): T },
    private readonly ctx: UnderCtx,
    readonly fall: FallModel,
  ) {
    const a = ctx.audio;
    this.wind = ch.ownIt(a.wind(0.6, { level: 0.7 }));
    this.rain = ch.ownIt(a.rain(0.6, { level: 0 }));
    this.heart = ch.ownIt(a.heartbeat(112, { level: 0 }));
    this.alt = h('div', { class: 'un-alt', 'aria-hidden': 'true' });
    ctx.ui.hud.set('top-right', this.alt);
  }

  spawn(kind: GrabKind, root: Group): void {
    const f = this.fall;
    const ang = Math.random() * Math.PI * 2;
    const g = new Grabbable(kind, this.ctx, new Vector3(f.x + Math.cos(ang) * 6, f.y - 95, f.z + Math.sin(ang) * 6));
    root.add(g.group);
    this.grabs.push(g);
  }

  step(dt: number, tumble: number): void {
    const { ctx, fall } = this;
    const w = ctx.world;
    const f = ctx.input.filtered;
    const v = w.visitor;
    const lookUp = w.lookUp;
    fall.step(dt, { x: f.moveX, y: f.moveY, posture: f.primary || f.hold ? 1 : -0.3, lookUp, holding: !!this.holding });
    v.group.position.set(fall.x, fall.y, fall.z);
    v.motion.teleport(fall.x, fall.y, fall.z);
    v.fallPose = Math.min(1, 1 - tumble);
    v.posture = f.primary ? 1 : -0.3;
    v.heading = Math.PI;
    v.body.rotation.z = Math.sin(this.ch.time * 3.1) * 0.5 * tumble + f.moveX * -0.3;
    v.air.set(0, 0, 0);

    // Hand position (the leading arm) for grabs.
    const hand = new Vector3(fall.x, fall.y + 0.9, fall.z - 0.9);
    for (const g of this.grabs) {
      g.update(dt, g === this.holding ? hand : null);
      if (g.state === 'free' && !this.hinted && g.group.position.y > fall.y - 45) {
        this.hinted = true;
        ctx.ui.whisper.show(ctx.t('underneath.grabHint'), { duration: 3.5 });
      }
      if (g.state === 'free' && !this.holding && ctx.input.pressed('secondary')) {
        const top = g.top;
        if (Math.hypot(top.x - hand.x, top.z - hand.z) < 4.5 && Math.abs(top.y - hand.y) < 6) {
          g.state = 'held';
          this.holding = g;
          ctx.audio.chainRattle(0.25);
          ctx.rig.addTrauma(0.2);
        }
      }
      if (g === this.holding) {
        g.held += dt;
        g.vy = fall.speed;
        if (g.held > g.holdFor) {
          g.release();
          this.holding = null;
          if (g.kind === 'kite') ctx.audio.pluck(330, { level: 0.2 });
          else ctx.audio.chainSnap({ level: 0.5 });
          ctx.rig.addTrauma(0.35);
        }
      }
    }
    for (let i = this.grabs.length - 1; i >= 0; i--) {
      const g = this.grabs[i]!;
      if (g.group.position.y > fall.y + 160 || g.group.position.y < fall.y - 400) {
        g.group.removeFromParent();
        g.dispose();
        this.grabs.splice(i, 1);
      }
    }

    // Sound and shake by layer; looking up calms both.
    const lw = w.sky.weights;
    const calm = 1 - lookUp * 0.45;
    const speedN = Math.min(1, fall.speed / 36);
    this.wind.setSpeed((0.35 + speedN * 0.6) * (lw.heights + lw.storm * 1.1 + lw.night * 0.25 + lw.fog * 0.5) * calm, 0.4);
    this.wind.setLevel((0.25 + 0.55 * (lw.heights + lw.storm)) * calm + 0.15, 0.4);
    this.rain.setLevel(lw.storm * 0.8, 0.5);
    this.heart.setLevel(Math.min(0.9, lw.fog * 0.9 + lw.night * 0.2), 0.5);
    this.heart.setBpm(Math.round(118 - lookUp * 40));
    if (lw.storm > 0.3) ctx.rig.addTrauma(dt * 0.6 * lw.storm * (1 - lookUp * 0.8));
    v.glowLevel = 1 + lw.night * 1.6 + lw.fog * 0.4;
    // The arms are only seen at the bottom of the world.
    w.arms.uniforms.uLevel.value = 1 - Math.min(1, Math.max(0, (fall.y - 150) / 180));

    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      this.alt.textContent = ctx.t('underneath.altimeter', { m: altitudeMetres(fall.y).toLocaleString('en-US') });
    }
    this.pathT -= dt;
    if (this.pathT <= 0) {
      this.pathT = 0.25;
      w.path.push(v.group.position.clone());
    }
  }

  dispose(): void {
    for (const g of this.grabs) g.dispose();
    this.grabs.length = 0;
  }
}

abstract class FallChapter extends UChapter {
  protected runner!: FallRunner;
  ownIt<T extends { stop(): void } | { dispose(): void } | (() => void)>(t: T): T {
    return this.own(t as never) as T;
  }
  protected startFall(ctx: UnderCtx): FallModel {
    this.begin(ctx, [
      { id: 'secondary', label: ctx.t('underneath.grab'), size: 'large', icon: 'hand' },
      { id: 'lookUp', label: ctx.t('core.whisper.lookUp'), size: 'small', icon: 'up' },
      { id: 'primary', label: ctx.t('underneath.tuck'), size: 'small', icon: 'dot' },
    ]);
    const w = ctx.world;
    w.camMode = 'fall';
    ctx.rig.setFov(62, 2);
    this.own(() => ctx.rig.setFov(45, 1.5));
    w.platforms = [];
    w.arms.group.visible = true;
    w.sky.fogScale = 1;
    w.sky.wispScale = 1;
    const fall = (w as unknown as { fall?: FallModel }).fall ?? new FallModel({ startY: w.visitor.group.position.y });
    (w as unknown as { fall?: FallModel }).fall = fall;
    this.runner = new FallRunner(this, ctx, fall);
    this.own(() => this.runner.dispose());
    return fall;
  }
}

export function resetFall(ctx: UnderCtx): void {
  (ctx.world as unknown as { fall?: FallModel }).fall = undefined;
  ctx.world.path.length = 0;
}

export function getFall(ctx: UnderCtx): FallModel | undefined {
  return (ctx.world as unknown as { fall?: FallModel }).fall;
}

export class Fall extends FallChapter {
  readonly id = 'fall';
  override keyMomentAt = 26;
  override transitionIn = 'cut' as const;
  private lookHeld = 0;
  private whispered = 0;
  private spawns: [number, GrabKind][] = [];

  enter(ctx: UnderCtx): void {
    resetFall(ctx);
    const fall = this.startFall(ctx);
    fall.x = ctx.world.visitor.group.position.x;
    fall.z = ctx.world.visitor.group.position.z;
    this.spawns = [
      [2330, 'rock'],
      [2160, 'island'],
      [1980, 'branch'],
      [1700, 'rock'],
    ];
    this.card({ word: 'בְעֶזְרֶךָ', lang: 'he', translit: "be'ezrekha", english: 'for your help', ref: 'Deuteronomy 33:26', number: 3 });
    ctx.audio.crumble(0.6);
  }

  update(rawDt: number): void {
    const dt = Math.max(0, rawDt);
    const { ctx } = this;
    const fall = this.runner.fall;
    this.runEvents();
    const tumble = Math.max(0, 1 - this.time / 2.2);
    this.runner.step(dt, tumble);
    while (this.spawns.length && fall.y < this.spawns[0]![0]) this.runner.spawn(this.spawns.shift()![1], this.root);

    if (fall.y < 1840 && this.whispered <= 0 && this.lookHeld === 0) {
      this.whispered = 9;
      ctx.ui.whisper.show(ctx.t('core.whisper.lookUp'), { duration: 4.5 });
    }
    this.whispered -= dt;
    if (this.w.lookingUp && fall.y < 1880) this.lookHeld += dt;
    if (this.lookHeld > 0.5 || fall.y < 1420) this.complete();
  }
}

export class Rider extends FallChapter {
  readonly id = 'rider';
  override keyMomentAt = 7;
  override transitionIn = 'cut' as const;
  private close = 0;
  private wasUp = false;
  private choir!: DroneHandle;
  private shown = false;
  private pass = -1;
  private passFrom = new Vector3();

  enter(ctx: UnderCtx): void {
    const fall = this.startFall(ctx);
    if (fall.y > 1500) fall.y = Math.min(fall.y, 1880);
    this.runner.spawn('kite', this.root);
    this.choir = this.own(ctx.audio.drone(220, 'choir', { level: 0 }));
    this.card({ word: 'רֹכֵב שָׁמַיִם', lang: 'he', translit: 'rokhev shamayim', english: 'rider of the heavens', ref: 'Deuteronomy 33:26', number: 4 });
    this.w.rider.level = 1;
    this.own(() => (this.w.rider.level = 0));
    // Screenshot hook: look up for the key moment.
    if (new URLSearchParams(location.search).has('shot')) {
      ctx.input.setCustom('lookUp', true);
      this.own(() => ctx.input.setCustom('lookUp', false));
    }
  }

  update(rawDt: number): void {
    const dt = Math.max(0, rawDt);
    const { ctx } = this;
    const w = this.w;
    const fall = this.runner.fall;
    this.runEvents();
    this.runner.step(dt, 0);
    if (fall.y < 1560 && this.runner.grabs.length === 0 && !this.shown && Math.random() < 0.002) this.runner.spawn('kite', this.root);

    // Each look up brings the rider closer.
    const up = w.lookUp > 0.5;
    if (up && !this.wasUp) {
      this.close = Math.min(1, this.close + 0.17);
      this.own(ctx.audio.gallop(96 + this.close * 40, 4, { level: 0.25 + this.close * 0.5, distance: 1 - this.close }));
    }
    this.wasUp = up;
    this.close = Math.min(1, this.close + dt * (0.004 + (up ? 0.02 : 0)));
    this.choir.setLevel(this.close * 0.22 * (0.4 + 0.6 * w.lookUp), 0.5);

    const r = w.rider.group;
    const d = 900 * Math.pow(1 - this.close, 1.3) + 40;
    if (this.pass < 0) {
      r.position.set(fall.x + Math.sin(this.time * 0.3) * 18 * (1 - this.close) + 10, fall.y + d, fall.z - 12);
      if (fall.y < 640) {
        this.pass = 0;
        this.passFrom.copy(r.position);
        ctx.audio.wind(0.9, { level: 0.6 }).stop(3);
        this.choir.setLevel(0.35, 1);
      }
    } else {
      // It passes the visitor in the fog and dives below, into the white.
      this.pass += dt;
      const k = Math.min(1, this.pass / 3.2);
      const e = k * k;
      r.position.set(fall.x + 12 - k * 8, this.passFrom.y + (fall.y - 260 - this.passFrom.y) * e - this.pass * 30, fall.z - 10);
      if (this.pass > 1.2 && this.pass < 1.3) ctx.postfx.flash(0.35);
      w.rider.level = Math.max(0, 1 - Math.max(0, this.pass - 4) / 3);
    }
    if (!this.shown && this.close > 0.7) {
      this.shown = true;
      void ctx.ui.scripture.show({ ref: 'Deuteronomy 33:26', partial: 1, position: 'upper', duration: 6.5 });
      ctx.audio.duck(0.35, 6);
    }
    if (fall.done) this.complete();
  }
}

export { COLUMN };
