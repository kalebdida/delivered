// CH0 threshold · CH1 θέλω · CH2 οὐ … ποιῶ · CH3 νόμος
import { Color, Vector3 } from 'three';
import { clamp, damp, smoothstep, type DroneHandle } from '@delivered/core';
import { partial } from '../scripture';
import { PATH } from '../world/layout';
import type { WretchedCtx } from '../world/world';
import { WChapter, follow } from './base';

const ASH_DUST = new Color('#9A968F').multiplyScalar(0.5);

// -------------------------------------------------------------------------------------------------
// CH0 · THRESHOLD: Romans 7:24 line by line in the dark, then the figure fades in.
// -------------------------------------------------------------------------------------------------
export class Threshold extends WChapter {
  readonly id = 'threshold';
  override keyMomentAt = 10.5;
  override transitionIn = 'fade' as const;

  async enter(ctx: WretchedCtx): Promise<void> {
    await this.begin(ctx, { z: PATH.start, chained: false, weight: 0 });
    void this.w.loadPhysics();
    this.w.movable = false;
    ctx.postfx.fadeTo('black', 1, 0);
    follow(ctx, 'low', true);
    const ref = 'Romans 7:24';
    this.at(0.8, () => void ctx.ui.scripture.show({ ref, text: partial(ref, 0), align: 'center', hideRef: true, duration: 4.2 }));
    this.at(5.6, () =>
      void ctx.ui.scripture.show({ ref, text: partial(ref, 1), align: 'center', duration: 5.4, original: { text: 'τίς με ῥύσεται', lang: 'grc' } }),
    );
    this.at(8.5, () => ctx.postfx.fadeTo('black', 0, 4));
    this.own(() => ctx.postfx.fadeTo('black', 0, 0));
  }

  update(): void {
    this.runEvents();
    if (this.time > 14.5) this.complete();
  }
}

// -------------------------------------------------------------------------------------------------
// CH1 · θέλω · I WANT: the controls work. Then the chain snaps tight out of the dust.
// -------------------------------------------------------------------------------------------------
export class Want extends WChapter {
  readonly id = 'want';
  override keyMomentAt = 7;
  private snapped = false;
  private snapAt = 20;
  private hope: DroneHandle | null = null;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.snapped = false;
    await this.begin(ctx, { z: PATH.start, chained: false, weight: 0 });
    await this.w.loadPhysics();
    this.w.double.lieAt(0.4, 2);
    this.card({ word: 'θέλω', lang: 'grc', translit: 'thelō', english: 'I want', ref: 'Romans 7:19', number: 1 });
    this.at(4.8, () => ctx.ui.whisper.show(ctx.t('wretched.whisper.walk'), { duration: 5 }));
    this.hope = this.own(ctx.audio.drone(110, 'warm', { level: 0 }));
    this.hope.setLevel(0.14, 4);
    this.hope.setFreq(146.8, 20);
  }

  private snap(): void {
    const { ctx, w } = this;
    this.snapped = true;
    this.snapAt = this.time;
    const p = w.figure.position;
    w.attach(p.x, p.z);
    w.weight = 0.2;
    w.double.reveal = 0.3;
    ctx.audio.chainSnap({ level: 0.9 });
    ctx.audio.chainRattle(0.8);
    ctx.audio.impact(0.5);
    this.hope?.setFreq(98, 2);
    this.hope?.setLevel(0.08, 2);
    ctx.rig.addTrauma(0.45);
    ctx.postfx.glitchBurst(0.25, 0.2);
    for (let i = 0; i < 14; i++) w.sparks.emit(w.chain.linkPosition(i, new Vector3()), 6, ASH_DUST, { speed: 1.4, up: 0.8, life: 1.6, spread: 0.2 });
    follow(ctx, 'back');
    this.at(this.time + 3.8, () => follow(ctx, 'close'));
  }

  update(): void {
    this.runEvents();
    const z = this.w.figure.position.z;
    // The snap comes after about 20 s of walking, or when the visitor is close to the end of the stretch.
    if (!this.snapped && (this.time > 20 || z < PATH.want + 4) && this.time > 6) this.snap();
    if (this.snapped && this.time > this.snapAt + 6 && z < PATH.want) this.complete();
    if (this.snapped && this.time > this.snapAt + 70) this.complete();
  }
}

