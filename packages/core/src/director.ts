import { Group } from 'three';
import { checkLeaks, deepDispose, memorySnapshot } from './dispose';
import { isComplete, type AppId } from './safety';
import { Emitter, createStore, type Store } from './storage';
import type { TransitionEffect, TransitionType } from './transitions';
import type { CoreContext } from './app';

/**
 * One chapter of a room. Subclass it, build your scene in `enter`, animate in `update`.
 *
 * ```ts
 * class Threshold extends Chapter {
 *   id = 'threshold';
 *   override keyMomentAt = 6;
 *   enter(ctx: CoreContext) {
 *     this.root.add(new Mesh(...));        // everything under `root` is disposed for you
 *     this.own(ctx.audio.drone(55));       // handles passed to own() are stopped on exit
 *   }
 *   update(dt: number) { if (finished) this.complete(); }
 * }
 * ```
 */
export abstract class Chapter<Ctx extends CoreContext = CoreContext> {
  /** Unique within the room. */
  abstract readonly id: string;
  /** Seconds after entering at which this chapter looks its best; `pnpm shots` captures it then. */
  keyMomentAt = 3;
  /** Transition used when this chapter is entered (default: the Director's). */
  transitionIn?: TransitionType;
  /** Scene content owned by this chapter. Added to the scene on enter; deep-disposed on exit. */
  readonly root = new Group();
  /** Seconds since the chapter was entered (scaled time). */
  time = 0;
  protected ctx!: Ctx;
  private cleanups: (() => void)[] = [];
  /** @internal set by the Director */
  _advance: (() => void) | null = null;

  /** Build the chapter. May be async (await `ctx.engine.precompile(this.root)` for heavy scenes). */
  abstract enter(ctx: Ctx): void | Promise<void>;
  /** Per rendered frame. `dt` is scaled by `loop.timeScale`. */
  abstract update(dt: number): void;
  /** Per fixed simulation step (60 Hz). Optional. */
  fixedUpdate?(dt: number): void;
  /** Extra teardown. `root`, and anything given to `own()`, is cleaned up automatically. */
  exit(): void {}

  /** Tell the Director this chapter is finished; it moves to the next one. */
  protected complete(): void {
    const advance = this._advance;
    this._advance = null;
    advance?.();
  }

  /**
   * Register something to clean up on exit: a function, or any object with `stop()` or
   * `dispose()` (sound handles, tweens' kill wrappers, Dust, CloudField, ...).
   */
  protected own<T extends (() => void) | { stop(): void } | { dispose(): void } | { kill(): void }>(thing: T): T {
    this.cleanups.push(
      typeof thing === 'function'
        ? thing
        : 'stop' in thing ? () => thing.stop()
        : 'dispose' in thing ? () => thing.dispose()
        : () => thing.kill(),
    );
    return thing;
  }

  /** @internal */
  _enter(ctx: Ctx): void | Promise<void> {
    this.ctx = ctx;
    this.time = 0;
    ctx.engine.scene.add(this.root);
    return this.enter(ctx);
  }
  /** @internal */
  _exit(): void {
    this._advance = null;
    try {
      this.exit();
    } finally {
      for (const fn of this.cleanups.splice(0)) {
        try {
          fn();
        } catch (err) {
          console.warn('[delivered] cleanup failed', err);
        }
      }
      deepDispose(this.root);
      this.root.clear();
    }
  }
}

export interface DirectorOptions {
  /** Storage namespace and completion id. Use the room's AppId; 'demo' and 'hub' are also allowed. */
  appId: AppId | 'hub' | 'demo';
  /** Default transition between chapters (default 'dissolve'). */
  transition?: TransitionType;
  /** Seconds for each half of a transition (default 0.9). */
  transitionTime?: number;
  /** Called after the last chapter completes. */
  onEnd?: () => void;
  /** Warn about leaked GPU memory after each chapter (default: on in dev builds and with ?debug). */
  leakCheck?: boolean;
  transitionEffect?: TransitionEffect | null;
}

/**
 * Sequences chapters, runs transitions, saves progress, and keeps GPU memory at baseline.
 *
 * - Progress is stored under `delivered:<appId>:chapter`.
 * - `?chapter=N` jumps straight to a chapter (development and `pnpm shots`).
 * - Skipping (`director.canSkip`) unlocks after the room has been completed once.
 */
export class Director<Ctx extends CoreContext = CoreContext> {
  readonly events = new Emitter<{ chapter: { index: number; id: string }; end: void }>();
  index = -1;
  current: Chapter<Ctx> | null = null;
  /** True while a transition is running. */
  busy = false;
  private readonly store: Store;
  private readonly opts: Required<Omit<DirectorOptions, 'onEnd' | 'transitionEffect'>> & Pick<DirectorOptions, 'onEnd'>;
  private fx: TransitionEffect | null;
  private since = 0;

