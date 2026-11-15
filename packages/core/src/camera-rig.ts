import gsap from 'gsap';
import { CatmullRomCurve3, Euler, MathUtils, Quaternion, Vector3, type Object3D, type PerspectiveCamera } from 'three';
import { damp } from './math/easing';
import { createNoise } from './math/noise';
import { Spring3, SPRING_PRESETS, type SpringConfig } from './math/spring';
import { prefersReducedMotion } from './safety';
import { motion } from './tokens';

const UP = new Vector3(0, 1, 0);

export interface FollowOptions {
  /** Camera offset from the target in the target's local XZ frame (default behind and above). */
  offset?: Vector3;
  /** Point to look at, relative to the target (default slightly above it). */
  lookOffset?: Vector3;
  /** Spring preset name or config (default 'smooth'). */
  spring?: keyof typeof SPRING_PRESETS | SpringConfig;
  /** Rotate the offset with the target's heading (third-person chase). Default false. */
  inheritHeading?: boolean;
}

export const FOLLOW_PRESETS = {
  /** Close third-person, over the shoulder. */
  close: { offset: new Vector3(0.6, 1.9, 4.2), lookOffset: new Vector3(0, 1.2, 0), spring: 'smooth' },
  /** Wider, calmer follow. */
  wide: { offset: new Vector3(0, 3.5, 9), lookOffset: new Vector3(0, 1, 0), spring: 'gentle' },
  /** Looking down from above, for falling. */
  above: { offset: new Vector3(0, 7, 2.5), lookOffset: new Vector3(0, 0, 0), spring: 'gentle' },
  /** Low and heavy, for weighty moments. */
  low: { offset: new Vector3(0, 0.7, 5), lookOffset: new Vector3(0, 1.4, 0), spring: 'heavy' },
} satisfies Record<string, FollowOptions>;

export interface PathOptions {
  /** Seconds (camera moves are 2 to 8 s per DESIGN.md). */
  duration?: number;
  ease?: string;
  /** Look-at targets along the path (a second spline), or a fixed point. */
  lookAt?: Vector3[] | Vector3;
  /** FOV to reach by the end of the move. */
  fov?: number;
  onComplete?: () => void;
}

/**
 * Camera rig: spring follow, trauma shake, spline paths, FOV kicks, look-at blending,
 * letterbox bars and pointer parallax.
 *
 * ```ts
 * const rig = new CameraRig(engine.camera);
 * rig.follow(player, FOLLOW_PRESETS.close);
 * rig.addTrauma(0.6);                       // shake, ignored under reduced motion
 * rig.playPath([a, b, c], { duration: 5, lookAt: target });
 * rig.letterbox(true);
 * loop.onFrame((dt) => rig.update(dt));
 * ```
 */
export class CameraRig {
  /** Max parallax rotation in degrees (default 2.5). Set 0 to disable. */
  parallax = 2.5;
  /** Shake amplitude multipliers at full trauma. */
  shake = { rotation: 0.035, position: 0.12, frequency: 14, decay: 1.1 };
  /** The un-shaken camera position; drive this directly when not following. */
  readonly position = new Vector3();
  /** The un-shaken look target. */
  readonly target = new Vector3();

  private followTarget: Object3D | null = null;
  private followOpts: Required<FollowOptions> | null = null;
  private posSpring = new Spring3();
  private lookSpring = new Spring3();
  private trauma = 0;
  private time = 0;
  private noise = createNoise('camera-shake');
  private pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  private fovBase: number;
  private fovKick = 0;
  private pathTween: gsap.core.Tween | null = null;
  private lookTween: gsap.core.Tween | null = null;
  private bars: HTMLElement | null = null;
  private readonly _v = new Vector3();
  private readonly _q = new Quaternion();
  private readonly _e = new Euler();
  private readonly onPointer = (e: PointerEvent) => {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };

  constructor(readonly camera: PerspectiveCamera) {
    this.position.copy(camera.position);
    camera.getWorldDirection(this.target).multiplyScalar(10).add(camera.position);
    this.fovBase = camera.fov;
    this.posSpring.snap(this.position);
    this.lookSpring.snap(this.target);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
  }

  /** Follow an object with a damped spring. Pass `null` to stop following. */
  follow(target: Object3D | null, opts: FollowOptions = FOLLOW_PRESETS.close, snap = false): void {
    this.followTarget = target;
    if (!target) return;
    this.pathTween?.kill();
    this.followOpts = {
      offset: opts.offset ?? FOLLOW_PRESETS.close.offset,
      lookOffset: opts.lookOffset ?? FOLLOW_PRESETS.close.lookOffset,
      spring: opts.spring ?? 'smooth',
      inheritHeading: opts.inheritHeading ?? false,
    };
    const cfg = typeof this.followOpts.spring === 'string' ? SPRING_PRESETS[this.followOpts.spring] : this.followOpts.spring;
    this.posSpring.config = cfg;
    this.lookSpring.config = cfg;
    this.posSpring.snap(this.position);
    this.lookSpring.snap(this.target);
    if (snap) {
      this.computeFollow();
      this.posSpring.snap(this.position.copy(this._desiredPos));
      this.lookSpring.snap(this.target.copy(this._desiredLook));
    }
  }