// -------------------------------------------------------------------------------------------------
// CH2 · οὐ … ποιῶ · BUT I DON'T: the controls betray.
// -------------------------------------------------------------------------------------------------
export class Dont extends WChapter {
  readonly id = 'dont';
  override keyMomentAt = 9;
  private verseShown = false;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.verseShown = false;
    await this.begin(ctx, { z: PATH.want, chained: true, weight: 0.3, reveal: 0.32 });
    this.card({ word: 'οὐ … ποιῶ', lang: 'grc', translit: 'ou … poiō', english: 'but I don’t do', ref: 'Romans 7:19', number: 2 });
    ctx.input.addFilter(this.w.corruption());
    this.w.heart = this.own(ctx.audio.heartbeat(68, { level: 0.35 }));
    this.own(() => (this.w.heart = null));
    // For the screenshot: a betrayal at the key moment.
    if (new URLSearchParams(location.search).has('shot')) this.at(8.2, () => this.fakeBetrayal());
  }

  private fakeBetrayal(): void {
    const { ctx, w } = this;
    ctx.postfx.glitchBurst(0.7, 0.6);
    w.double.flare(1);
    ctx.ui.hud.set('bottom-center', ctx.t('wretched.hud.betray', { pressed: '↑', went: '↓' }));
  }

  update(dt: number): void {
    this.runEvents();
    const w = this.w;
    const z = w.figure.position.z;
    const progress = clamp((PATH.want - z) / (PATH.want - PATH.dont));
    const near = w.nearAttractor < 6 ? 1 - w.nearAttractor / 6 : 0;
    w.weight = damp(w.weight, 0.3 + 0.22 * progress + near * 0.15, 1.5, dt);
    w.double.posture = damp(w.double.posture, near > 0.15 ? 1 : 0, 1.2, dt);
    w.double.reveal = damp(w.double.reveal, 0.32 + near * 0.3, 2, dt);
    w.heart?.setBpm(68 + w.weight * 40);
    if (!this.verseShown && progress > 0.45) {
      this.verseShown = true;
      void this.ctx.ui.scripture.show({ ref: 'Romans 7:19', position: 'upper', duration: 8 });
    }
    if (z < PATH.dont || this.time > 150) this.complete();
  }
}

// -------------------------------------------------------------------------------------------------
// CH3 · νόμος · THE LAW: holy, cold light that exposes the double.
// -------------------------------------------------------------------------------------------------
export class Law extends WChapter {
  readonly id = 'law';
  override keyMomentAt = 8;
  override transitionIn = 'light' as const;
  private verseShown = false;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.verseShown = false;
    const shot = new URLSearchParams(location.search).has('shot');
    // Shots: start in the first pool of light so the exposure is visible.
    await this.begin(ctx, { z: shot ? -101 : PATH.dont, chained: true, weight: 0.5, reveal: 0.35, monoliths: shot ? 0.9 : 0 });
    this.card({ word: 'νόμος', lang: 'grc', translit: 'nomos', english: 'law', ref: 'Romans 7:12', number: 3 });
    ctx.input.addFilter(this.w.corruption(() => -0.1));
    this.w.heart = this.own(ctx.audio.heartbeat(80, { level: 0.3 }));
    this.own(() => (this.w.heart = null));
    this.at(1.2, () => {
      ctx.audio.crumble(0.6);
      ctx.rig.addTrauma(0.25);
      ctx.audio.bell(1318.5, { level: 0.25 });
      ctx.audio.bell(1975.5, { level: 0.18, when: 0.6 });
    });
  }

  update(dt: number): void {
    this.runEvents();
    const w = this.w;
    w.monoliths.rise = Math.min(1, w.monoliths.rise + dt * smoothstep(1, 2, this.time) * 0.22);
    const e = w.exposure;
    w.double.reveal = damp(w.double.reveal, 0.3 + e * 0.7, 3, dt);
    w.weight = Math.min(0.78, w.weight + dt * (0.004 + e * 0.02));
    w.double.posture = damp(w.double.posture, e > 0.4 ? 1 : 0.4, 1, dt);
    w.heart?.setBpm(76 + w.weight * 40);
    if (e > 0.5 && !this.verseShown) {
      this.verseShown = true;
      void this.ctx.ui.scripture.show({ ref: 'Romans 7:12', position: 'upper', duration: 8 });
    }
    if (w.figure.position.z < PATH.law || this.time > 160) this.complete();
  }
}
