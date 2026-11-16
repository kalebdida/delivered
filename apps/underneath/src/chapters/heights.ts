// CH0 threshold · CH1 אֵין כָּאֵל (lean) · CH2 the ground gives way
import { Group, Mesh, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Dust, Physics, createCrumble, prefersReducedMotion, smoothstep, type Crumble, type WindHandle } from '@delivered/core';
import { UChapter, WordLine } from './base';
import { COLUMN } from '../world/layers';
import { SCULPTURES, Sculpture, chunkGeometry, clipToCircle, islandDetail, islandUnderside, makeIsland } from '../world/islands';
import type { Platform } from '../world/visitor';
import type { UnderCtx } from '../world/world';

const touch = () => matchMedia('(pointer: coarse)').matches;

export class Threshold extends UChapter {
  readonly id = 'threshold';
  override keyMomentAt = 6.5;
  override transitionIn = 'fade' as const;
  private line: WordLine | null = null;

  enter(ctx: UnderCtx): void {
    this.begin(ctx);
    const { postfx, audio, t } = ctx;
    postfx.fadeTo('black', 1, 0);
    this.own(() => postfx.fadeTo('black', 0, 0));
    this.w.camMode = 'free';
    this.w.free(new Vector3(0, COLUMN.islands + 6, 20), new Vector3(0, COLUMN.islands + 2, 0));
    const wind = this.own(audio.wind(0.06, { level: 0.35 }));
    this.at(1.2, () => {
      this.line = new WordLine('יְשֻׁרוּן', { hebrew: true, lang: 'he' });
      requestAnimationFrame(() => this.line?.reveal(1));
    });
    this.at(3.6, () => this.line?.sub(t('underneath.yeshurun'), 'dl-title'));
    this.at(5.6, () => this.line?.sub(t('underneath.upright'), 'dl-verse'));
    this.at(9.5, () => {
      this.line?.remove();
      this.line = null;
      wind.setLevel(0.5, 3);
    });
    this.at(10.6, () => void ctx.ui.scripture.show({ ref: 'Deuteronomy 33:26', partial: 0, align: 'center', duration: 5.5 }));
    this.at(17.5, () => this.complete());
    this.own(() => this.line?.remove());
  }

  update(): void {
    this.runEvents();
  }
}

// ---------------------------------------------------------------------------------------------

const HOME_R = 6.5;
/** The CH1 opening frame (ground camera framing). */
const OPEN = { distance: 2.0, lift: 2.6, side: 2.4 };
const ISLE_R = 2.6;
const ISLE_D = 13.5;

/** Home island and the six islands with bridges, as platforms. */
function buildHeights(ctx: UnderCtx, root: Group): { platforms: Platform[]; sculptures: Sculpture[] } {
  const { mats } = ctx.world;
  const y = COLUMN.islands;
  const home = makeIsland(HOME_R, 3, mats);
  home.position.set(0, y, 0);
  root.add(home);
  const platforms: Platform[] = [{ x: 0, z: 0, y, r: HOME_R, ledge: true }];
  const sculptures: Sculpture[] = [];
  SCULPTURES.forEach((kind, i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6 + Math.PI / 2;
    const x = Math.cos(a) * ISLE_D;
    const z = Math.sin(a) * ISLE_D;
    const isle = makeIsland(ISLE_R, 10 + i, mats);
    isle.position.set(x, y, z);
    root.add(isle);
    const s = new Sculpture(kind, mats);
    s.group.position.set(0, 0, 0);
    s.group.rotation.y = Math.atan2(-x, -z);
    s.island = isle;
    isle.add(s.group);
    sculptures.push(s);
    platforms.push({ x, z, y, r: ISLE_R, ledge: true });
    // A stone bridge from home to the island.
    const mid = (HOME_R + ISLE_D - ISLE_R) / 2;
    const len = ISLE_D - ISLE_R - HOME_R + 1.2;
    const bridge = new Mesh(new RoundedBoxGeometry(1.5, 0.3, len, 3, 0.12), mats.bridge);
    bridge.position.set(Math.cos(a) * mid, y - 0.16, Math.sin(a) * mid);
    bridge.rotation.y = Math.PI / 2 - a;
    bridge.castShadow = bridge.receiveShadow = true;
    root.add(bridge);
    platforms.push({ x: bridge.position.x, z: bridge.position.z, y, r: 0, hx: 0.75, hz: len / 2, rot: a - Math.PI / 2 });
  });
  return { platforms, sculptures };
}

