import { clamp } from '../math/easing';

export interface HoldOptions {
  /** Seconds of holding to go from 0 to 1 (default 3). */
  fillTime?: number;
  /** Seconds to drain from 1 to 0 when released (default 1.5). 0 keeps the value. */
  drainTime?: number;
  /**
   * Fatigue: each second spent holding slows the fill by this fraction (0 = none).
   * With 0.15, holding gets visibly harder over time. Fatigue recovers while released.
   */
  fatigue?: number;
}

/**
 * Turns "is the button held" into a 0..1 value, with optional fatigue.
 *
 * ```ts
 * const cry = new HoldMeter({ fillTime: 6 });
 * const v = cry.update(dt, input.filtered.hold);   // 0..1
 * if (cry.complete) deliver();
 * ```
 */
export class HoldMeter {
  value = 0;
  /** 0..1, how tired the visitor is. */
  tiredness = 0;
  private readonly fill: number;
  private readonly drain: number;
  private readonly fatigue: number;

  constructor(opts: HoldOptions = {}) {
    this.fill = opts.fillTime ?? 3;
    this.drain = opts.drainTime ?? 1.5;
    this.fatigue = opts.fatigue ?? 0;
  }

  update(dt: number, holding: boolean): number {
    if (holding) {
      this.tiredness = clamp(this.tiredness + this.fatigue * dt);
      this.value = clamp(this.value + (dt / this.fill) * (1 - this.tiredness));
    } else {
      this.tiredness = clamp(this.tiredness - dt * 0.25);
      if (this.drain > 0) this.value = clamp(this.value - dt / this.drain);
    }
    return this.value;
  }

  get complete(): boolean {
    return this.value >= 1;
  }

  reset(): void {
    this.value = 0;
    this.tiredness = 0;
  }
}
