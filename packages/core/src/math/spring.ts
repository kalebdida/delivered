/** Damped spring math: scalar and 3-vector springs integrated semi-implicitly (stable at 60 Hz). */
export interface SpringConfig {
  /** Stiffness (higher snaps faster). */
  stiffness: number;
  /** Damping (2*sqrt(stiffness) is critically damped). */
  damping: number;
  mass?: number;
}

export const SPRING_PRESETS = {
  /** Soft, floaty follow. */
  gentle: { stiffness: 30, damping: 11 },
  /** Critically damped, no overshoot. Good for cameras. */
  smooth: { stiffness: 60, damping: 15.5 },
  /** Fast with a little overshoot. */
  snappy: { stiffness: 180, damping: 20 },
  /** Bouncy, for playful UI. */
  wobbly: { stiffness: 140, damping: 9 },
  /** Heavy and slow, for weighty moments. */
  heavy: { stiffness: 14, damping: 9, mass: 2 },
} satisfies Record<string, SpringConfig>;

export class Spring {
  value: number;
  target: number;
  velocity = 0;
  constructor(
    initial = 0,
    public config: SpringConfig = SPRING_PRESETS.smooth,
  ) {
    this.value = initial;
    this.target = initial;
  }
  step(dt: number): number {
    const { stiffness, damping, mass = 1 } = this.config;
    // Sub-step for stability with stiff springs or long frames.
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (-stiffness * (this.value - this.target) - damping * this.velocity) / mass;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  snap(v: number): void {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
  get settled(): boolean {
    return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-4;
  }
}

/** Three independent springs for a position. Works with any `{x,y,z}`. */
export class Spring3 {
  x: Spring;
  y: Spring;
  z: Spring;
  constructor(initial = { x: 0, y: 0, z: 0 }, config: SpringConfig = SPRING_PRESETS.smooth) {
    this.x = new Spring(initial.x, config);
    this.y = new Spring(initial.y, config);
    this.z = new Spring(initial.z, config);
  }
  set config(c: SpringConfig) {
    this.x.config = this.y.config = this.z.config = c;
  }
  setTarget(v: { x: number; y: number; z: number }): void {
    this.x.target = v.x;
    this.y.target = v.y;
    this.z.target = v.z;
  }
  snap(v: { x: number; y: number; z: number }): void {
    this.x.snap(v.x);
    this.y.snap(v.y);
    this.z.snap(v.z);
  }
  step(dt: number, out: { x: number; y: number; z: number }): void {
    out.x = this.x.step(dt);
    out.y = this.y.step(dt);
    out.z = this.z.step(dt);
  }
}