export class Lean extends UChapter {
  readonly id = 'lean';
  override keyMomentAt = 6;
  override transitionIn = 'light' as const;
  private sculptures: Sculpture[] = [];
  private leanT = 0;
  private target: Sculpture | null = null;
  private failed = 0;
  private finishedAt = -1;
  private hinted = false;
  private dust!: Dust;
  private birds = 2;
  private settle = -1;

  enter(ctx: UnderCtx): void {
    this.begin(ctx, [
      { id: 'primary', label: ctx.t('underneath.jump'), size: 'large', icon: 'up' },
      { id: 'secondary', label: ctx.t('core.controls.action'), size: 'small', icon: 'hand' },
    ]);
    const w = this.w;
    const built = buildHeights(ctx, this.root);
    this.sculptures = built.sculptures;
    w.platforms = built.platforms;
    w.camMode = 'ground';
    // The opening frame: wide, low sun ahead and to the right, the figure on the left third. It
    // settles into the play camera when the visitor first moves (or after a few seconds).
    w.camDistance = OPEN.distance;
    w.lookLift = OPEN.lift;
    w.lookSide = OPEN.side;
    w.yaw = 0;
    this.settle = -1;
    w.visitor.fallPose = 0;
    w.visitor.lean = 0;
    w.visitor.motion.teleport(0.4, COLUMN.islands, 0.6, w.platforms[0]!);
    w.visitor.group.position.copy(w.visitor.motion.pos);
    w.visitor.heading = Math.PI;
    w.visitor.settle();
    w.arms.group.visible = false;
    w.rider.level = 0;
    w.sky.fogScale = 1;
    w.sky.wispScale = 1;
    w.snapCamera();

    this.dust = new Dust({ count: ctx.quality.tier === 'low' ? 300 : 800, bounds: [26, 8, 26], color: '#F5C76B', size: 3 });
    this.dust.points.position.set(0, COLUMN.islands + 3, 0);
    this.root.add(this.dust.points);
    this.own(this.dust as unknown as { dispose(): void });
    ctx.postfx.setGodRays(w.sky.sunMesh, { density: 0.94, weight: 0.42, decay: 0.94, exposure: 0.55 });
    this.own(() => ctx.postfx.setGodRays(null));

    const { audio } = ctx;
    this.own(audio.wind(0.18, { level: 0.5 }));
    this.own(audio.drone(110, 'warm', { level: 0.18 }));
    this.card({ word: 'אֵין כָּאֵל', lang: 'he', translit: "ein ka'el", english: 'there is no one like God', ref: 'Deuteronomy 33:26', number: 1 });
    this.at(8, () => ctx.ui.whisper.show(ctx.t('underneath.move'), { duration: 6 }));
  }

  update(dt: number): void {
    const { input, audio, ui, t } = this.ctx;
    const w = this.w;
    this.runEvents();
    this.dust.update(dt);
    // The opening frame eases into the play camera.
    const f = this.ctx.input.filtered;
    if (this.settle < 0 && (Math.hypot(f.moveX, f.moveY) > 0.2 || Math.abs(f.lookX) > 0.2 || this.time > 10)) this.settle = 0;
    if (this.settle >= 0 && this.settle < 3.5) {
      this.settle += dt;
      const k = smoothstep(0, 3.2, this.settle);
      w.camDistance = OPEN.distance + (1.1 - OPEN.distance) * k;
      w.lookLift = OPEN.lift * (1 - k) + 0.3 * k;
      w.lookSide = OPEN.side * (1 - k);
    }
    this.birds -= dt;
    if (this.birds < 0) {
      this.birds = 5 + Math.random() * 7;
      const f = 1900 + Math.random() * 600;
      audio.flute(f, { duration: 0.09, level: 0.05 });
      audio.flute(f * 1.12, { duration: 0.08, level: 0.04, when: 0.14 });
    }

    // Nearest intact sculpture.
    const p = w.visitor.motion.pos;
    let near: Sculpture | null = null;
    for (const s of this.sculptures) {
      if (s.failing >= 0) continue;
      const sp = s.island!.position;
      if (Math.hypot(p.x - sp.x, p.z - sp.z) < 2.0) near = s;
    }
    const leaning = !!near && input.filtered.secondary && w.visitor.motion.grounded;
    if (near && !this.hinted && w.visitor.motion.grounded) {
      this.hinted = true;
      ui.whisper.show(t(touch() ? 'underneath.leanTouch' : 'underneath.lean'), { duration: 5 });
    }
    if (leaning && near) {
      this.target = near;
      this.leanT += dt;
      const sp = near.island!.position;
      w.visitor.heading = Math.atan2(sp.x - p.x, sp.z - p.z);
      w.visitor.lean = Math.min(1, this.leanT * 2);
      w.visitor.motion.vel.set(0, w.visitor.motion.vel.y, 0);
      if (this.leanT > 1.5) this.fail(near);
    } else {
      this.leanT = 0;
      w.visitor.lean = Math.max(0, w.visitor.lean - dt * 3);
      this.walk(dt);
    }
    if (leaning) w.visitor.group.position.copy(w.visitor.motion.pos);

    for (const s of this.sculptures) s.update(dt);
    if (this.failed === 6 && this.finishedAt < 0) {
      this.finishedAt = this.time;
      this.at(this.time + 3.5, () => void ui.scripture.show({ ref: 'Deuteronomy 33:26', partial: 0, align: 'center', duration: 6.5 }));
      this.at(this.time + 11, () => this.complete());
    }
  }

