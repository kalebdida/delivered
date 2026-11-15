// CH7's promise, as a pure model: every let-go is caught. Whatever the height or speed, a falling
// visitor is met by the arms before reaching `floor`, and the catch always finishes.

export type CatchKind = 'cradle' | 'toss' | 'spin' | 'slide' | 'bounce';
export const CATCH_KINDS: CatchKind[] = ['cradle', 'toss', 'spin', 'slide', 'bounce'];

export interface CatchPlan {
  kind: CatchKind;
  /** Where the arms meet the visitor. */
  y: number;
  /** Seconds the catch animation takes. */
  duration: number;
}

export class CatchSystem {
  letGo = 0;
  caught = 0;
  /** The arms rise to meet the visitor at this height (above the cloud floor). */
  constructor(
    readonly meetY: number,
    readonly floor: number,
  ) {}

  /** Called when the visitor lets go of anything. */
  release(): void {
    this.letGo++;
  }

  /**
   * Called every frame while airborne. Returns a catch when the arms take the visitor: on the way
   * down below `meetY`, or (failsafe) whenever they are under it at all.
   */
  check(y: number, vy: number, airTime: number): CatchPlan | null {
    if (!Number.isFinite(y) || y > this.meetY + 0.01) return null;
    if (vy > 0 && y > this.floor + 2 && airTime < 4) return null; // still rising after a toss
    return this.plan(y);
  }

  plan(y: number): CatchPlan {
    const kind = CATCH_KINDS[this.caught % CATCH_KINDS.length]!;
    this.caught++;
    const meet = Math.max(this.floor + 1, Math.min(y, this.meetY));
    return { kind, y: meet, duration: kind === 'toss' ? 3.4 : kind === 'slide' ? 3.2 : 2.6 };
  }
}

/**
 * Integrate a ballistic fall with the catch check, the way CH7 does each frame. Returns the time
 * it took to be caught and the lowest point reached (used by the tests and the debug overlay).
 */
export function simulateLetGo(sys: CatchSystem, y0: number, vy0: number, g = 14, dt = 1 / 60): { caughtAt: number; lowest: number; plan: CatchPlan | null } {
  let y = y0;
  let vy = vy0;
  let t = 0;
  let lowest = y;
  for (let i = 0; i < 60 * 120; i++) {
    const plan = sys.check(y, vy, t);
    if (plan) return { caughtAt: t, lowest, plan };
    vy = Math.max(vy - g * dt, -60);
    y += vy * dt;
    t += dt;
    lowest = Math.min(lowest, y);
  }
  return { caughtAt: Infinity, lowest, plan: null };
}
