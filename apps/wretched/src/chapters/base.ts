// Shared helpers for WRETCHED's chapters.
import { Vector3 } from 'three';
import { Chapter, getUIRoot, h, type ChapterCardOptions } from '@delivered/core';
import type { StageOptions, WretchedCtx } from '../world/world';

export abstract class WChapter extends Chapter<WretchedCtx> {
  /** Timed events, fired once when `this.time` passes them. */
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

  protected async begin(ctx: WretchedCtx, stage: StageOptions & { monoliths?: number }): Promise<void> {
    this.events = [];
    const w = ctx.world;
    w.monoliths.rise = stage.monoliths ?? (stage.z <= -100 ? 1 : 0);
    w.monoliths.warmth = 0;
    w.terrainU.uWave.value = -1;
    w.autoGrade = true;
    w.beacon.level = 1;
    w.figure.group.visible = true;
    ctx.input.clearFilters();
    ctx.ui.hud.clear();
    await w.stage(stage);
    follow(ctx, 'close', true);
    this.own(() => {
      ctx.input.clearFilters();
      ctx.ui.hud.clear();
      ctx.ui.whisper.hide();
    });
  }

  protected card(opts: ChapterCardOptions): void {
    void this.ctx.ui.card.show({ duration: 4.5, ...opts });
  }
}

const portrait = () => window.innerWidth / Math.max(1, window.innerHeight) < 0.8;

export const VIEWS = {
  close: () => ({
    offset: portrait() ? new Vector3(1.2, 4.6, 9.6) : new Vector3(1.8, 3.6, 7.8),
    lookOffset: new Vector3(0, 1.2, -4.2),
  }),
  back: () => ({ offset: new Vector3(2.6, 1.5, -3.4), lookOffset: new Vector3(0, 0.4, 3.2) }),
  low: () => ({ offset: portrait() ? new Vector3(0.4, 1.4, 4.6) : new Vector3(1.1, 1.2, 3.6), lookOffset: new Vector3(0, 1.1, -1.5) }),
  sky: (v: number) => ({
    offset: new Vector3(0.6 - v * 0.3, 1.2 - v * 0.7, 3.6 - v * 0.8),
    lookOffset: new Vector3(0, 1.2 + v * 10, -2 - v * 10),
  }),
};

export function follow(ctx: WretchedCtx, view: 'close' | 'back' | 'low', snap = false): void {
  ctx.rig.follow(ctx.world.figure.group, { ...VIEWS[view](), spring: view === 'close' ? 'smooth' : 'heavy' }, snap);
}

/** A large centred line that reveals word by word (CH5) or all at once. */
export class WordLine {
  readonly el: HTMLElement;
  private words: HTMLElement[] = [];

  constructor(text: string, opts: { huge?: boolean; lang?: string } = {}) {
    this.el = h('div', { class: `wr-line dl-scrim${opts.huge ? ' wr-line--huge' : ''}`, 'aria-live': 'polite', lang: opts.lang ?? 'en' });
    const p = h('p', { class: 'dl-verse' });
    for (const word of text.split(' ')) {
      const s = h('span', { class: 'wr-word' }, word);
      this.words.push(s);
      p.append(s, ' ');
    }
    this.el.append(p);
    getUIRoot().appendChild(this.el);
  }

  /** Reveal the first `fraction` of the words. */
  reveal(fraction: number): void {
    const n = Math.round(fraction * this.words.length);
    this.words.forEach((w, i) => w.classList.toggle('is-in', i < n));
  }

  ref(text: string): void {
    this.el.append(h('div', { class: 'dl-ref wr-ref' }, text));
    requestAnimationFrame(() => this.el.classList.add('has-ref'));
  }

  remove(): void {
    this.el.classList.add('is-out');
    setTimeout(() => this.el.remove(), 900);
  }
}