  private fail(s: Sculpture): void {
    const { audio, rig } = this.ctx;
    const w = this.w;
    const sp = s.island!.position;
    const p = w.visitor.motion.pos;
    const dir = new Vector3(sp.x - p.x, 0, sp.z - p.z).normalize();
    s.fail(dir);
    this.failed++;
    this.leanT = 0;
    this.hinted = false;
    // The visitor stumbles back.
    w.visitor.motion.vel.set(-dir.x * 3.2, 2.2, -dir.z * 3.2);
    w.visitor.motion.grounded = false;
    w.visitor.motion.ground = null;
    rig.addTrauma(0.25);
    switch (s.kind) {
      case 'coins':
        for (let i = 0; i < 14; i++) audio.bell(1700 + Math.random() * 1200, { when: i * 0.09, level: 0.06 });
        audio.crumble(0.25, { when: 0.6 });
        break;
      case 'crown':
        audio.crumble(0.5);
        audio.impact(0.35, { when: 1.8 });
        break;
      case 'mirror': {
        audio.bell(1320, { level: 0.2 });
        audio.bell(1980, { level: 0.1, when: 0.05 });
        const sand = audio.rain(0.25, { level: 0.4 });
        setTimeout(() => sand.stop(2.5), 2500);
        break;
      }
      case 'books': {
        const gust = audio.wind(0.6, { level: 0.5 });
        gust.stop(3.5);
        break;
      }
      case 'throne':
        audio.horn(55, { level: 0.25, duration: 3 });
        audio.crumble(0.7, { when: 0.4 });
        break;
      case 'idol': {
        audio.impact(0.7);
        const hollow = audio.drone(55, 'hollow', { level: 0.25 });
        hollow.stop(3.5);
        break;
      }
    }
    // The tilted and sunken islands are no longer safe to stand on.
    if (s.kind === 'crown' || s.kind === 'throne') {
      const plat = w.platforms.find((pl) => pl.x === sp.x && pl.z === sp.z);
      if (plat) setTimeout(() => (plat.solidAt = () => false), 900);
    }
  }

  override exit(): void {
    this.sculptures.forEach((s) => s.dispose());
    this.sculptures = [];
  }
}

// ---------------------------------------------------------------------------------------------

interface Isle {
  x: number;
  z: number;
  y: number;
  r: number;
  slab: Crumble;
  under: Mesh;
  detail: Group;
  platform: Platform;
  /** Seconds until it collapses once triggered; < 0 idle. */
  timer: number;
  fallen: boolean;
  fallT: number;
}

/** The course of islands ahead (toward -z), each crumbling after it is stood on. */
const COURSE = [
  { x: 0, z: 0, r: 4.2 },
  { x: 2.2, z: -7.4, r: 2.3 },
  { x: -1.4, z: -13.6, r: 2.2 },
  { x: 2.6, z: -19.6, r: 2.1 },
  { x: 0.2, z: -25.8, r: 2.2 },
  { x: -2.8, z: -31.6, r: 2.0 },
  { x: 0.4, z: -37.8, r: 2.4 },
];

export class GiveWay extends UChapter {
  readonly id = 'give-way';
  override keyMomentAt = 9;
  override transitionIn = 'dissolve' as const;
  private physics: Physics | null = null;
  private isles: Isle[] = [];
  private reached = 0;
  private wind: WindHandle | null = null;
  private dropping = -1;
  private gusting = -1;
  private gustTo: Isle | null = null;
  private gustFrom = new Vector3();

