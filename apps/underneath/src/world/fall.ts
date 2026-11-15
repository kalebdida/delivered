// The freefall, as a pure model. The visitor steers and changes posture but can never stop the
// fall: speed has a floor, and a pacing floor guarantees arrival within `maxDuration`.

export interface FallInput {
  /** Steering, -1..1 each. */
  x: number;
  y: number;
  /** -1 spread (slower) .. 1 tuck (faster). */
  posture: number;
  /** 0..1, how much the visitor is looking up. */
  lookUp: number;
  /** A grab is holding the visitor for a moment (it always lets go). */
  holding: boolean;
}

export interface FallOptions {
  startY: number;
  endY: number;
  /** Seconds; the fall arrives by then whatever the input. */
  maxDuration: number;
  minSpeed: number;
  maxSpeed: number;
  cruise: number;
  /** Horizontal radius the visitor can steer within (soft). */
  radius: number;
}

export const FALL_DEFAULTS: FallOptions = { startY: 2380, endY: 200, maxDuration: 100, minSpeed: 18, maxSpeed: 36, cruise: 25, radius: 70 };

export class FallModel {
  readonly opts: FallOptions;
  x = 0;
  y: number;
  z = 0;
  vx = 0;
  vz = 0;
  /** Downward speed, units/s (always ≥ minSpeed except while a grab briefly holds). */
  speed: number;
  time = 0;

  constructor(opts: Partial<FallOptions> = {}) {
    this.opts = { ...FALL_DEFAULTS, ...opts };
    this.y = this.opts.startY;
    this.speed = this.opts.minSpeed;
  }

  get done(): boolean {
    return this.y <= this.opts.endY;
  }

  /** 0..1 progress through the column. */
  get progress(): number {
    const { startY, endY } = this.opts;
    return Math.min(1, Math.max(0, (startY - this.y) / (startY - endY)));
  }

  step(dt: number, input: FallInput): void {
    if (this.done) return;
    const o = this.opts;
    this.time += dt;
    const sanitize = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
    const posture = sanitize(input.posture);
    let target = o.cruise + (posture > 0 ? posture * (o.maxSpeed - o.cruise) : posture * (o.cruise - o.minSpeed));
    // Looking up calms the fall a little (never below the floor).
    target -= sanitize(input.lookUp) * 2;
    // A grab slows the visitor for a moment, but never holds: speed stays above half the floor.
    if (input.holding) target = o.minSpeed * 0.5;
    // Pacing floor: the remaining distance must fit in the remaining time.
    const remaining = this.y - o.endY;
    const timeLeft = Math.max(0.5, o.maxDuration - this.time);
    const pace = remaining / timeLeft;
    target = Math.max(target, pace, input.holding ? o.minSpeed * 0.5 : o.minSpeed);
    target = Math.min(target, Math.max(o.maxSpeed, pace));
    this.speed += (target - this.speed) * Math.min(1, dt * 1.6);
    this.speed = Math.max(this.speed, input.holding ? o.minSpeed * 0.5 : o.minSpeed * 0.9, pace * 0.98);
    this.y -= this.speed * dt;

    // Steering with drag, softly held inside the column.
    const accel = 26;
    this.vx += sanitize(input.x) * accel * dt;
    this.vz += -sanitize(input.y) * accel * dt;
    const r = Math.hypot(this.x, this.z);
    if (r > o.radius) {
      const k = ((r - o.radius) / o.radius) * 40 * dt;
      this.vx -= (this.x / r) * k * 10;
      this.vz -= (this.z / r) * k * 10;
    }
    const drag = Math.exp(-dt * 1.4);
    this.vx *= drag;
    this.vz *= drag;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y < o.endY) this.y = o.endY;
  }
}
