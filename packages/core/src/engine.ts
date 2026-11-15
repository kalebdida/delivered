import {
  Clock,
  Color,
  DirectionalLight,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Camera,
  type Object3D,
} from 'three';
import { palette } from './tokens';
import { Quality, type QualityTier } from './quality';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** A Quality manager, a forced tier, or nothing (a new manager is created). */
  quality?: Quality | QualityTier;
  /** Vertical field of view in degrees (default 45). */
  fov?: number;
  /** Keep the drawing buffer so the canvas can be snapshotted (Postcard needs this). Default true. */
  preserveDrawingBuffer?: boolean;
}

export interface Engine {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  clock: Clock;
  quality: Quality;
  /** Scene exposure, applied by PostFX tone mapping (ACES filmic). */
  exposure: number;
  /** Current drawing size in CSS pixels. */
  size: { width: number; height: number };
  /** Subscribe to resizes (also fires on DPR change). */
  onResize(fn: (width: number, height: number, dpr: number) => void): () => void;
  /** Compile every shader in `scene` now, so the first frame of a chapter never stutters. */
  precompile(scene?: Object3D, camera?: Camera): Promise<void>;
  /** Configure a directional light for soft shadows sized by the quality budget. */
  setupShadowLight(light: DirectionalLight, frustum?: number, far?: number): void;
  /** Enable shadows on a subtree. */
  castShadows(root: Object3D, cast?: boolean, receive?: boolean): void;
  dispose(): void;
}

/**
 * Create the renderer (WebGL2), scene, camera and resize handling.
 *
 * Tone mapping is ACES filmic with sRGB output. It is applied by `PostFX` at the end of the
 * effect chain (the renderer itself stays linear so effects work in HDR). If you render without
 * PostFX, set `renderer.toneMapping = ACESFilmicToneMapping` yourself.
 *
 * ```ts
 * const engine = createEngine({ canvas });
 * engine.scene.add(mesh);
 * await engine.precompile();
 * ```
 */
export function createEngine(opts: EngineOptions): Engine {
  const quality =
    opts.quality instanceof Quality ? opts.quality : new Quality(opts.quality ? { force: opts.quality } : {});

  const renderer = new WebGLRenderer({
    canvas: opts.canvas,
    antialias: false,
    alpha: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? true,
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(new Color(palette.ink), 1);
  renderer.shadowMap.enabled = quality.budget.shadows;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.info.autoReset = true;

  const scene = new Scene();
  scene.background = new Color(palette.ink);
  const camera = new PerspectiveCamera(opts.fov ?? 45, 1, 0.1, 2000);
  camera.position.set(0, 1.6, 6);
  const clock = new Clock();
  const listeners = new Set<(w: number, h: number, dpr: number) => void>();
  const size = { width: 1, height: 1 };

  const resize = () => {
    const parent = opts.canvas.parentElement;
    const w = Math.max(1, parent?.clientWidth ?? window.innerWidth);
    const h = Math.max(1, parent?.clientHeight ?? window.innerHeight);
    size.width = w;
    size.height = h;
    renderer.setPixelRatio(quality.dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const fn of listeners) fn(w, h, quality.dpr);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(opts.canvas.parentElement ?? opts.canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  const offQuality = quality.onChange(() => {
    renderer.shadowMap.enabled = quality.budget.shadows;
    resize();
  });
  resize();

  const engine: Engine = {
    renderer,
    scene,
    camera,
    clock,
    quality,
    exposure: 1,
    size,
    onResize(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async precompile(target = scene, cam = camera) {
      try {
        await renderer.compileAsync(target, cam);
      } catch {
        renderer.compile(target, cam);
      }
    },
    setupShadowLight(light, frustum = 12, far = 60) {
      const b = quality.budget;
      light.castShadow = b.shadows;
      if (!b.shadows) return;
      light.shadow.mapSize.set(b.shadowMapSize, b.shadowMapSize);
      const c = light.shadow.camera;
      c.left = c.bottom = -frustum;
      c.right = c.top = frustum;
      c.near = 0.5;
      c.far = far;
      c.updateProjectionMatrix();
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.03;
      light.shadow.radius = 4;
    },
    castShadows(root, cast = true, receive = true) {
      root.traverse((o) => {
        o.castShadow = cast;
        o.receiveShadow = receive;
      });
    },
    dispose() {
      ro?.disconnect();
      offQuality();
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
      listeners.clear();
      renderer.dispose();
    },
  };
  return engine;
}