  async enter(ctx: UnderCtx): Promise<void> {
    this.begin(ctx, [
      { id: 'primary', label: ctx.t('underneath.jump'), size: 'large', icon: 'up' },
      { id: 'secondary', label: ctx.t('core.controls.action'), size: 'small', icon: 'hand' },
    ]);
    const w = this.w;
    this.physics = await Physics.create();
    const per = Math.max(8, Math.min(22, Math.floor(ctx.quality.budget.maxBodies / 3)));
    const y0 = COLUMN.islands;
    this.isles = COURSE.map((c, i) => {
      const y = y0 - i * 0.5;
      const slab = createCrumble(this.physics!, { position: { x: c.x, y: y - 0.25, z: c.z }, width: c.r * 2, depth: c.r * 2, thickness: 0.5, chunks: i === 0 ? per + 6 : per, material: w.mats.turf, seed: 'isle' + i, solid: false });
      // Round the slab: every chunk is redrawn as its piece of the round island (clipped to the
      // circle, bevelled, grass on top); chunks wholly outside the circle are not part of it.
      for (const ch of slab.chunks) {
        const hull = ch.mesh.userData.hull as Float32Array;
        const poly: [number, number][] = [];
        for (let k = 0; k < hull.length; k += 6) poly.push([hull[k]!, hull[k + 2]!]);
        const piece = clipToCircle(poly, -ch.centre[0], -ch.centre[1], c.r * 0.97);
        if (piece.length < 3) {
          ch.mesh.visible = false;
          continue;
        }
        ch.mesh.geometry.dispose();
        ch.mesh.geometry = chunkGeometry(piece, 0.5, i * 7.3);
        ch.mesh.material = w.mats.grass;
      }
      this.root.add(slab.group);
      const under = islandUnderside(c.r * 0.95, 20 + i, w.mats.rock);
      under.position.set(c.x, y, c.z);
      const detail = islandDetail(c.r * 0.8, 30 + i, w.mats);
      detail.position.set(c.x, y, c.z);
      this.root.add(under, detail);
      const isle: Isle = { x: c.x, z: c.z, y, r: c.r * 0.9, slab, under, detail, timer: -1, fallen: false, fallT: 0, platform: null as unknown as Platform };
      isle.platform = {
        x: c.x, z: c.z, y, r: c.r * 0.9, ledge: true,
        solidAt: (px, pz) => {
          if (isle.fallen && isle.fallT > 0.4) return false;
          let best = Infinity;
          let ok = false;
          for (const ch of slab.chunks) {
            if (!ch.mesh.visible) continue;
            const d = Math.hypot(px - c.x - ch.centre[0], pz - c.z - ch.centre[1]);
            if (d < best) {
              best = d;
              ok = ch.body === null;
            }
          }
          return ok;
        },
      };
      this.own(slab);
      return isle;
    });
    // Registered after the slabs so they release their bodies before the world is freed.
    this.own(() => {
      this.physics?.dispose();
      this.physics = null;
    });
    w.platforms = this.isles.map((i) => i.platform);
    w.camMode = 'ground';
    w.yaw = 0;
    // Frame the course ahead: the figure low and left, the islands running into the sun.
    w.camDistance = 1.2;
    w.lookLift = 0.9;
    w.lookSide = 1.3;
    w.visitor.fallPose = 0;
    w.visitor.lean = 0;
    w.visitor.motion.teleport(0, y0, 1.5, this.isles[0]!.platform);
    w.visitor.group.position.copy(w.visitor.motion.pos);
    w.visitor.heading = Math.PI;
    w.visitor.settle();
    w.snapCamera();
    w.visitor.motion.onLand = (v) => {
      if (v > 4) this.ctx.audio.impact(Math.min(0.5, v / 20));
    };
    this.own(() => (w.visitor.motion.onLand = null));

    ctx.postfx.setGodRays(w.sky.sunMesh, { density: 0.94, weight: 0.4, decay: 0.94, exposure: 0.5 });
    this.own(() => ctx.postfx.setGodRays(null));
    this.wind = this.own(ctx.audio.wind(0.25, { level: 0.6 }));
    this.card({ word: 'יְשֻׁרוּן', lang: 'he', translit: 'Yeshurun', english: 'upright one', ref: 'Deuteronomy 33:26', number: 2 });
    // The home island begins to crack on its own.
    this.at(3.5, () => {
      ctx.audio.crumble(0.5);
      ctx.rig.addTrauma(0.3);
      ctx.ui.whisper.show(ctx.t('underneath.run'), { duration: 4 });
    });
    this.at(4, () => this.trigger(this.isles[0]!, 4.5));
  }

