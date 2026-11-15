import { Effect } from 'postprocessing';
import { Color, Uniform, Vector2 } from 'three';
import { easing } from './math/easing';
import { prefersReducedMotion } from './safety';
import { palette } from './tokens';

/**
 * Chapter transitions (DESIGN.md 5.6). Each one covers the old scene with a patterned mask,
 * the chapters swap while the frame is fully covered, then the mask opens onto the new scene.
 * - `dissolve`: noise dissolve through ink. Quiet, neutral.
 * - `ink`: ink bleeding in from the edges and pooling. Heavy; for descent and loss.
 * - `light`: a wipe of light with a soft glowing edge. For arrival and deliverance.
 * - `fade`: a plain crossfade through ink (what every type becomes under reduced motion).
 * - `cut`: no transition. Only when the cut itself is the drama.
 */
export type TransitionType = 'dissolve' | 'ink' | 'light' | 'fade' | 'cut';

const TYPE_INDEX: Record<Exclude<TransitionType, 'cut'>, number> = { fade: 0, dissolve: 1, ink: 2, light: 3 };

const FRAG = /* glsl */ `
uniform float uProgress, uType, uSeed;
uniform vec3 uColor;
uniform vec2 uOrigin;
float _th(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float _tn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(_th(i), _th(i+vec2(1.,0.)), f.x), mix(_th(i+vec2(0.,1.)), _th(i+vec2(1.)), f.x), f.y); }
float _tf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * _tn(p); p = p * 2.02 + 11.3; a *= 0.5; } return s; }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  if (uProgress <= 0.0){ outputColor = inputColor; return; }
  vec2 p = vec2(uv.x * aspect, uv.y);
  float cover;
  vec3 col = uColor;
  if (uType < 0.5){
    cover = uProgress;
  } else if (uType < 1.5){
    float n = _tf(p * 3.2 + uSeed);
    cover = smoothstep(n - 0.12, n + 0.12, uProgress * 1.24 - 0.12);
  } else if (uType < 2.5){
    // Ink creeps in from the edges, feathered and uneven.
    float edge = 1.0 - length((uv - 0.5) * vec2(1.0, 1.15)) * 1.25;
    float n = _tf(p * 2.4 + uSeed) * 0.55 + _tf(p * 9.0 - uSeed) * 0.12;
    float field = edge * 0.75 + n;
    cover = smoothstep(field - 0.05, field + 0.09, uProgress * 1.5 - 0.08);
  } else {
    // Light spreads from an origin with a bright leading edge.
    float d = length((uv - uOrigin) * vec2(aspect, 1.0)) / (0.72 * max(aspect, 1.0) + 0.5);
    float n = _tf(p * 2.0 + uSeed) * 0.18;
    float front = uProgress * 1.5 - 0.1;
    cover = smoothstep(d + n - 0.02, d + n + 0.22, front);
    float rim = smoothstep(0.3, 0.0, abs(d + n + 0.1 - front)) * (1.0 - cover);
    outputColor = vec4(mix(inputColor.rgb + uColor * rim * 0.55, col, cover), inputColor.a);
    return;
  }
  outputColor = vec4(mix(inputColor.rgb, col, clamp(cover, 0.0, 1.0)), inputColor.a);
}`;

/** The full-frame transition effect. `createApp` adds one to PostFX; the Director drives it. */
export class TransitionEffect extends Effect {
  constructor() {
    super('Transition', FRAG, {
      uniforms: new Map<string, Uniform>([
        ['uProgress', new Uniform(0)],
        ['uType', new Uniform(1)],
        ['uSeed', new Uniform(0)],
        ['uColor', new Uniform(new Color(palette.ink))],
        ['uOrigin', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    });
  }

  private anim: { from: number; to: number; t: number; duration: number; resolve: () => void } | null = null;

  /** 0 = scene fully visible, 1 = fully covered. */
  get progress(): number {
    return this.uniforms.get('uProgress')!.value as number;
  }
  set progress(v: number) {
    this.uniforms.get('uProgress')!.value = v;
  }

  /** Configure the look. `color` defaults to ink (or warm light for `light`). */
  configure(type: Exclude<TransitionType, 'cut'>, opts: { color?: string; origin?: [number, number] } = {}): void {
    const effective = prefersReducedMotion() ? 'fade' : type;
    this.uniforms.get('uType')!.value = TYPE_INDEX[effective];
    this.uniforms.get('uSeed')!.value = Math.random() * 40;
    // Effects run before tone mapping, so the color is given in linear space.
    (this.uniforms.get('uColor')!.value as Color).set(opts.color ?? (type === 'light' ? palette.goldLight : palette.ink));
    (this.uniforms.get('uOrigin')!.value as Vector2).set(opts.origin?.[0] ?? 0.5, opts.origin?.[1] ?? 0.5);
  }

  /** Animate to covered (1) or revealed (0). Resolves when done. Needs `tick(dt)` each frame. */
  to(target: 0 | 1, seconds: number): Promise<void> {
    this.anim?.resolve();
    if (seconds <= 0) {
      this.progress = target;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.anim = { from: this.progress, to: target, t: 0, duration: seconds, resolve };
    });
  }

  /** Advance the animation. Uses real (unscaled) time so slow motion never stalls a transition. */
  tick(dt: number): void {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.duration);
    this.progress = a.from + (a.to - a.from) * easing.inOutCubic(k);
    if (k >= 1) {
      this.anim = null;
      a.resolve();
    }
  }
}
