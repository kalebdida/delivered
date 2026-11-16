// CH4 ταλαίπωρος (self-effort, every attempt fails) · CH5 ῥύσεται (cry out)
import { Color, DodecahedronGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { partial, HoldMeter, RopeMesh, clamp, createRope, damp, formatRef, haptic, type RigidBody, type SoundHandle, type Verlet } from '@delivered/core';
import { LINKS } from '../world/chain';
import { PATH } from '../world/layout';
import { heightAt } from '../world/terrain';
import type { WretchedCtx } from '../world/world';
import { VIEWS, WChapter, WordLine, follow } from './base';

const SPARK = new Color('#ff8a3d').multiplyScalar(2.2);
const STONE_DUST = new Color('#9A968F').multiplyScalar(0.4);
type Attempt = 'strain' | 'stone' | 'run' | 'cliff' | 'outrun';

/** Kneel, silence, the double heavy on the visitor: shared by CH4's end and CH5/CH6 starts. */
export function collapsedPose(ctx: WretchedCtx): void {
  const f = ctx.world.figure;
  f.target.kneel = f.pose.kneel = 1;
  f.target.head = f.pose.head = 0.35;
  ctx.world.movable = false;
}

// -------------------------------------------------------------------------------------------------
// CH4 · ταλαίπωρος · WRETCHED
// -------------------------------------------------------------------------------------------------
export class Wretched extends WChapter {
  readonly id = 'wretched';
  override keyMomentAt = 9;
  private meter = 0;
  private stones: { mesh: Mesh; home: Vector3; held: boolean; used: boolean }[] = [];
  private holding: (typeof this.stones)[number] | null = null;
  private cooldown: Record<Attempt, number> = { strain: 0, stone: 0, run: 0, cliff: 0, outrun: 0 };
  private outrunTime = 0;
  private collapsed = -1;
  private tendril: { rope: Verlet; mesh: RopeMesh } | null = null;
  private debris: { body: RigidBody; mesh: Mesh; until: number }[] = [];
  private breath: (SoundHandle & { setRate(bpm: number): void }) | null = null;
  private failText = 0;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.meter = 0;
    this.collapsed = -1;
    this.holding = null;
    this.stones = [];
    this.debris = [];
    this.tendril = null;
    this.cooldown = { strain: 0, stone: 0, run: 0, cliff: 0, outrun: 0 };
    await this.begin(ctx, { z: PATH.arena, chained: true, weight: 0.6, reveal: 0.6, posture: 1 });
    const w = this.w;
    // Tilt down a little: the figure sits higher, clear of the whisper, with the chain below it.
    if (innerWidth > innerHeight) ctx.rig.follow(w.figure.group, { offset: new Vector3(1.8, 3.8, 7.8), lookOffset: new Vector3(0, 0.1, -3.2), spring: 'smooth' }, true);
    w.attempts = 0;
    w.maxX = PATH.cliffX - 0.5;
    this.card({ word: 'ταλαίπωρος', lang: 'grc', translit: 'talaipōros', english: 'wretched', ref: 'Romans 7:24', number: 4 });
    ctx.input.addFilter(w.corruption(() => this.outrunTime * 0.3));
    this.at(4.6, () => ctx.ui.whisper.show(ctx.t('wretched.whisper.break')));
    this.at(5, () => ctx.ui.hud.set('top-left', ctx.t('wretched.whisper.tools')));
    this.updateCounter();
    this.breath = this.own(ctx.audio.breathing(16, { level: 0.12 }));

    // Stones to pick up, scattered around the arena.
    const mat = new MeshStandardMaterial({ color: '#cfc8bb', roughness: 0.85, emissive: new Color('#3a3027'), emissiveIntensity: 1 });
    const geo = new DodecahedronGeometry(0.16, 0);
    for (const [x, dz] of [[-2.2, -1.5], [1.8, -2.6], [-1.2, 2.2], [3.5, 0.8], [-3.6, -3.8], [2.4, -5.2]] as const) {
      const mesh = new Mesh(geo, mat);
      const home = new Vector3(x, heightAt(x, PATH.arena + dz) + 0.12, PATH.arena + dz);
      mesh.position.copy(home);
      mesh.rotation.set(x, dz, x * dz);
      mesh.castShadow = true;
      this.root.add(mesh);
      this.stones.push({ mesh, home, held: false, used: false });
    }
    ctx.world.fog.apply(this.root);
    this.own(() => {
      for (const d of this.debris) ctx.world.physics?.remove(d.body);
      this.debris = [];
      this.tendril?.mesh.dispose();
      this.tendril?.rope.dispose();
      w.maxX = 14;
    });
    if (new URLSearchParams(location.search).has('shot')) {
      this.at(7.5, () => {
        this.meter = 0.85;
        w.figure.target.strain = 1;
        for (let i = 0; i < 4; i++) w.chain.heat[i] = 0.9 - i * 0.2;
      });
    }
  }

  private updateCounter(): void {
    this.ctx.ui.hud.set('top-right', this.ctx.t('wretched.hud.attempts', { n: this.w.attempts }));
  }

  /** Every attempt fails. This is the one place an attempt is counted. */
  private fail(kind: Attempt): void {
    const { ctx, w } = this;
    if (this.cooldown[kind] > 0 || this.collapsed >= 0) return;
    this.cooldown[kind] = kind === 'strain' ? 2.5 : 5;
    w.attempts++;
    w.weight = Math.min(1, w.weight + 0.07);
    w.double.reveal = Math.min(1, w.double.reveal + 0.08);
    w.double.flare(1);
    this.updateCounter();
    this.breath?.setRate(16 + w.attempts * 3);
    this.breath?.setLevel(0.12 + w.attempts * 0.03, 1);
    ctx.ui.whisper.show(ctx.t(`wretched.fail.${kind}`), { duration: 2.6 });
    this.failText = 2.6;
    haptic(30);
    if (w.attempts >= 3 && !this.tendril) this.growTendril();
  }

  /** The double's second grip: a shadow tendril from its chest to the visitor's wrist. */
  private growTendril(): void {
    const w = this.w;
    const from = w.double.pelvis(new Vector3());
    const to = w.figure.hand(new Vector3(), -1);
    const rope = createRope([from.x, from.y + 0.3, from.z], [to.x, to.y, to.z], 20, { slack: 1.15, iterations: 6, damping: 0.96 });
    rope.pin(0);
    rope.pin(20);
    rope.wind = (x, _y, z, t) => [Math.sin(t * 1.3 + z) * 0.6, 0.4, Math.cos(t * 1.1 + x) * 0.6];
    const mesh = new RopeMesh(rope, { radius: 0.035, color: '#0a0809', rimColor: '#3a1a12' });
    this.root.add(mesh.mesh);
    this.tendril = { rope, mesh };
  }

  private strike(): void {
    const { ctx, w } = this;
    const stone = this.holding!;
    this.holding = null;
    stone.held = false;
    stone.used = true;
    stone.mesh.visible = false;
    w.figure.target.strike = 0;
    const hit = w.chain.linkPosition(1, new Vector3());
    w.chain.heat[1] = 1;
    w.chain.heat[0] = 0.7;
    w.chain.heat[2] = 0.7;
    ctx.audio.impact(0.7);
    ctx.audio.chainRattle(0.9);
    ctx.audio.crumble(0.5);
    ctx.rig.addTrauma(0.3);
    w.sparks.emit(hit, 40, SPARK, { speed: 3.2, up: 1.4, life: 0.8 });
    w.sparks.emit(hit, 30, STONE_DUST, { speed: 1.2, up: 0.6, life: 1.4, spread: 0.2 });
    // The stone shatters into Rapier debris; the link only glows and cools.
    const physics = w.physics;
    if (physics) {
      const geo = (stone.mesh.geometry as DodecahedronGeometry).clone().scale(0.4, 0.4, 0.4);
      for (let i = 0; i < 7; i++) {
        const body = physics.addBall({ x: hit.x + (Math.random() - 0.5) * 0.2, y: hit.y + 0.3, z: hit.z + (Math.random() - 0.5) * 0.2 }, 0.06, { density: 2 });
        body.applyImpulse({ x: (Math.random() - 0.5) * 0.4, y: 0.5 + Math.random() * 0.4, z: (Math.random() - 0.5) * 0.4 }, true);
        const mesh = new Mesh(geo, stone.mesh.material);
        mesh.castShadow = true;
        this.root.add(mesh);
        physics.bind(mesh, body);
        this.debris.push({ body, mesh, until: this.time + 5 });
      }
    }
    this.fail('stone');
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx, w } = this;
    const input = ctx.input;
    const fig = w.figure;
    for (const k of Object.keys(this.cooldown) as Attempt[]) this.cooldown[k] = Math.max(0, this.cooldown[k] - dt);
    this.failText -= dt;
    w.physics?.sync();

    // Debris expires.
    this.debris = this.debris.filter((d) => {
      if (this.time < d.until) return true;
      w.physics?.unbind(d.body);
      w.physics?.remove(d.body);
      d.mesh.removeFromParent();
      return false;
    });

    // Tendril follows its two ends.
    if (this.tendril) {
      const a = w.double.pelvis(new Vector3());
      const b = fig.hand(new Vector3(), -1);
      this.tendril.rope.movePin(0, a.x, a.y + 0.35, a.z);
      this.tendril.rope.movePin(20, b.x, b.y, b.z);
      this.tendril.rope.step(dt);
      this.tendril.mesh.update();
    }

    if (this.collapsed >= 0) {
      if (this.time - this.collapsed > 6) this.complete();
      return;
    }

    // 1 · Strain: mash primary. The meter fills, the chain stretches and sparks, then collapses.
    if (!this.holding && input.pressed('primary')) {
      this.meter = Math.min(1, this.meter + 0.13);
      fig.target.strain = 1;
      ctx.audio.chainRattle(0.4 + this.meter * 0.5);
      ctx.rig.addTrauma(0.08 + this.meter * 0.12);
      const p = w.chain.linkPosition(Math.floor(Math.random() * LINKS), new Vector3());
      w.sparks.emit(p, 4 + Math.floor(this.meter * 10), SPARK, { speed: 2, up: 1, life: 0.6 });
      for (let i = 0; i < 3; i++) w.chain.heat[i] = Math.max(w.chain.heat[i]!, this.meter * 0.5);
      if (this.meter >= 1) {
        this.meter = 0;
        ctx.audio.impact(0.4);
        this.fail('strain');
      }
    }
    this.meter = Math.max(0, this.meter - dt * 0.18);
    fig.target.strain = damp(fig.target.strain, this.meter > 0.05 ? 1 : 0, 3, dt);
    if (this.meter > 0.02 || this.failText > 0) ctx.ui.hud.set('bottom-center', this.meter > 0.02 ? meterBar(this.meter) : '');

    // 2 · A stone: pick it up (E) and strike the links (Space).
    if (!this.holding && input.pressed('secondary')) {
      const near = this.stones.find((s) => !s.used && s.mesh.position.distanceTo(fig.position) < 1.8);
      if (near) {
        this.holding = near;
        near.held = true;
        ctx.audio.impact(0.15);
        ctx.ui.hud.set('top-left', ctx.t('wretched.whisper.strike'));
      }
    } else if (this.holding && input.pressed('primary')) {
      fig.target.strike = 1;
      this.at(this.time + 0.18, () => this.holding && this.strike());
    }
    if (this.holding) fig.hand(this.holding.mesh.position);
    else if (!this.stones.some((s) => !s.used)) ctx.ui.hud.set('top-left', '');

    // 3 · Run away from the double: the chain yanks the visitor off their feet.
    if (w.tautTime > 0.9 && input.raw.moveY < 0.5 && this.cooldown.run === 0 && fig.target.fall === 0) {
      w.tautTime = 0;
      fig.target.fall = 1;
      ctx.audio.chainSnap({ level: 0.6 });
      ctx.audio.impact(0.6);
      ctx.rig.addTrauma(0.5);
      w.velocity.multiplyScalar(-0.6);
      this.fail('run');
      this.at(this.time + 1.6, () => (fig.target.fall = 0));
    }

    // 4 · The cliff: drag the double to the edge and it climbs back, pulling the visitor along.
    const pel = w.double.pelvis(new Vector3());
    if (pel.x > PATH.cliffX - 2.4) {
      const rd = w.double.ragdoll;
      if (rd) for (const b of Object.values(rd.bodies)) b.applyImpulse({ x: -0.25 * b.mass() * 60 * dt, y: 0.12 * b.mass() * 60 * dt, z: 0 }, true);
      w.double.posture = 1.2;
      if (this.cooldown.cliff === 0) {
        ctx.audio.chainRattle(0.7);
        fig.position.x = Math.min(w.maxX, fig.position.x + 0.6);
        ctx.rig.addTrauma(0.2);
        this.fail('cliff');
      }
    } else w.double.posture = damp(w.double.posture, 1, 1, dt);

    // 5 · Outrun it toward the light: the corruption peaks.
    const forward = input.raw.moveY > 0.6 && fig.position.z < PATH.arena - 3;
    this.outrunTime = forward ? Math.min(2, this.outrunTime + dt) : Math.max(0, this.outrunTime - dt);
    if (this.outrunTime > 1.6 && w.betrayal) this.fail('outrun');
    w.maxX = PATH.cliffX - 0.5;
    if (fig.position.z < PATH.arena - 22) fig.position.z = PATH.arena - 22;

    // The collapse: enough attempts, or 90 seconds.
    if (w.attempts >= 6 || this.time > 90) this.collapse();
  }

  private collapse(): void {
    const { ctx, w } = this;
    this.collapsed = this.time;
    ctx.input.clearFilters();
    collapsedPose(ctx);
    w.figure.target.strain = 0;
    w.weight = 0.95;
    w.double.posture = 1;
    ctx.ui.whisper.hide();
    ctx.ui.hud.clear();
    w.setBedLevel(0, 3);
    this.breath?.setRate(11);
    this.breath?.setLevel(0.2, 2);
    ctx.audio.impact(0.35);
    follow(ctx, 'low');
  }
}

