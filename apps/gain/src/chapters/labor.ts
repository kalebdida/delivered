// CH5 · ἐπιμένειν · FRUITFUL LABOR (Philippians 1:22, 1:25).
//
// Through the door: the Philippian church's courtyard in the morning. People sit in groups, a few
// lit, many dim. Walk to someone and sit with them: they light up warmly, the courtyard warms and
// the garden at its centre grows. Lighting everyone is optional; "go on" is there when you want it.
import { Vector3 } from 'three';
import { announce, button, damp, haptic, h, getUIRoot } from '@delivered/core';
import { Courtyard } from '../world/philippi';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

export class Labor extends GChapter {
  readonly id = 'labor';
  override keyMomentAt = 14;
  override transitionIn = 'light' as const;

  private yard!: Courtyard;
  private near = -1;
  private sitting = -1;
  private sitT = 0;
  private goOn: HTMLElement | null = null;
  private birdsT = 1;
  private shown = false;
  private leaving = false;

  enter(ctx: GainCtx): void {
    this.begin(ctx, { walk: true });
    const w = ctx.world;
    const b = ctx.quality.budget;
    this.near = this.sitting = -1;
    this.shown = this.leaving = false;
    w.inCell = false;
    w.air('morning');
    w.figure.group.visible = true;
    w.figure.glow = 0.12;
    this.yard = new Courtyard({ maxInstances: b.maxInstances, shadows: b.shadows, shadowMapSize: b.shadowMapSize });
    this.root.add(this.yard.group);
    ctx.engine.exposure = 1.1;
    ctx.postfx.fadeTo('white', 0, 2.2);
    w.figure.group.position.set(0, 0, 6.5);
    w.figure.heading = Math.PI;
    w.figure.sit = w.figure.kneel = 0;
    w.figure.settle();
    ctx.rig.follow(w.figure.group, { offset: new Vector3(0, 3.3, 4.6), lookOffset: new Vector3(0, 0.9, -2.4), spring: 'gentle' }, true);
    ctx.rig.setFov(ctx.engine.camera.aspect < 0.9 ? 72 : 50);
    ctx.input.setVirtualButtons([{ id: 'secondary', label: ctx.t('gain.labor.sitTouch'), size: 'large', icon: 'dot' }]);
    this.own(ctx.audio.crowd({ level: 0.1, voices: 6 }));
    this.own(ctx.audio.wind(0.08));
    this.card({ word: 'ἐπιμένειν', lang: 'grc', translit: 'epimenein', english: 'to remain', ref: 'Philippians 1:24', number: 5 });
    this.at(5, () => ctx.ui.hud.set('bottom-center', ctx.t('gain.labor.hint')));
    this.at(40, () => this.offerGoOn());
    this.own(() => {
      this.goOn?.remove();
      this.goOn = null;
    });
  }

  private offerGoOn(): void {
    if (this.goOn || this.leaving) return;
    const { ctx } = this;
    const btn = button({ label: ctx.t('gain.labor.on'), variant: 'pill', icon: 'arrow', onClick: () => this.leave() });
    this.goOn = h('div', { class: 'gn-goon' }, btn);
    getUIRoot().appendChild(this.goOn);
    requestAnimationFrame(() => this.goOn?.classList.add('is-in'));
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.goOn?.remove();
    this.goOn = null;
    this.ctx.ui.hud.clear();
    this.at(this.time + 0.4, () => this.complete());
  }