  constructor(
    private readonly ctx: Ctx,
    readonly chapters: Chapter<Ctx>[],
    options: DirectorOptions,
  ) {
    const debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
    this.opts = {
      appId: options.appId,
      transition: options.transition ?? 'dissolve',
      transitionTime: options.transitionTime ?? 0.9,
      leakCheck: options.leakCheck ?? (debug || !!import.meta.env?.DEV),
      onEnd: options.onEnd,
    };
    this.fx = options.transitionEffect ?? null;
    this.store = createStore(options.appId);
  }

  /** Chapter index requested by `?chapter=N`, or null. */
  static deepLink(): number | null {
    if (typeof location === 'undefined') return null;
    const v = new URLSearchParams(location.search).get('chapter');
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  }

  /** Saved progress (the last chapter reached), 0 when none. */
  get savedIndex(): number {
    const i = this.store.get<number>('chapter', 0);
    return i >= 0 && i < this.chapters.length ? i : 0;
  }

  /** Skipping chapters unlocks once the room has been completed. */
  get canSkip(): boolean {
    const id = this.opts.appId;
    return id === 'demo' || id === 'hub' ? true : isComplete(id);
  }

  /** Start at `?chapter=N` if present, else at `index` (default 0). */
  async start(index = 0): Promise<void> {
    const link = Director.deepLink();
    await this.goTo(link ?? index, 'cut');
    if (this.fx && this.fx.progress > 0) await this.fx.to(0, this.opts.transitionTime);
  }

  /** Go to the next chapter, or end the room after the last one. */
  async next(): Promise<void> {
    if (this.index + 1 >= this.chapters.length) {
      this.opts.onEnd?.();
      this.events.emit('end', undefined);
      return;
    }
    await this.goTo(this.index + 1);
  }

  /** Skip the current chapter (only when `canSkip`). */
  async skip(): Promise<void> {
    if (this.canSkip && !this.busy) await this.next();
  }

  /** Jump to a chapter with a transition. */
  async goTo(index: number, transition?: TransitionType): Promise<void> {
    if (this.busy) return;
    const i = Math.max(0, Math.min(this.chapters.length - 1, index));
    const target = this.chapters[i];
    if (!target) return;
    this.busy = true;
    try {
      const type = transition ?? target.transitionIn ?? this.opts.transition;
      const fx = type === 'cut' ? null : this.fx;
      if (fx && this.current) {
        fx.configure(type as Exclude<TransitionType, 'cut'>);
        await fx.to(1, this.opts.transitionTime);
      }
      const renderer = this.ctx.engine.renderer;
      if (this.current) {
        const before = this.baseline;
        this.current._exit();
        // The first chapter also triggers engine-owned allocations (shadow maps, bloom buffers,
        // the LUT), so its first exit is not a fair measurement.
        if (this.opts.leakCheck && before && this.exits++ > 0) checkLeaks(renderer, before, this.current.id);
      }
      this.baseline = memorySnapshot(renderer);
      this.current = target;
      this.index = i;
      this.since = 0;
      this.store.set('chapter', i);
      target._advance = () => void this.next();
      await target._enter(this.ctx);
      await this.ctx.engine.precompile();
      this.publish();
      this.events.emit('chapter', { index: i, id: target.id });
      if (fx) await fx.to(0, this.opts.transitionTime);
    } finally {
      this.busy = false;
    }
  }
  private baseline: ReturnType<typeof memorySnapshot> | null = null;
  private exits = 0;

  /** Call once per frame. `realDt` (unscaled) keeps transitions moving during slow motion. */
  update(dt: number, realDt = dt): void {
    this.fx?.tick(realDt);
    if (!this.current) return;
    this.since += realDt;
    this.current.time += dt;
    this.current.update(dt);
    const g = globalThis as { __delivered?: Record<string, unknown> };
    if (g.__delivered) {
      g.__delivered.elapsed = this.since;
      g.__delivered.busy = this.busy;
    }
  }

  /** Call once per fixed step. */
  fixedUpdate(dt: number): void {
    this.current?.fixedUpdate?.(dt);
  }

  /** Publish state for `pnpm shots` and the debug tools. */
  private publish(): void {
    const g = globalThis as { __delivered?: Record<string, unknown> };
    g.__delivered = {
      ...g.__delivered,
      app: this.opts.appId,
      chapter: this.index,
      chapterId: this.current?.id,
      chapterCount: this.chapters.length,
      keyMomentAt: this.current?.keyMomentAt ?? 3,
      elapsed: 0,
      ready: true,
    };
  }

  /** Reset saved progress (Replay). */
  resetProgress(): void {
    this.store.set('chapter', 0);
  }

  dispose(): void {
    this.current?._exit();
    this.current = null;
    this.events.clear();
  }
}