  private get easy(): number {
    return this.w.easyIslands ? 2 : 1;
  }

  private trigger(isle: Isle, seconds: number): void {
    if (isle.timer < 0 && !isle.fallen) isle.timer = seconds * this.easy;
  }

  override fixedUpdate(dt: number): void {
    this.physics?.step(dt);
    for (const i of this.isles) i.slab.update(dt);
  }

  update(dt: number): void {
    const { audio, rig } = this.ctx;
    const w = this.w;
    this.runEvents();
    this.physics?.sync();

    // The gust that returns a visitor who slipped.
    if (this.gusting >= 0) {
      this.gusting += dt;
      const k = Math.min(1, this.gusting / 1.6);
      const e = k * k * (3 - 2 * k);
      const to = this.gustTo!;
      w.visitor.group.position.set(this.gustFrom.x + (to.x - this.gustFrom.x) * e, this.gustFrom.y + (to.y - this.gustFrom.y) * e + Math.sin(e * Math.PI) * 3, this.gustFrom.z + (to.z - this.gustFrom.z) * e);
      if (k >= 1) {
        this.gusting = -1;
        w.visitor.motion.teleport(to.x, to.y, to.z, to.platform);
      }
    } else if (this.dropping < 0) this.walk(dt);

    const m = w.visitor.motion;
    // Which island are we on?
    if (m.grounded && m.ground) {
      const idx = this.isles.findIndex((i) => i.platform === m.ground);
      if (idx >= 0) {
        if (idx > this.reached) this.reached = idx;
        const isle = this.isles[idx]!;
        const last = idx === this.isles.length - 1;
        this.trigger(isle, last ? 1.6 : 2.8);
        if (last && isle.fallen && this.dropping < 0 && isle.fallT > 0.2) this.dropping = 0;
      }
    }

    for (const isle of this.isles) {
      if (isle.timer >= 0) {
        isle.timer -= dt;
        // Shiver before it goes.
        const shake = Math.max(0, 1 - isle.timer / 1.5) * 0.04;
        isle.slab.group.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        if (isle.timer <= 0) {
          isle.timer = -1;
          isle.fallen = true;
          isle.slab.group.position.set(0, 0, 0);
          const p = w.visitor.motion.pos;
          const onIt = Math.hypot(p.x - isle.x, p.z - isle.z) < isle.r + 1;
          isle.slab.collapse(onIt ? { x: p.x, z: p.z } : { x: isle.x, z: isle.z }, 1.1);
          audio.crumble(0.8);
          audio.impact(0.4, { when: 0.3 });
          rig.addTrauma(onIt ? 0.45 : 0.15);
          this.wind?.setSpeed(Math.min(1, 0.3 + this.reached * 0.1), 3);
        }
      }
      if (isle.fallen) {
        isle.fallT += dt;
        const drop = 0.5 * 14 * Math.max(0, isle.fallT - 0.5) ** 2;
        isle.under.position.y = isle.y - drop;
        isle.under.rotation.z = isle.fallT * 0.06;
        isle.detail.visible = isle.fallT < 0.6;
        if (isle.fallT > 12) isle.under.visible = false;
        for (const ch of isle.slab.chunks) {
          if (ch.body && ch.mesh.visible && ch.mesh.position.y < isle.y - 120) {
            this.physics?.remove(ch.body);
            ch.mesh.visible = false;
          }
        }
      }
    }

    // Slipped off before the end: a gust carries them back to the next island that still stands.
    if (this.dropping < 0 && this.gusting < 0 && !m.grounded && !m.hanging && m.pos.y < COLUMN.islands - 7) {
      const next = this.isles.find((i, idx) => idx >= this.reached && !i.fallen && i.timer < 0) ?? this.isles.find((i) => !i.fallen);
      if (next) {
        this.gusting = 0;
        this.gustTo = next;
        this.gustFrom.copy(w.visitor.group.position);
        audio.wind(0.7, { level: 0.4 }).stop(2);
      } else this.dropping = 0;
    }

    // The last island is gone: the ground drops out from under the visitor's feet.
    if (this.dropping >= 0) {
      this.dropping += dt;
      m.step(dt, { dx: 0, dz: 0, jumpPressed: false, jumpHeld: false }, []);
      w.visitor.group.position.copy(m.pos);
      if (this.dropping > (prefersReducedMotion() ? 0.6 : 1.4)) this.complete();
    }
  }
}
