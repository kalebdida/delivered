// Temporary M1 chapter: the cell as a film still (replaced by the real chapters in M2).
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

export class Still extends GChapter {
  readonly id = 'still';
  override keyMomentAt = 4;
  enter(ctx: GainCtx): void {
    this.begin(ctx);
    ctx.world.cut('still');
  }
  update(): void {}
}