  private readonly _desiredPos = new Vector3();
  private readonly _desiredLook = new Vector3();
  private computeFollow(): void {
    const t = this.followTarget!;
    const o = this.followOpts!;
    t.getWorldPosition(this._v);
    this._desiredPos.copy(o.offset);
    if (o.inheritHeading) {
      t.getWorldQuaternion(this._q);
      this._e.setFromQuaternion(this._q, 'YXZ');
      this._desiredPos.applyAxisAngle(UP, this._e.y);
    }
    this._desiredPos.add(this._v);
    this._desiredLook.copy(this._v).add(o.lookOffset);
  }

  /** Add camera shake. Trauma is 0..1 and decays on its own; shake scales with trauma squared. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /**
   * Fly the camera along a CatmullRom spline, driven by a gsap tween. Stops any follow.
   * @returns the tween, so it can be added to a gsap timeline.
   */
  playPath(points: Vector3[], opts: PathOptions = {}): gsap.core.Tween {
    this.followTarget = null;
    this.pathTween?.kill();
    const curve = new CatmullRomCurve3([this.position.clone(), ...points], false, 'centripetal');
    const lookCurve = Array.isArray(opts.lookAt)
      ? new CatmullRomCurve3([this.target.clone(), ...opts.lookAt], false, 'centripetal')
      : null;
    const fixedLook = opts.lookAt && !Array.isArray(opts.lookAt) ? opts.lookAt : null;
    const lookStart = this.target.clone();
    const fovStart = this.fovBase;
    const state = { t: 0 };
    const reduced = prefersReducedMotion();
    this.pathTween = gsap.to(state, {
      t: 1,
      duration: reduced ? Math.min(opts.duration ?? 4, 1.2) : (opts.duration ?? 4),
      ease: opts.ease ?? motion.easeInOutQuart,
      onUpdate: () => {
        curve.getPoint(state.t, this.position);
        if (lookCurve) lookCurve.getPoint(state.t, this.target);
        else if (fixedLook) this.target.lerpVectors(lookStart, fixedLook, Math.min(1, state.t * 1.6));
        if (opts.fov !== undefined) this.fovBase = MathUtils.lerp(fovStart, opts.fov, state.t);
      },
      onComplete: opts.onComplete,
    });
    return this.pathTween;
  }

  /** Blend the look target to a new point over `seconds`. */
  lookAt(point: Vector3, seconds = 1.5, ease: string = motion.easeInOutQuart): gsap.core.Tween {
    this.lookTween?.kill();
    this.lookTween = gsap.to(this.target, { x: point.x, y: point.y, z: point.z, duration: seconds, ease });
    return this.lookTween;
  }

  /** Momentary FOV punch that springs back (impacts, launches). Skipped under reduced motion. */
  kickFov(degrees: number): void {
    if (!prefersReducedMotion()) this.fovKick += degrees;
  }

  /** Set the resting FOV, optionally animated. */
  setFov(fov: number, seconds = 0, ease: string = motion.easeInOutQuart): void {
    if (seconds <= 0) this.fovBase = fov;
    else gsap.to(this, { fovBase: fov, duration: seconds, ease });
  }

  /** Jump the camera without animation. */
  snapTo(position: Vector3, target: Vector3): void {
    this.pathTween?.kill();
    this.position.copy(position);
    this.target.copy(target);
    this.posSpring.snap(position);
    this.lookSpring.snap(target);
  }

  /** Show or hide cinematic letterbox bars (DOM, styled by DESIGN.md). */
  letterbox(on: boolean): void {
    if (!this.bars) {
      this.bars = document.createElement('div');
      this.bars.className = 'dl-letterbox';
      this.bars.setAttribute('aria-hidden', 'true');
      this.bars.innerHTML = '<i></i><i></i>';
      document.body.appendChild(this.bars);
      void this.bars.offsetHeight;
    }
    this.bars.classList.toggle('is-on', on);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.followTarget && this.followOpts) {
      this.computeFollow();
      this.posSpring.setTarget(this._desiredPos);
      this.lookSpring.setTarget(this._desiredLook);
      this.posSpring.step(dt, this.position);
      this.lookSpring.step(dt, this.target);
    }
    const cam = this.camera;
    cam.position.copy(this.position);
    cam.lookAt(this.target);

    const reduced = prefersReducedMotion();
    if (!reduced && this.parallax > 0) {
      this.pointer.sx = damp(this.pointer.sx, this.pointer.x, 3, dt);
      this.pointer.sy = damp(this.pointer.sy, this.pointer.y, 3, dt);
      const amt = MathUtils.degToRad(this.parallax);
      cam.rotateY(-this.pointer.sx * amt);
      cam.rotateX(-this.pointer.sy * amt * 0.6);
    }
    if (this.trauma > 0) {
      const s = reduced ? 0 : this.trauma * this.trauma;
      const t = this.time * this.shake.frequency;
      cam.rotateZ(this.noise.noise2(t, 1.3) * this.shake.rotation * s);
      cam.rotateX(this.noise.noise2(t, 7.7) * this.shake.rotation * s);
      cam.rotateY(this.noise.noise2(t, 13.1) * this.shake.rotation * s);
      cam.position.x += this.noise.noise2(t, 21.9) * this.shake.position * s;
      cam.position.y += this.noise.noise2(t, 33.3) * this.shake.position * s;
      this.trauma = Math.max(0, this.trauma - this.shake.decay * dt);
    }
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    const fov = this.fovBase + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.001) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointer);
    this.pathTween?.kill();
    this.lookTween?.kill();
    this.bars?.remove();
    this.bars = null;
  }
}
