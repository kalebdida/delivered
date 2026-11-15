import { AudioEngine, type ReverbName } from './audio';
import { CameraRig } from './camera-rig';
import { createDebug, isDebug, type DebugTools } from './debug';
import { Director, type Chapter, type DirectorOptions } from './director';
import { createEngine, type Engine } from './engine';
import { t } from './i18n';
import { Input } from './input';
import { Loop } from './loop';
import { Physics } from './physics';
import { GRADES, PostFX, type GradeParams, type PostFXPreset } from './postfx';
import { Quality, type QualityTier } from './quality';
import type { AppId } from './safety';
import { createStore, type Store } from './storage';
import { TransitionEffect, type TransitionType } from './transitions';
import {
  ChapterCard, Chrome, Cursor, EndCard, HUD, LoadingScreen, ScriptureOverlay, Settings, Whisper, bindUISounds, getUIRoot,
} from './ui';

/** Everything a chapter can reach. Passed to `Chapter.enter(ctx)`. */
export interface CoreContext {
  appId: AppId | 'hub' | 'demo';
  engine: Engine;
  loop: Loop;
  quality: Quality;
  postfx: PostFX;
  rig: CameraRig;
  input: Input;
  audio: AudioEngine;
  /** Present when `createApp({ physics: true })`. */
  physics: Physics | null;
  director: Director;
  /** Namespaced storage: keys become `delivered:<appId>:*`. */
  store: Store;
  ui: {
    scripture: ScriptureOverlay;
    card: ChapterCard;
    whisper: Whisper;
    hud: HUD;
    settings: Settings;
    end: EndCard;
    cursor: Cursor;
    chrome: Chrome;
  };
  /** `?debug` tools (null otherwise). */
  debug: DebugTools | null;
  t: typeof t;
}

export interface AppOptions<Ctx extends CoreContext = CoreContext> {
  appId: CoreContext['appId'];
  /** Title shown by the loading screen, e.g. 'WRETCHED'. */
  title: string;
  /** The room's chapters, in order. */
  chapters: Chapter<Ctx>[];
  /** Mount point (default document.body). */
  container?: HTMLElement;
  /** Color grade (default: the room's entry in `GRADES`). */
  grade?: GradeParams;
  preset?: PostFXPreset;
  reverb?: ReverbName;
  /** Create a Rapier world (default false; it costs a WASM download). */
  physics?: boolean;
  /** Default chapter transition. */
  transition?: TransitionType;
  /** Show a Begin button after loading, so audio unlocks with a real gesture (default true). */
  begin?: boolean;
  /** Loader background, e.g. the portal light color when arriving from the hub. */
  loaderColor?: string;
  /** Hub URL for the back button (default '/'; null hides it). */
  home?: string | null;
  quality?: QualityTier;
  /** Extra per-frame work, after the chapter update and before rendering. */
  onFrame?: (dt: number, ctx: Ctx) => void;
  /** Runs while the loader shows: build persistent world objects, register strings, etc. */
  setup?: (ctx: Ctx, progress: (p: number) => void) => void | Promise<void>;
  directorOptions?: Partial<DirectorOptions>;
  onEnd?: () => void;
}

/**
 * Boot a room in one call: canvas, engine, quality detection, PostFX, camera rig, input, audio,
 * UI, loader, Director and the main loop. Rooms should start here.
 *
 * ```ts
 * import '@delivered/core/styles.css';
 * import { createApp } from '@delivered/core';
 *
 * const ctx = await createApp({
 *   appId: 'gain', title: 'GAIN', reverb: 'smallCell', physics: true,
 *   chapters: [new Threshold(), new Cell(), new Sentence()],
 * });
 * ```
 * Frame order: input → fixed steps (physics, chapter.fixedUpdate) → chapter.update → onFrame →
 * camera rig → audio listener → PostFX render.
 */
export async function createApp<Ctx extends CoreContext = CoreContext>(opts: AppOptions<Ctx>): Promise<Ctx> {
  const container = opts.container ?? document.body;
  document.body.classList.add('dl-stage');
  document.documentElement.dataset.room = opts.appId;
  const loader = new LoadingScreen({ title: opts.title, background: opts.loaderColor });
  loader.setProgress(0.08);

  const canvas = document.createElement('canvas');
  canvas.className = 'dl-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);
  getUIRoot();

  const quality = new Quality(opts.quality ? { force: opts.quality } : {});
  const engine = createEngine({ canvas, quality });
  const loop = new Loop();
  const grade = opts.grade ?? (opts.appId in GRADES ? GRADES[opts.appId as keyof typeof GRADES] : GRADES.neutral);
  const postfx = new PostFX(engine, { preset: opts.preset ?? 'cinematic', grade });
  const transition = new TransitionEffect();
  postfx.addEffect(transition);
  transition.progress = 1;
  const rig = new CameraRig(engine.camera);
  const input = new Input({ element: canvas });
  const audio = new AudioEngine();
  if (opts.reverb) audio.setReverb(opts.reverb);
  const offSounds = bindUISounds(audio);
  const settings = new Settings(audio);
  const ui: CoreContext['ui'] = {
    scripture: new ScriptureOverlay(),
    card: new ChapterCard(),
    whisper: new Whisper(),
    hud: new HUD(),
    settings,
    end: new EndCard(),
    cursor: new Cursor(),
    chrome: new Chrome({ audio, settings, home: opts.home }),
  };
  loader.setProgress(0.2);

  const [, physics] = await Promise.all([quality.detect(), opts.physics ? Physics.create() : Promise.resolve(null)]);
  loader.setProgress(0.45);

  const ctx = {
    appId: opts.appId, engine, loop, quality, postfx, rig, input, audio, physics, store: createStore(opts.appId), ui, debug: null, t,
  } as unknown as Ctx;
  const director = new Director<Ctx>(ctx, opts.chapters, {
    appId: opts.appId,
    transition: opts.transition,
    transitionEffect: transition,
    onEnd: opts.onEnd,
    ...opts.directorOptions,
  });
  ctx.director = director as unknown as Director;

  await opts.setup?.(ctx, (p) => loader.setProgress(0.45 + 0.35 * Math.min(1, Math.max(0, p))));
  loader.setProgress(0.8);
  if (isDebug()) ctx.debug = await createDebug(ctx);

  loop.onFixed((dt) => {
    physics?.step(dt);
    director.fixedUpdate(dt);
  });
  let last = performance.now();
  loop.onFrame((dt) => {
    const now = performance.now();
    const realDt = Math.min((now - last) / 1000, 0.25);
    last = now;
    input.update(realDt);
    physics?.sync();
    director.update(dt, realDt);
    opts.onFrame?.(dt, ctx);
    rig.update(realDt);
    audio.updateListener(engine.camera);
    quality.update(loop.frameMs, realDt);
    postfx.render(realDt);
    ctx.debug?.update();
  });

  // Enter the first chapter behind the loader so its shaders compile before anyone sees a frame.
  const shot = new URLSearchParams(location.search).has('shot');
  await director.goTo(Director.deepLink() ?? 0, 'cut');
  postfx.render(0);
  loader.setProgress(1);
  loop.start();
  await loader.finish({ begin: (opts.begin ?? true) && !shot && Director.deepLink() === null });
  await audio.unlock();
  await transition.to(0, 1.2);

  window.addEventListener('pagehide', () => {
    offSounds();
    loop.stop();
  });
  return ctx;
}
