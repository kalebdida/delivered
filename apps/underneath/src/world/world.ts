// Everything that lives for the whole room: the sky column, the visitor, the arms, the rider, and
// the camera controller. Chapters add only what is theirs.
import { Vector3 } from 'three';
import { damp, type CoreContext } from '@delivered/core';
import { SkyColumn } from './sky';
import { Visitor, type Platform } from './visitor';
import { Arms, ARM_COUNTS } from './arms';
import { Rider } from './rider';
import { COLUMN } from './layers';
import { MATERIALS, type Mats } from './islands';

export interface UnderCtx extends CoreContext {
  world: World;
}

export type CamMode = 'ground' | 'fall' | 'free';

const portrait = () => window.innerWidth / Math.max(1, window.innerHeight) < 0.8;

export class World {
  readonly sky: SkyColumn;
  readonly visitor = new Visitor();
  readonly arms: Arms;
  readonly rider: Rider;
  readonly mats: Mats = MATERIALS();
  /** Platforms the visitor can stand on (chapters fill this). */
  platforms: Platform[] = [];
  camMode: CamMode = 'ground';
  /** Ground camera yaw (radians); drag or the right stick turns it. */
  yaw = 0;
  /** 0 looking down .. 1 looking up (fall camera). */
  lookUp = 0;
  /** Smoothed offsets in the visitor's frame. */
  private readonly camOff = new Vector3(0, 3, 7);
  private readonly lookOff = new Vector3(0, 1.2, 0);
  private readonly camGoal = new Vector3();
  private readonly lookGoal = new Vector3();
  private readonly focus = new Vector3();
  /** Free-mode targets the chapters set. */
  readonly freePos = new Vector3();
  readonly freeLook = new Vector3();
  camDistance = 1;
  /** Record of the fall path for the reveal. */
  readonly path: Vector3[] = [];
  easyIslands = false;
  lets = 0;
  catches = 0;
  private lookKey = false;
  private lookMouse = false;

  constructor(private readonly ctx: CoreContext) {
    ctx.engine.camera.far = 6000;
    ctx.engine.camera.updateProjectionMatrix();
    this.sky = new SkyColumn(ctx);
    const tier = ctx.quality.tier;
    this.arms = new Arms({ count: ARM_COUNTS[tier], scale: 700, ribbons: tier === 'low' ? 8 : 16 });
    this.arms.group.position.set(0, 0, 0);
    this.rider = new Rider(tier === 'low' ? 1500 : tier === 'medium' ? 4000 : 9000);
    this.rider.level = 0;
    ctx.engine.scene.add(this.visitor.group, this.arms.group, this.rider.group);
    this.visitor.group.position.set(0, COLUMN.islands, 0);

    // "Look up": Shift or the right mouse button (the touch button is set per chapter).
    const key = (on: boolean) => (e: KeyboardEvent) => {
      if (e.key === 'Shift') this.lookKey = on;
    };
    window.addEventListener('keydown', key(true));
    window.addEventListener('keyup', key(false));
    window.addEventListener('pointerdown', (e) => {
      if (e.button === 2) this.lookMouse = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.lookMouse = false;
    });
    window.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).tagName === 'CANVAS') e.preventDefault();
    });
    window.addEventListener('blur', () => (this.lookKey = this.lookMouse = false));
  }

  get lookingUp(): boolean {
    return this.lookKey || this.lookMouse || !!this.ctx.input.filtered.custom.lookUp;
  }

  /** Movement input turned into a world direction relative to the ground camera. */
  moveDir(): { dx: number; dz: number } {
    const f = this.ctx.input.filtered;
    const x = f.moveX;
    const y = f.moveY;
    const s = Math.sin(this.yaw);
    const c = Math.cos(this.yaw);
    // Forward (moveY up) is away from the camera.
    let dx = x * c - y * s;
    let dz = -x * s - y * c;
    const l = Math.hypot(dx, dz);
    if (l > 1) {
      dx /= l;
      dz /= l;
    }
    return { dx, dz };
  }

  update(rawDt: number): void {
    const dt = Math.max(0, rawDt);
    const { ctx, visitor } = this;
    const real = ctx.loop.timeScale > 0 ? dt / ctx.loop.timeScale : dt;
    visitor.update(dt);
    const pr = ctx.engine.renderer.getPixelRatio();
    this.arms.update(dt, pr);
    this.rider.update(dt, pr);
    this.updateCamera(Math.min(real, 0.1));
    this.sky.update(dt, ctx.engine.camera, visitor.group.position);
  }

  private updateCamera(dt: number): void {
    const { rig, input } = this.ctx;
    const v = this.visitor.group.position;
    if (this.camMode === 'free') {
      rig.position.copy(this.freePos);
      rig.target.copy(this.freeLook);
      return;
    }
    const tall = portrait();
    if (this.camMode === 'ground') {
      this.yaw -= input.filtered.lookX * dt * 2.2;
      const d = (tall ? 8.6 : 6.8) * this.camDistance;
      this.camGoal.set(Math.sin(this.yaw) * d, (tall ? 3.6 : 2.7) * this.camDistance, Math.cos(this.yaw) * d);
      this.lookGoal.set(-Math.sin(this.yaw) * 2.5, 1.3, -Math.cos(this.yaw) * 2.5);
    } else {
      this.lookUp = damp(this.lookUp, this.lookingUp ? 1 : 0, 3.2, dt);
      const u = this.lookUp;
      // Down: above and behind, looking into the depths. Up: below, looking past the visitor at the sky.
      this.camGoal.set(0, 5.5 - u * 8.5, 2.4 + u * 3.6).multiplyScalar(tall ? 1.2 : 1);
      this.lookGoal.set(0, -20 + u * 40, -6 - u * 8);
    }
    const k = this.camMode === 'fall' ? 4 : 5;
    this.camOff.set(damp(this.camOff.x, this.camGoal.x, k, dt), damp(this.camOff.y, this.camGoal.y, k, dt), damp(this.camOff.z, this.camGoal.z, k, dt));
    this.lookOff.set(damp(this.lookOff.x, this.lookGoal.x, k, dt), damp(this.lookOff.y, this.lookGoal.y, k, dt), damp(this.lookOff.z, this.lookGoal.z, k, dt));
    // Frame the torso, which the fall pose lifts and pushes forward of the figure's origin.
    const fp = this.visitor.fallPose;
    const sh = Math.sin(this.visitor.heading);
    const ch = Math.cos(this.visitor.heading);
    this.focus.set(v.x + sh * 0.9 * fp, v.y + 1.1 * fp, v.z + ch * 0.9 * fp);
    rig.position.copy(this.focus).add(this.camOff);
    rig.target.copy(this.focus).add(this.lookOff);
  }

  /** Jump the camera to its goal (after a cut). */
  snapCamera(): void {
    this.updateCamera(10);
  }

  /** Set the camera's free targets and switch to free mode. */
  free(pos: Vector3, look: Vector3): void {
    this.camMode = 'free';
    this.freePos.copy(pos);
    this.freeLook.copy(look);
  }
}
