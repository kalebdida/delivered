// CH7 · let go. A bright sky playground: swings, a giant rope swing, a kite, a balloon, a bell
// tower and cloud ledges. Let go from anything, at any height: the arms always catch.
import {
  AdditiveBlending, BoxGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, ShaderMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { RopeMesh, button, createRope, damp, h, seededRandom, smoothstep, type Verlet } from '@delivered/core';
import { UChapter } from './base';
import { Arms } from '../world/arms';
import { CatchSystem, type CatchPlan } from '../world/play';
import { islandDetail, islandTop, islandUnderside } from '../world/islands';
import type { Platform } from '../world/visitor';
import type { UnderCtx } from '../world/world';
import { SUN } from '../world/sky';

const Y = 2400;
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

type PropKind = 'swing' | 'rope' | 'kite' | 'balloon' | 'tower';

interface Prop {
  kind: PropKind;
  /** Where the visitor grabs it (world). */
  grab: Vector3;
  /** Where the visitor is while attached (world), updated every frame. */
  seat: Vector3;
  /** Velocity of the seat, for a natural let-go. */
  vel: Vector3;
  t: number;
  angle: number;
  omega: number;
  update(dt: number, attached: boolean, pump: number): void;
  reset(): void;
}

function ropeBetween(a: Vector3, b: Vector3, segs: number, color: string, radius = 0.035): { rope: Verlet; tube: RopeMesh } {
  const rope = createRope(a.toArray() as [number, number, number], b.toArray() as [number, number, number], segs, { iterations: 10, slack: 1.0 });
  rope.pin(0);
  rope.pin(segs);
  return { rope, tube: new RopeMesh(rope, { radius, color }) };
}

export class Playground extends UChapter {
  readonly id = 'playground';
  override keyMomentAt = 12;
  override transitionIn = 'light' as const;
  private sys = new CatchSystem(Y - 9, Y - 32);
  private props: Prop[] = [];
  private ropes: { rope: Verlet; tube: RopeMesh }[] = [];
  private attached: Prop | null = null;
  private released = false;
  private catcher!: Arms;
  private plan: CatchPlan | null = null;
  private catchT = 0;
  private curve: CatchmullPath | null = null;
  private hud!: HTMLElement;
  private hinted = new Set<string>();
  private door = new Vector3(7.2, Y, -0.8);
  private finishing = false;
  private home!: Platform;
  private clouds: Platform[] = [];
  private melody = 0;
  private slideTube: Mesh | null = null;
  private slideMat!: ShaderMaterial;
  private catchY = 0;

  enter(ctx: UnderCtx): void {
    this.begin(ctx, [
      { id: 'primary', label: ctx.t('underneath.jump'), size: 'large', icon: 'up' },
      { id: 'secondary', label: ctx.t('core.controls.action'), size: 'small', icon: 'hand' },
    ]);
    const w = this.w;
    const m = w.mats;
    w.sky.dayMix = 1;
    w.sky.sky.setSun(38, 2.2);
    w.arms.group.visible = false;
    w.sky.lookAltitude = 2470;
    this.own(() => {
      w.sky.dayMix = 0;
      w.sky.sky.setSun(SUN.elevation, SUN.azimuth);
      w.sky.lookAltitude = null;
    });

    // The main ledge and three cloud ledges.
    const base = new Group();
    base.position.set(0, Y, 0);
    base.add(islandTop(8, 51, m.grass), islandUnderside(7.6, 51, m.rock), islandDetail(7.2, 52, m));
    this.root.add(base);
    this.home = { x: 0, z: 0, y: Y, r: 8, ledge: true };
    // Cloud ledges: soft, lumpy, lit white with cool sky light in the shadows.
    const cloudMat = new MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new Color('#d6e2f4'), emissiveIntensity: 0.42 });
    const rng = seededRandom('ledges');
    for (const [x, y, z] of [[19, Y - 1.5, -5], [-18, Y + 1, -9], [3, Y - 3, -21]] as const) {
      const g = new Group();
      g.position.set(x, y, z);
      for (let i = 0; i < 16; i++) {
        const s = new Mesh(new SphereGeometry(0.7 + rng() * 1.1, 20, 14), cloudMat);
        const a = rng() * Math.PI * 2;
        const r = 0.6 + rng() * 2.3;
        s.position.set(Math.cos(a) * r, -0.5 - rng() * 0.9 + (r < 1.6 ? 0.25 : 0), Math.sin(a) * r);
        s.scale.set(1, 0.62 + rng() * 0.2, 1);
        s.receiveShadow = true;
        g.add(s);
      }
      const top = new Mesh(new CylinderGeometry(2.6, 2.4, 0.4, 28), cloudMat);
      top.position.y = -0.2;
      top.receiveShadow = true;
      g.add(top);
      this.root.add(g);
      this.clouds.push({ x, z, y, r: 2.5 });
    }
    this.own(cloudMat);
    w.platforms = [this.home, ...this.clouds];

    this.buildProps(ctx);

    // The catcher: a small swirl of the same arms of light, waiting below the clouds.
    const tier = ctx.quality.tier;
    this.catcher = new Arms({ count: tier === 'low' ? 6000 : tier === 'medium' ? 14000 : 30000, scale: 14, ribbons: 6, seed: 'catcher' });
    this.catcher.group.position.set(0, Y - 40, 0);
    this.catcher.uniforms.uLevel.value = 0.0;
    this.root.add(this.catcher.group);
    this.own(this.catcher);
    this.slideMat = new ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float a = uA * (0.5 + 0.5 * sin(vUv.x * 40.0)); gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * 1.6 * a, a); }`,
    });
    this.own(this.slideMat);

    // Midday: a clean, bright grade instead of the golden one.
    ctx.postfx.setLUT({ shadows: '#2c3c6e', highlights: '#fff6e2', tintStrength: 0.2, contrast: 1.07, saturation: 1.16, gamma: 1.0 });
    this.own(() => w.sky.setGrade('heights'));
    w.camMode = 'ground';
    w.camDistance = 1.35;
    w.lookLift = 1.6;
    // Portrait is narrow: lean the frame toward the swing instead of past it.
    const tall = innerWidth / Math.max(1, innerHeight) < 0.8;
    w.lookSide = tall ? -1.6 : 1.2;
    w.yaw = Math.PI - 0.15;
    w.visitor.fallPose = 0;
    w.visitor.lean = 0;
    w.visitor.glowLevel = 1;
    w.visitor.body.rotation.set(0, 0, 0);
    w.visitor.motion.teleport(0.5, Y, 1.2, this.home);
    w.visitor.group.position.copy(w.visitor.motion.pos);
    w.visitor.heading = -0.15;
    w.visitor.settle();
    w.snapCamera();
    w.lets = 0;
    w.catches = 0;

    // HUD: the count, and a finish button that is always there.
    this.hud = h('div', { class: 'un-alt', 'aria-live': 'off' });
    ctx.ui.hud.set('top-right', this.hud);
    const finish = button({ label: ctx.t('underneath.finish'), variant: 'text', onClick: () => this.finish() });
    finish.classList.add('un-finish');
    ctx.ui.hud.set('top-left', finish);
    this.updateHud();

    const a = ctx.audio;
    this.own(a.wind(0.12, { level: 0.3 }));
    this.own(a.drone(261.63, 'warm', { level: 0.08 }));
    this.card({ word: 'זְרֹעֹת עוֹלָם', lang: 'he', translit: "zero'ot olam", english: 'everlasting arms', ref: 'Deuteronomy 33:27', number: 7 });
    this.at(5, () => ctx.ui.whisper.show(ctx.t('underneath.letGoHint'), { duration: 6 }));
  }

  private buildProps(ctx: UnderCtx): void {
    const m = this.w.mats;
    const light = new ShaderMaterial({
      uniforms: { uC: { value: new Color('#ffe2a8').multiplyScalar(1.8) } },
      vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`,
    });
    this.own(light);
    const add = (o: Mesh | Group) => (this.root.add(o), o);

    // Swing: a beam of light reaching out over the edge, a seat on two Verlet ropes. Swings along +z.
    {
      const pivot = new Vector3(2.4, Y + 6.2, 8.6);
      const L = 5.2;
      const arch = add(new Mesh(new TorusGeometry(1.5, 0.06, 8, 40, Math.PI), light));
      // The arch faces the ledge as one soft arc over the swing (seen edge-on against the beam it
      // would read as a cross, which this room never uses as decoration).
      arch.position.set(pivot.x, Y + 4.7, 7.2);
      arch.rotation.y = 0;
      arch.scale.set(1, 1, 1);
      const beam = add(new Mesh(new CylinderGeometry(0.07, 0.07, 1.6, 8), light));
      beam.rotation.z = Math.PI / 2;
      beam.position.copy(pivot);
      for (const s of [-1, 1]) {
        const post = add(new Mesh(new CylinderGeometry(0.08, 0.1, 6.2, 8), m.stone));
        post.position.set(pivot.x + s * 0.8, Y + 3.1, 6.8);
      }
      const seatMesh = add(new Mesh(new BoxGeometry(1.1, 0.1, 0.45), new MeshStandardMaterial({ color: '#c98f4a', roughness: 0.7 })));
      const ropes = [-0.5, 0.5].map((dx) => ropeBetween(pivot.clone().add(new Vector3(dx, 0, 0)), pivot.clone().add(new Vector3(dx, -L, 0)), 12, '#d8c3a0', 0.03));
      ropes.forEach((r) => (this.ropes.push(r), this.root.add(r.tube.mesh)));
      const prop: Prop = {
        kind: 'swing', grab: pivot.clone().add(new Vector3(0, -L, 0)), seat: new Vector3(), vel: new Vector3(), t: 0, angle: 0.15, omega: 0,
        update(dt, attached, pump) {
          const g = 9.8;
          this.omega += (-(g / L) * Math.sin(this.angle)) * dt;
          if (attached) this.omega += pump * Math.sign(this.omega || 1) * dt * 0.9;
          this.omega *= attached ? 0.999 : 0.995;
          this.angle += this.omega * dt;
          this.angle = Math.max(-1.25, Math.min(1.25, this.angle));
          this.seat.set(pivot.x, pivot.y - L * Math.cos(this.angle), pivot.z + L * Math.sin(this.angle));
          this.vel.set(0, L * Math.sin(this.angle) * this.omega, L * Math.cos(this.angle) * this.omega);
          this.grab.copy(this.seat);
          seatMesh.position.copy(this.seat);
          seatMesh.rotation.x = this.angle;
          ropes.forEach((r, i) => r.rope.movePin(12, this.seat.x + (i ? 0.5 : -0.5), this.seat.y, this.seat.z));
        },
        reset() {
          this.omega = 1.2;
        },
      };
      this.props.push(prop);
    }

    // Giant rope swing from a high floating arch; swings outward along -x.
    {
      const pivot = new Vector3(-7.4, Y + 24, -1.5);
      const L = 21.5;
      const ring = add(new Mesh(new TorusGeometry(2.4, 0.09, 8, 48), light));
      ring.position.copy(pivot).add(new Vector3(0, 0.5, 0));
      const anchorIsle = new Group();
      anchorIsle.position.copy(pivot).add(new Vector3(0, 1.2, 0));
      anchorIsle.add(islandTop(2.2, 61, m.grass), islandUnderside(2.1, 61, m.rock));
      add(anchorIsle);
      const r = ropeBetween(pivot, pivot.clone().add(new Vector3(0, -L, 0)), 26, '#c9ad80', 0.06);
      this.ropes.push(r);
      this.root.add(r.tube.mesh);
      const knot = add(new Mesh(new SphereGeometry(0.22, 12, 8), new MeshStandardMaterial({ color: '#c9ad80', roughness: 0.8 })));
      const prop: Prop = {
        kind: 'rope', grab: new Vector3(), seat: new Vector3(), vel: new Vector3(), t: 0, angle: 0.05, omega: 0,
        update(dt, attached, pump) {
          this.omega += (-(9.8 / L) * Math.sin(this.angle)) * dt;
          if (attached) this.omega += pump * Math.sign(this.omega || 1) * dt * 0.35;
          this.omega *= 0.998;
          this.angle = Math.max(-1.1, Math.min(1.1, this.angle + this.omega * dt));
          this.seat.set(pivot.x - L * Math.sin(this.angle), pivot.y - L * Math.cos(this.angle), pivot.z);
          this.vel.set(-L * Math.cos(this.angle) * this.omega, L * Math.sin(this.angle) * this.omega, 0);
          this.grab.copy(this.seat);
          knot.position.copy(this.seat);
          r.rope.movePin(26, this.seat.x, this.seat.y, this.seat.z);
        },
        reset() {
          this.omega = -0.5;
        },
      };
      this.props.push(prop);
    }

    // Kite: a stake on the ledge, a string up to a kite. Holding on, it lifts the visitor away.
    {
      const stake = new Vector3(6.6, Y, 3.0);
      const post = add(new Mesh(new CylinderGeometry(0.06, 0.08, 1.1, 8), m.stone));
      post.position.copy(stake).add(new Vector3(0, 0.55, 0));
      const kite = add(new Mesh(new PlaneGeometry(2.2, 3.0), new MeshStandardMaterial({ color: '#e0a24a', side: DoubleSide, roughness: 0.6, emissive: new Color('#6a2a10'), emissiveIntensity: 0.25 })));
      const tail = add(new Mesh(new ConeGeometry(0.08, 3, 4), new MeshStandardMaterial({ color: '#c94a4a', roughness: 0.6 })));
      const r = ropeBetween(stake.clone().add(new Vector3(0, 1.1, 0)), new Vector3(14, Y + 26, 10), 20, '#f2e6d4', 0.02);
      this.ropes.push(r);
      this.root.add(r.tube.mesh);
      const kitePos = new Vector3();
      const prop: Prop = {
        kind: 'kite', grab: stake.clone().add(new Vector3(0, 1.0, 0)), seat: new Vector3(), vel: new Vector3(), t: 0, angle: 0, omega: 0,
        update(dt, attached) {
          this.t += dt;
          const lift = attached ? Math.min(1, this.angle + dt / 9) : Math.max(0, this.angle - dt / 4);
          this.angle = lift;
          kitePos.set(14 + Math.sin(this.t * 0.4) * 3 + lift * 6, Y + 26 + Math.sin(this.t * 0.7) * 2 + lift * 8, 10 + Math.cos(this.t * 0.3) * 2 + lift * 4);
          kite.position.copy(kitePos);
          kite.rotation.set(-0.4 + Math.sin(this.t) * 0.1, 0.6, Math.PI / 4 + Math.sin(this.t * 1.3) * 0.15);
          tail.position.copy(kitePos).add(new Vector3(0, -2.2, 0));
          const prev = this.seat.clone();
          const from = stake.clone().add(new Vector3(0, 1.0, 0));
          const e = lift * lift * (3 - 2 * lift);
          this.seat.copy(from).lerp(kitePos.clone().add(new Vector3(0, -5, 0)), e * 0.85);
          if (dt > 0) this.vel.copy(this.seat).sub(prev).divideScalar(dt);
          r.rope.movePin(0, attached ? this.seat.x : from.x, attached ? this.seat.y + 1.2 : from.y, attached ? this.seat.z : from.z);
          r.rope.movePin(20, kitePos.x, kitePos.y, kitePos.z);
        },
        reset() {},
      };
      this.props.push(prop);
    }

    // Hot-air balloon: step in, it rises and drifts out over the clouds.
    {
      const home = new Vector3(-5.4, Y, 5.0);
      const bal = new Group();
      const env = new Mesh(new SphereGeometry(2.4, 24, 18), new MeshStandardMaterial({ color: '#e7b85a', roughness: 0.55, emissive: new Color('#6a3a10'), emissiveIntensity: 0.2 }));
      env.scale.y = 1.2;
      env.position.y = 6;
      const stripes = new Mesh(new SphereGeometry(2.42, 24, 18, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.15), new MeshStandardMaterial({ color: '#c94a4a', roughness: 0.6 }));
      stripes.scale.y = 1.2;
      stripes.position.y = 6;
      const basket = new Mesh(new CylinderGeometry(0.75, 0.6, 0.8, 14), new MeshStandardMaterial({ color: '#9a7046', roughness: 0.9 }));
      basket.position.y = 0.4;
      bal.add(env, stripes, basket);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const line = new Mesh(new CylinderGeometry(0.015, 0.015, 3.6, 4), m.dark);
        line.position.set(Math.cos(a) * 0.9, 2.6, Math.sin(a) * 0.9);
        line.rotation.z = Math.cos(a) * 0.2;
        line.rotation.x = -Math.sin(a) * 0.2;
        bal.add(line);
      }
      bal.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
      bal.position.copy(home);
      add(bal);
      const prop: Prop = {
        kind: 'balloon', grab: home.clone(), seat: new Vector3(), vel: new Vector3(), t: 0, angle: 0, omega: 0,
        update(dt, attached) {
          if (attached) this.t = Math.min(40, this.t + dt);
          else if (this.t > 0) this.t = Math.max(0, this.t - dt * 4);
          const k = this.t;
          const prev = this.seat.clone();
          bal.position.set(home.x - k * 0.55, home.y + k * 1.1 + Math.sin(k * 0.5) * 0.3, home.z - k * 0.35);
          this.seat.copy(bal.position).add(new Vector3(0, 0.5, 0));
          this.vel.copy(this.seat).sub(prev).divideScalar(Math.max(dt, 1e-3));
          this.grab.copy(bal.position);
        },
        reset() {},
      };
      this.props.push(prop);
    }

    // Bell tower: carried up in a spiral of light; at the top the bell rings.
    {
      const base = new Vector3(5.0, Y, -5.4);
      const H = 20;
      const tower = new Group();
      tower.position.copy(base);
      const shaft = new Mesh(new CylinderGeometry(1.1, 1.5, H, 14), m.stone);
      shaft.position.y = H / 2;
      const deck = new Mesh(new CylinderGeometry(1.9, 1.9, 0.3, 20), m.stone);
      deck.position.y = H + 0.15;
      const bell = new Mesh(new SphereGeometry(0.7, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), m.gold);
      bell.position.y = H + 2.9;
      bell.name = 'bell';
      const roof = new Mesh(new ConeGeometry(1.6, 1.4, 14), m.gold);
      roof.position.y = H + 4.1;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const p = new Mesh(new CylinderGeometry(0.08, 0.08, 3.2, 6), m.stone);
        p.position.set(Math.cos(a) * 1.5, H + 1.8, Math.sin(a) * 1.5);
        tower.add(p);
      }
      tower.add(shaft, deck, bell, roof);
      tower.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
      add(tower);
      const top: Platform = { x: base.x, z: base.z, y: Y + H + 0.3, r: 1.8, ledge: true };
      this.w.platforms.push(top);
      const audio = ctx.audio;
      const prop: Prop = {
        kind: 'tower', grab: base.clone().add(new Vector3(0, 0, 1.6)), seat: new Vector3(), vel: new Vector3(), t: -1, angle: 0, omega: 0,
        update(dt, attached) {
          bell.rotation.z = Math.sin(this.angle) * 0.4 * Math.exp(-this.omega);
          this.angle += dt * 5;
          this.omega += dt * 0.6;
          if (!attached) return;
          this.t = Math.min(1, this.t + dt / 3.2);
          const k = this.t * this.t * (3 - 2 * this.t);
          const a = k * Math.PI * 3;
          this.seat.set(base.x + Math.sin(a) * 2.1, Y + k * (H + 0.3), base.z + Math.cos(a) * 2.1);
          if (this.t >= 1) this.seat.set(base.x, Y + H + 0.3, base.z);
        },
        reset() {
          this.t = 0;
          this.omega = 0;
          this.angle = 0;
          [0, 0.4, 0.8].forEach((w, i) => audio.bell([523.25, 659.25, 783.99][i]!, { when: 3.2 + w, level: 0.3 }));
        },
      };
      this.props.push(prop);
    }

    // The finish door: a doorway of light on the ledge.
    const door = add(new Mesh(new TorusGeometry(0.9, 0.06, 8, 40, Math.PI), light));
    door.position.copy(this.door).add(new Vector3(0, 1.4, 0));
    door.scale.set(1, 1.5, 1);
    door.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) {
      const jamb = add(new Mesh(new CylinderGeometry(0.06, 0.06, 1.4, 8), light));
      jamb.position.copy(this.door).add(new Vector3(0, 0.7, s * 0.9));
    }
  }

  private updateHud(): void {
    this.hud.textContent = this.ctx.t('underneath.hud.play', { n: this.sys.letGo, c: this.sys.caught });
    this.w.lets = this.sys.letGo;
    this.w.catches = this.sys.caught;
  }

  private finish(): void {
    if (this.finishing) return;
    this.finishing = true;
    this.complete();
  }

  private letGo(vel: Vector3, jump = false): void {
    const m = this.w.visitor.motion;
    m.teleport(this.w.visitor.group.position.x, this.w.visitor.group.position.y, this.w.visitor.group.position.z);
    m.vel.copy(vel);
    if (jump) m.vel.y += 5;
    m.grounded = false;
    this.attached = null;
    if (!this.released) {
      this.released = true;
      this.sys.release();
      this.updateHud();
    }
    this.ctx.audio.pluck(392, { level: 0.15 });
  }

  update(dt: number): void {
    const { ctx } = this;
    const { input, ui, audio, t } = ctx;
    const w = this.w;
    const v = w.visitor;
    this.runEvents();
    for (const r of this.ropes) {
      r.rope.step(Math.min(dt, 1 / 30));
      r.tube.update();
    }
    const pump = input.filtered.moveY !== 0 || input.filtered.moveX !== 0 ? 1 : 0;
    for (const p of this.props) p.update(dt, p === this.attached, pump);

    if (this.plan) this.updateCatch(dt);
    else if (this.attached) {
      const p = this.attached;
      v.group.position.copy(p.seat).add(new Vector3(0, p.kind === 'swing' ? -0.45 : p.kind === 'rope' || p.kind === 'kite' ? -1.5 : 0, 0));
      v.motion.pos.copy(v.group.position);
      if (p.kind === 'tower' && p.t >= 1) {
        // At the top: standing on the deck again.
        const top = w.platforms[w.platforms.length - 1]!;
        this.attached = null;
        v.motion.teleport(p.seat.x, top.y, p.seat.z + 0.8, top);
      } else if (input.pressed('secondary') || input.pressed('primary')) {
        this.letGo(p.vel, input.pressed('primary'));
      }
    } else {
      this.walk(dt);
      const m = v.motion;
      if (m.grounded) {
        if (this.released) {
          // Landed somewhere solid after letting go: that is a catch too (a bounce onto a cloud).
          this.released = false;
          this.sys.plan(m.pos.y);
          this.laugh();
          this.updateHud();
        }
        // Grab a prop?
        const near = this.props.find((p) => p.grab.distanceTo(m.pos.clone().add(new Vector3(0, 0.8, 0))) < (p.kind === 'rope' ? 2.6 : 1.9));
        if (near && !this.hinted.has(near.kind)) {
          this.hinted.add(near.kind);
          ui.whisper.show(t('underneath.letGoHint'), { duration: 3.5 });
        }
        if (near && input.pressed('secondary')) {
          this.attached = near;
          near.reset();
          audio.ui.click();
        }
        // Into the door.
        if (Math.hypot(m.pos.x - this.door.x, m.pos.z - this.door.z) < 0.7) this.finish();
      } else {
        // Airborne: walking off any edge counts as letting go.
        if (!this.released && m.pos.y < Y - 2.5) {
          this.released = true;
          this.sys.release();
          this.updateHud();
        }
        const plan = this.sys.check(m.pos.y, m.vel.y, m.airTime);
        if (plan) this.startCatch(plan);
      }
    }

    // The catcher follows a falling visitor below the clouds and rises to meet them.
    const cu = this.catcher.uniforms;
    const vp = v.group.position;
    const falling = this.released && !this.plan;
    const gx = falling || this.plan ? vp.x : 0;
    const gz = falling || this.plan ? vp.z - 14 * this.catcher.cradle.z : 0;
    const cg = this.catcher.group.position;
    cg.x = damp(cg.x, gx, 4, dt);
    cg.z = damp(cg.z, gz, 4, dt);
    const meet = this.plan ? this.catchY - 0.7 - 14 * this.catcher.cradle.y : falling ? Math.max(this.sys.meetY - 6, Math.min(vp.y - 10, this.sys.meetY - 1)) : Y - 40;
    cg.y = damp(cg.y, meet, this.plan || falling ? 3 : 1.2, dt);
    cu.uLevel.value = damp(cu.uLevel.value, falling || this.plan ? 1.6 : 0, 2.5, dt);
    cu.uClose.value = damp(cu.uClose.value, this.plan && this.catchT > 0.3 ? 1 : 0, 3, dt);
    cu.uRise.value = cu.uClose.value;
    this.catcher.update(dt, ctx.engine.renderer.getPixelRatio());
    this.slideMat.uniforms.uA!.value = damp(this.slideMat.uniforms.uA!.value, this.plan?.kind === 'slide' ? 1 : 0, 3, dt);
  }

  private laugh(): void {
    const audio = this.ctx.audio;
    const start = this.melody++ % 3;
    for (let i = 0; i < 5; i++) audio.bell(PENTA[(start + i) % PENTA.length]!, { when: i * 0.08, level: 0.14 });
    audio.pluck(PENTA[start]! / 2, { level: 0.2, when: 0.1 });
  }

  private startCatch(plan: CatchPlan): void {
    const v = this.w.visitor;
    this.plan = plan;
    this.catchT = 0;
    this.catchY = plan.y;
    this.released = false;
    this.updateHud();
    this.laugh();
    this.ctx.audio.chord([261.63, 329.63, 392], { duration: 2.5, level: 0.12, timbre: 'glass' });
    const from = v.group.position.clone();
    from.y = plan.y;
    const land = plan.kind === 'bounce' ? this.nearestCloud(from) : this.home;
    const end = new Vector3(land.x + (land === this.home ? 1.5 : 0), land.y, land.z + (land === this.home ? 2 : 0));
    const mid = from.clone().lerp(end, 0.5);
    let pts: Vector3[];
    if (plan.kind === 'toss') pts = [from, from.clone().add(new Vector3(0, 12, 0)), mid.clone().add(new Vector3(0, 8, 0)), end];
    else if (plan.kind === 'slide') {
      pts = [from, from.clone().lerp(end, 0.3).add(new Vector3(0, -3, 0)), mid.clone().add(new Vector3(0, -1, 0)), end.clone().add(new Vector3(0, 0.3, 0))];
      const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 60, 0.35, 6, false), this.slideMat);
      tube.frustumCulled = false;
      this.slideTube?.geometry.dispose();
      this.slideTube?.removeFromParent();
      this.slideTube = tube;
      this.root.add(tube);
    } else if (plan.kind === 'bounce') pts = [from, mid.clone().add(new Vector3(0, 9, 0)), end.clone().add(new Vector3(0, 3, 0)), end];
    else pts = [from, from.clone().add(new Vector3(0, 1, 0)), mid.clone().add(new Vector3(0, 5, 0)), end];
    this.curve = new CatchmullPath(pts);
  }

  private nearestCloud(p: Vector3): Platform {
    return this.clouds.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
  }

  private updateCatch(dt: number): void {
    const plan = this.plan!;
    const v = this.w.visitor;
    this.catchT += dt;
    const hold = plan.kind === 'cradle' ? 1.1 : 0.45;
    const travel = plan.duration - hold;
    if (this.catchT < hold) {
      // Held: the fall melts into the cradle.
      v.group.position.y = damp(v.group.position.y, this.catchY, 6, dt);
      v.fallPose = damp(v.fallPose, 0.6, 4, dt);
    } else {
      const k = Math.min(1, (this.catchT - hold) / travel);
      const e = k * k * (3 - 2 * k);
      this.curve!.at(e, v.group.position);
      v.fallPose = damp(v.fallPose, 0, 3, dt);
      const spins = plan.kind === 'spin' ? 2 : plan.kind === 'toss' ? 1 : 0;
      v.heading = Math.PI + e * spins * Math.PI * 2;
      if (k >= 1) {
        this.plan = null;
        const land = plan.kind === 'bounce' ? this.nearestCloud(v.group.position) : this.home;
        v.motion.teleport(v.group.position.x, land.y, v.group.position.z, land);
        v.group.position.copy(v.motion.pos);
        v.fallPose = 0;
        if (plan.kind === 'bounce') this.ctx.audio.pluck(659.25, { level: 0.2 });
      }
    }
    v.motion.pos.copy(v.group.position);
  }

  override exit(): void {
    for (const r of this.ropes) {
      r.tube.dispose();
      r.rope.dispose();
    }
    this.ropes = [];
    this.props = [];
    this.slideTube?.geometry.dispose();
    this.slideTube = null;
    this.attached = null;
    this.plan = null;
    this.finishing = false;
    this.sys = new CatchSystem(Y - 9, Y - 32);
  }
}

/** A tiny CatmullRom wrapper so the path is read with `at(t, out)`. */
class CatchmullPath {
  private readonly c: CatmullRomCurve3;
  constructor(points: Vector3[]) {
    this.c = new CatmullRomCurve3(points);
  }
  at(t: number, out: Vector3): Vector3 {
    return this.c.getPointAt(Math.min(1, Math.max(0, t)), out);
  }
}

export { smoothstep };
