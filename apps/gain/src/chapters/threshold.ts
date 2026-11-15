// CH0 · THRESHOLD. Black. Water dripping, a chain shifting. "For to me to live is ____" with a
// blinking blank. Then the cell begins to show.
import { getUIRoot, h, partial } from '@delivered/core';
import { cellDrone, drip } from '../audio';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

export class Threshold extends GChapter {
  readonly id = 'threshold';
  override keyMomentAt = 4.5;
  override transitionIn = 'fade' as const;
  private el: HTMLElement | null = null;
  private nextDrip = 0.6;

  enter(ctx: GainCtx): void {
    this.begin(ctx);
    const w = ctx.world;
    w.inCell = true;
    w.chainToWall();
    w.cut('still');
    w.lamp.level = w.lamp.target = 0;
    w.beam.intensity = 0.25;
    ctx.postfx.fadeTo('black', 1, 0);
    ctx.input.enabled = false;
    this.own(cellDrone(ctx.audio));

    this.at(1.2, () => {
      const line = h('p', { class: 'dl-verse gn-threshold__line' }, `${partial('Philippians 1:21', 0)} `, h('span', { class: 'gn-blank', 'aria-label': 'blank' }, '____'));
      this.el = h('div', { class: 'gn-threshold dl-scrim', 'aria-live': 'polite' }, line);
      getUIRoot().appendChild(this.el);
      requestAnimationFrame(() => this.el?.classList.add('is-in'));
    });
    this.at(2.6, () => {
      ctx.audio.chainRattle(0.25);
      for (const c of w.chains) c.impulse(0.01, 0.006, 0.004);
    });
    // The cell starts to show behind the words: first the moon, then the lamp.
    this.at(5.0, () => {
      ctx.postfx.fadeTo('black', 0.55, 3);
      w.lamp.target = 0.6;
    });
    this.at(8.5, () => this.el?.classList.remove('is-in'));
    this.at(9.6, () => this.complete());
    this.own(() => {
      this.el?.remove();
      this.el = null;
    });
  }

  update(dt: number): void {
    this.runEvents();
    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      drip(this.ctx.audio, 0.18 + Math.random() * 0.12);
      this.nextDrip = 1.4 + Math.random() * 2.2;
    }
    const w = this.ctx.world;
    w.beam.intensity = Math.min(1, w.beam.intensity + dt * 0.04);
  }
}
