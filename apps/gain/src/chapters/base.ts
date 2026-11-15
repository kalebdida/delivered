// Shared helpers for GAIN's chapters.
import { Chapter, type ChapterCardOptions } from '@delivered/core';
import type { GainCtx } from '../world/world';

export abstract class GChapter extends Chapter<GainCtx> {
  private events: { at: number; fn: () => void; done: boolean }[] = [];

  protected get w() {
    return this.ctx.world;
  }

  /** Run `fn` once, `seconds` after the chapter started. */
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

  /** Common entry: clear the HUD and filters, own the overlay cleanup. */
  protected begin(ctx: GainCtx): void {
    this.events = [];
    ctx.ui.hud.clear();
    ctx.input.clearFilters();
    ctx.input.enabled = true;
    ctx.input.setVirtualButtons([]);
    ctx.ui.cursor.setLabel(null);
    this.own(() => {
      ctx.ui.hud.clear();
      ctx.ui.whisper.hide();
      ctx.ui.scripture.hide();
      ctx.ui.cursor.setLabel(null);
    });
  }

  protected card(opts: ChapterCardOptions): void {
    void this.ctx.ui.card.show({ duration: 4.5, ...opts });
  }
}