function meterBar(v: number): string {
  const n = 12;
  const k = Math.round(v * n);
  return `${'▮'.repeat(k)}${'▯'.repeat(n - k)}`;
}

// -------------------------------------------------------------------------------------------------
// CH5 · ῥύσεται · WHO WILL DELIVER ME?
// -------------------------------------------------------------------------------------------------
export class Cry extends WChapter {
  readonly id = 'cry';
  override keyMomentAt = 10;
  override transitionIn = 'ink' as const;
  private meter = new HoldMeter({ fillTime: 7, drainTime: 2.5 });
  private line: WordLine | null = null;
  private voice: ReturnType<WretchedCtx['audio']['drone']> | null = null;
  private done = false;
  private shot = false;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.meter.reset();
    this.done = false;
    this.shot = new URLSearchParams(location.search).has('shot');
    await this.begin(ctx, { z: PATH.arena, chained: true, weight: 0.95, reveal: 0.7, posture: 1 });
    collapsedPose(ctx);
    this.w.setBedLevel(0, 1);
    this.card({ word: 'ῥύσεται', lang: 'grc', translit: 'rhysetai', english: 'will deliver', ref: 'Romans 7:24', number: 5 });
    this.own(ctx.audio.breathing(10, { level: 0.14 }));
    this.voice = this.own(ctx.audio.drone(196, 'choir', { level: 0 }));
    this.at(4.8, () => ctx.ui.whisper.show(ctx.t('wretched.whisper.cry')));
    this.at(4.8, () => ctx.ui.cursor.setLabel(ctx.t('core.cursor.hold')));
    this.line = new WordLine(partial('Romans 7:24', 1), { huge: true });
    const line = this.line;
    this.own(() => {
      line.remove();
      ctx.ui.cursor.setLabel(null);
    });
    ctx.rig.follow(this.w.figure.group, { ...VIEWS.sky(0), spring: 'heavy' });
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx, w } = this;
    const holding = this.time > 4.5 && (ctx.input.raw.hold || ctx.input.raw.primary || (this.shot && this.time > 5));
    const v = this.done ? 1 : this.meter.update(dt, holding);
    if (holding) ctx.ui.whisper.hide();
    const e = v * v * (3 - 2 * v);
    ctx.rig.follow(w.figure.group, { ...VIEWS.sky(e), spring: 'heavy' });
    w.figure.target.head = 0.35 - e * 1.25;
    w.figure.target.reach = e * 0.35;
    w.beacon.level = 1 + e * 2.4;
    this.voice?.setLevel(e * 0.22, 0.2);
    this.voice?.setFreq(196 + e * 98, 0.3);
    this.line?.reveal(v * 1.02);
    if (v >= 1 && !this.done) {
      this.done = true;
      this.line?.ref(formatRef('Romans 7:24'));
      haptic(40);
      this.at(this.time + 2.2, () => this.complete());
    }
    void clamp;
  }
}