  /** Birdsong in the morning: two or three quick high notes. */
  private bird(): void {
    const a = this.ctx.audio;
    const base = 2400 + Math.random() * 1200;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) a.pluck(base * (1 + i * 0.12), { when: i * 0.09, level: 0.03, duration: 0.12 });
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx } = this;
    const fig = ctx.world.figure;
    this.yard.update(dt);
    this.birdsT -= dt;
    if (this.birdsT <= 0) {
      this.bird();
      this.birdsT = 2 + Math.random() * 5;
    }
    const pos = fig.group.position;
    if (this.sitting >= 0) {
      // Sitting with someone: settle beside them; moving gets you up again.
      this.sitT += dt;
      const seat = this.yard.seats[this.sitting]!;
      pos.lerp(seat, 1 - Math.exp(-dt * 3));
      const person = this.yard.people[this.sitting]!.group.position;
      fig.heading = damp(fig.heading, Math.atan2(person.x - pos.x, person.z - pos.z), 4, dt);
      fig.easePose(0, 1, dt, 2.5);
      fig.speed = 0;
      if (this.sitT > 1.2 && this.flag(`lit-${this.sitting}`)) {
        const p = this.yard.people[this.sitting]!;
        p.target = 1;
        ctx.audio.chord([293.7 * (1 + (this.sitting % 5) * 0.125), 440, 587.3], { level: 0.12, duration: 3, timbre: 'warm' });
        haptic(10);
        announce(ctx.t('gain.labor.hint'));
        if (this.yard.litCount >= 3 && !this.shown) {
          this.shown = true;
          void ctx.ui.scripture.show({ ref: 'Philippians 1:25', position: 'upper', duration: 9 });
        }
        if (this.yard.litCount >= 4) this.offerGoOn();
        if (this.yard.litCount >= this.yard.people.length) this.at(this.time + 6, () => this.leave());
      }
      const { moveX, moveY } = ctx.input.filtered;
      if (this.sitT > 1.6 && Math.hypot(moveX, moveY) > 0.3) this.sitting = -1;
      ctx.ui.hud.clear('bottom-center');
      return;
    }
    fig.easePose(0, 0, dt, 3);
    // Walk, relative to the camera.
    const { moveX, moveY } = ctx.input.filtered;
    const cam = ctx.engine.camera;
    const f = cam.getWorldDirection(new Vector3()).setY(0).normalize();
    const r = new Vector3().crossVectors(f, new Vector3(0, 1, 0));
    const v = f.multiplyScalar(moveY).add(r.multiplyScalar(moveX));
    if (v.lengthSq() > 1) v.normalize();
    pos.addScaledVector(v, 1.6 * dt);
    const d = Math.hypot(pos.x, pos.z);
    if (d < 2.6) pos.multiplyScalar(2.6 / d);
    if (d > 9.6) pos.multiplyScalar(9.6 / d);
    for (const p of this.yard.people) {
      const q = p.group.position;
      const dd = Math.hypot(pos.x - q.x, pos.z - q.z);
      if (dd < 0.55) pos.set(q.x + ((pos.x - q.x) / dd) * 0.55, 0, q.z + ((pos.z - q.z) / dd) * 0.55);
    }
    fig.speed = damp(fig.speed, v.length() * 1.6, 8, dt);
    if (v.lengthSq() > 0.01) fig.heading = damp(fig.heading, Math.atan2(v.x, v.z), 6, dt);
    // Who is near?
    let best = -1;
    let bestD = 1.3;
    this.yard.seats.forEach((s, i) => {
      const dd = Math.hypot(pos.x - s.x, pos.z - s.z);
      if (dd < bestD && this.yard.people[i]!.target < 1) {
        best = i;
        bestD = dd;
      }
    });
    if (best !== this.near) {
      this.near = best;
      if (best >= 0) ctx.ui.hud.set('bottom-center', ctx.input.device === 'touch' ? ctx.t('gain.labor.sitTouch') : ctx.t('gain.labor.sit'));
      else ctx.ui.hud.set('bottom-center', ctx.t('gain.labor.hint'));
    }
    if (best >= 0 && (ctx.input.pressed('secondary') || ctx.input.pressed('primary') || ctx.input.pressed('confirm'))) {
      this.sitting = best;
      this.sitT = 0;
      ctx.audio.ui.confirm();
    }
  }

  private flags = new Set<string>();
  private flag(k: string): boolean {
    if (this.flags.has(k)) return false;
    this.flags.add(k);
    return true;
  }

  override exit(): void {
    const { ctx } = this;
    this.flags.clear();
    ctx.rig.follow(null);
    ctx.engine.exposure = 1.25;
    ctx.world.figure.kneel = 0;
    this.yard.dispose();
  }
}
