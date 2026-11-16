// CH2 · δεσμοί · CHAINS THAT PREACH (Philippians 1:12-14).
//
// The chains glow faintly gold. Drag or shake them: every rattle sends a wave of gold light out of
// the chains, through the stone and the door. Then the camera follows a wave out of the cell into
// the praetorium, where the guards light up one by one as each wave reaches them, then the city.
// The visitor's limitation is the source of the spread.
import { AdditiveBlending, BackSide, Mesh, Plane, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { announce, clamp, damp, easing, haptic } from '@delivered/core';
import { chainTone, drip } from '../audio';
import { CELL, SEAT } from '../world/layout';
import { Pointer } from '../world/pointer';
import { Rome } from '../world/rome';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

const SHELL_FRAG = /* glsl */ `
uniform float uFade; varying vec3 vN; varying vec3 vV;
void main(){
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.42) * rim * uFade * 1.8, 1.0);
}`;

export class Chains extends GChapter {
  readonly id = 'chains';
  override keyMomentAt = 26;
  override transitionIn = 'light' as const;

  private pointer!: Pointer;
  private phase: 'cell' | 'out' | 'guard' | 'city' | 'done' = 'cell';
  private rattles = 0;
  private cooldown = 0;
  private grab: { chain: number; point: number; plane: Plane } | null = null;
  private shells: { mesh: Mesh; mat: ShaderMaterial; t: number }[] = [];
  private rome: Rome | null = null;
  private outT = 0;
  private waves = 0;
  private lastCount = 0;
  private tone = 0;
  private nextDrip = 2;
  private autoT = 0;

  enter(ctx: GainCtx): void {
    this.begin(ctx);
    const w = ctx.world;
    this.phase = 'cell';
    this.rattles = this.waves = this.tone = this.lastCount = 0;
    this.outT = this.autoT = 0;
    w.inCell = true;
    w.figure.group.position.set(SEAT.x, 0, SEAT.z);
    w.chainToWall();
    w.figure.heading = 0;
    w.figure.sit = 1;
    w.figure.kneel = 0;
    w.figure.settle();
    w.lamp.target = 0.8;
    w.beam.intensity = 1.15;
    w.beam.warmth = 0.15;
    for (const c of w.chains) c.warmth = 1;
    w.cut('chains');
    ctx.input.setVirtualButtons([{ id: 'primary', label: ctx.t('gain.chains.hintKeys'), size: 'large', icon: 'hand' }]);
    this.pointer = this.own(new Pointer(ctx.engine.renderer.domElement));
    this.card({ word: 'δεσμοί', lang: 'grc', translit: 'desmoi', english: 'bonds, chains', ref: 'Philippians 1:13', number: 2 });
    this.at(4.5, () => ctx.ui.hud.set('bottom-center', ctx.input.device === 'touch' ? ctx.t('gain.chains.hint') : `${ctx.t('gain.chains.hint')} · ${ctx.t('gain.chains.hintKeys')}`));
    this.own(() => {
      for (const c of w.chains) c.warmth = 0.35;
      w.cell.stone.emissiveIntensity = 0;
    });
  }

  /** A rattle: a tone, a glow running down the chains, a shell of light through the stone. */
  private rattle(strength: number): void {
    if (this.cooldown > 0) return;
    const { ctx } = this;
    const w = ctx.world;
    this.cooldown = 0.75;
    this.rattles++;
    ctx.audio.chainRattle(0.3 + strength * 0.4);
    chainTone(ctx.audio, this.tone++, 0.18);
    haptic(12);
    if (this.phase === 'cell') {
      // Light runs from the wrists along every link to the wall.
      for (const c of w.chains) for (let i = 0; i < c.links; i++) c.glow[c.links - 1 - i] = Math.max(c.glow[c.links - 1 - i]!, 1.4 - i * 0.012);
      const mat = new ShaderMaterial({
        uniforms: { uFade: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
        fragmentShader: SHELL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
      });
      const mesh = new Mesh(new SphereGeometry(1, 32, 16), mat);
      mesh.position.copy(w.figure.wrist(0)).lerp(w.figure.wrist(1), 0.5);
      mesh.renderOrder = 7;
      this.root.add(mesh);
      this.shells.push({ mesh, mat, t: 0 });
      if (this.rattles >= 3) {
        this.phase = 'out';
        this.outT = 0;
      }
    } else if (this.rome) {
      this.waves++;
      const reach = this.phase === 'city' ? 60 + this.waves * 22 : 10 + this.waves * 4.6;
      this.rome.wave(reach);
    }
  }

  private goOutside(): void {
    const { ctx } = this;
    const w = ctx.world;
    w.inCell = false;
    w.air('night');
    this.rome = new Rome({ maxInstances: ctx.quality.budget.maxInstances });
    this.root.add(this.rome.group);
    this.phase = 'guard';
    this.waves = 0;
    // From just outside the cell window, rising over the courtyard.
    const o = this.rome.origin;
    w.release();
    ctx.rig.snapTo(new Vector3(o.x + 1.5, o.y + 0.6, o.z + 3), new Vector3(o.x, 1.5, o.z + 14));
    // Out of the window and down to a low three-quarter view: the ranks recede toward the cell
    // block, its gold window the focal point, the moonlit sky and the city above them.
    ctx.rig.playPath([new Vector3(o.x + 1.5, o.y + 0.6, o.z + 3), new Vector3(9, 6.5, -11), new Vector3(15.5, 4.6, 13)], { duration: 7, lookAt: new Vector3(0, 1.8, -10), fov: 48 });
    ctx.engine.exposure = 1.1;
    this.rome.wave(10);
    this.waves = 1;
    void ctx.ui.scripture.show({ ref: 'Philippians 1:13', position: 'upper', duration: 7 });
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx } = this;
    const w = ctx.world;
    const { input } = ctx;
    this.cooldown -= dt;
    const p = this.pointer;
    const cam = ctx.engine.camera;

    // Input: Space / action button / a tap shakes; dragging a chain shakes it for real.
    const shake = input.pressed('primary') || input.pressed('confirm');
    if (this.phase === 'cell' && this.time > 2) {
      if (p.justDown && !this.grab) {
        let best = 60;
        w.chains.forEach((c, ci) => {
          for (let i = 1; i < c.rope.count - 1; i++) {
            const s = c.pointAt(i / (c.rope.count - 1)).project(cam);
            const d = Math.hypot(((s.x - p.ndc.x) * ctx.engine.size.width) / 2, ((s.y - p.ndc.y) * ctx.engine.size.height) / 2);
            if (d < best) {
              best = d;
              this.grab = { chain: ci, point: i, plane: new Plane().setFromNormalAndCoplanarPoint(cam.getWorldDirection(new Vector3()).negate(), c.pointAt(i / (c.rope.count - 1))) };
            }
          }
        });
        if (!this.grab) this.rattle(0.6);
      }
      if (this.grab && p.down) {
        const c = w.chains[this.grab.chain as 0 | 1];
        const hit = p.raycaster(cam).ray.intersectPlane(this.grab.plane, new Vector3());
        if (hit) {
          const o = this.grab.point * 3;
          c.rope.positions[o] = hit.x;
          c.rope.positions[o + 1] = Math.max(0.05, hit.y);
          c.rope.positions[o + 2] = Math.max(CELL.z0 + 0.05, hit.z);
        }
        ctx.ui.cursor.setLabel(ctx.t('gain.cursor.drag'));
        if (c.energy > 1.6) this.rattle(Math.min(1, c.energy / 4));
      }
      if (!p.down) this.grab = null;
      // If the visitor waits, the chains stir on their own now and then (nobody gets stuck here).
      this.autoT += dt;
      if (shake || p.down) this.autoT = 0;
      if (shake || this.autoT > 9) {
        this.autoT = shake ? 0 : 6;
        for (const c of w.chains) c.impulse((Math.random() - 0.5) * 0.05, 0.035, (Math.random() - 0.3) * 0.04);
        this.rattle(shake ? 0.8 : 0.45);
      }
    } else if ((this.phase === 'guard' || this.phase === 'city') && this.time > 0) {
      if (shake || p.justDown) this.rattle(0.8);
      // If the visitor stops, the light keeps going on its own, gently.
      this.autoT += dt;
      if (this.autoT > 6) {
        this.autoT = 0;
        this.rattle(0.4);
      }
      if (shake || p.justDown) this.autoT = 0;
    }

    // Shells of light expanding through the stone; the stone warms as they pass.
    let wallGlow = 0;
    for (const s of this.shells) {
      s.t += dt;
      const r = easing.outCubic(clamp(s.t / 1.8)) * 7;
      s.mesh.scale.setScalar(Math.max(0.01, r));
      s.mat.uniforms.uFade!.value = 1 - clamp(s.t / 1.8);
      wallGlow = Math.max(wallGlow, Math.exp(-Math.pow((r - 2.6) / 1.2, 2)) * (1 - clamp(s.t / 1.8)));
    }
    for (const s of this.shells.filter((x) => x.t > 1.9)) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.shells = this.shells.filter((x) => x.t <= 1.9);
    w.cell.stone.emissive.set('#F5C76B');
    w.cell.stone.emissiveIntensity = damp(w.cell.stone.emissiveIntensity, wallGlow * 0.12, 10, dt);

    if (this.phase === 'cell') {
      this.nextDrip -= dt;
      if (this.nextDrip <= 0) {
        drip(ctx.audio, 0.12);
        this.nextDrip = 3 + Math.random() * 3;
      }
      w.figure.look.weight = 0;
    }
    if (this.phase === 'out') {
      // Follow the last wave out through the door: a gold flash, and we are outside.
      this.outT += dt;
      if (this.outT < 1.2) w.glide([new Vector3(1.9, 1.4, 0.6), new Vector3(2.6, 1.1, 0.55), 52], 1.6);
      if (this.once('flash', this.outT > 1.1)) ctx.postfx.fadeTo('white', 0.9, 0.5);
      if (this.once('outside', this.outT > 1.7)) {
        ctx.ui.hud.clear();
        this.goOutside();
        ctx.postfx.fadeTo('white', 0, 1.6);
      }
    }
    if (this.rome) {
      this.rome.update(
        dt,
        () => {},
        () => {},
      );
      const n = this.rome.litGuards;
      const total = this.rome.guards.length;
      if (n !== this.lastCount) {
        if (Math.floor(n / 24) !== Math.floor(this.lastCount / 24)) chainTone(ctx.audio, this.tone++, 0.1);
        this.lastCount = n;
        ctx.ui.hud.set('top-right', ctx.t('gain.chains.count', { n, total }));
      }
      if (this.phase === 'guard' && n >= total) {
        this.phase = 'city';
        this.waves = 0;
        announce(ctx.t('gain.chains.count', { n, total }));
        this.at(this.time + 1.2, () => {
          ctx.rig.playPath([ctx.rig.position.clone(), new Vector3(30, 34, 60), new Vector3(-20, 48, 95)], { duration: 8, lookAt: new Vector3(0, 0, -10), fov: 52 });
          void ctx.ui.scripture.show({ ref: 'Philippians 1:14', position: 'upper', duration: 8 });
        });
      }
      if (this.phase === 'city') {
        const lit = this.rome.houseLit.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
        if (lit > this.rome.houses.length * 0.9 && this.once('cityDone', true)) {
          this.phase = 'done';
          ctx.ui.hud.set('bottom-center', ctx.t('gain.chains.city'));
          this.at(this.time + 7, () => this.complete());
        }
      }
    }
    w.figure.look.target.copy(w.figure.wrist(0));
    this.pointer.endFrame();
  }

  private flags = new Set<string>();
  private once(key: string, cond: boolean): boolean {
    if (!cond || this.flags.has(key)) return false;
    this.flags.add(key);
    return true;
  }

  override exit(): void {
    const { ctx } = this;
    ctx.world.inCell = true;
    ctx.engine.exposure = 1.25;
    this.rome?.dispose();
    this.rome = null;
    for (const s of this.shells) {
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.shells = [];
    this.flags.clear();
  }
}
