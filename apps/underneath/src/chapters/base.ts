// Shared helpers for UNDERNEATH's chapters.
import { Chapter, getUIRoot, h, type ChapterCardOptions, type VirtualButton } from '@delivered/core';
import type { UnderCtx } from '../world/world';

export abstract class UChapter extends Chapter<UnderCtx> {
  private events: { at: number; fn: () => void; done: boolean }[] = [];

  protected get w() {
    return this.ctx.world;
  }

  protected at(seconds: number, fn: () => void): void {
    this.events.push({ at: seconds, fn, done: false });
  }

  protected runEvents(): void {
    for (const e of this.events) {
      if (!e.done && this.time >= e.at) {
        e.done = true;
        e.fn();
      }
    }
  }

  /** Common entry: clear the HUD, own the cleanup, set touch buttons. */
  protected begin(ctx: UnderCtx, buttons: VirtualButton[] = []): void {
    this.events = [];
    ctx.ui.hud.clear();
    ctx.input.clearFilters();
    ctx.input.enabled = true;
    ctx.rig.follow(null);
    ctx.world.lookLift = 0;
    ctx.world.lookSide = 0;
    ctx.input.setVirtualButtons(buttons);
    this.own(() => {
      ctx.ui.hud.clear();
      ctx.ui.whisper.hide();
      ctx.ui.scripture.hide();
    });
  }

  protected card(opts: ChapterCardOptions): void {
    void this.ctx.ui.card.show({ duration: 4.5, ...opts });
  }

  /** Walk on the current platforms with the ground camera. */
  protected walk(dt: number): void {
    const { input } = this.ctx;
    const w = this.w;
    const m = w.visitor.motion;
    const dir = input.enabled ? w.moveDir() : { dx: 0, dz: 0 };
    m.step(Math.min(dt, 1 / 20), { ...dir, jumpPressed: input.enabled && input.pressed('primary'), jumpHeld: input.filtered.primary }, w.platforms);
    w.visitor.group.position.copy(m.pos);
    const speed = Math.hypot(m.vel.x, m.vel.z);
    if (speed > 0.4 && !m.hanging) {
      const target = Math.atan2(m.vel.x, m.vel.z);
      let d = target - w.visitor.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      w.visitor.heading += d * Math.min(1, dt * 10);
    }
    w.visitor.air.set(0, 0, 0);
  }
}

/** A large centred line that reveals word by word. */
export class WordLine {
  readonly el: HTMLElement;
  private words: HTMLElement[] = [];

  constructor(text: string, opts: { huge?: boolean; lang?: string; hebrew?: boolean } = {}) {
    this.el = h('div', { class: `un-line dl-scrim${opts.huge ? ' un-line--huge' : ''}`, 'aria-live': 'polite', lang: opts.lang ?? 'en' });
    const p = h('p', { class: opts.hebrew ? 'dl-hebrew un-hebrew' : 'dl-verse', dir: opts.hebrew ? 'rtl' : 'ltr' });
    for (const word of text.split(' ')) {
      const s = h('span', { class: 'un-word' }, word);
      this.words.push(s);
      p.append(s, ' ');
    }
    this.el.append(p);
    getUIRoot().appendChild(this.el);
  }

  reveal(fraction: number): void {
    const n = Math.round(fraction * this.words.length);
    this.words.forEach((w, i) => w.classList.toggle('is-in', i < n));
  }

  sub(text: string, cls = 'dl-ref'): void {
    this.el.append(h('div', { class: `${cls} un-sub` }, text));
    requestAnimationFrame(() => this.el.classList.add('has-sub'));
  }

  remove(): void {
    this.el.classList.add('is-out');
    setTimeout(() => this.el.remove(), 900);
  }
}
