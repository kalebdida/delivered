import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  LookupTexture,
  LUT3DEffect,
  RenderPass,
  SelectiveBloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  type Pass,
} from 'postprocessing';
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Uniform,
  Vector2,
  type Camera,
  type Mesh,
  type Object3D,
  type Points,
  type Scene,
  type Texture,
} from 'three';
import type { Engine } from './engine';
import { clamp, damp } from './math/easing';
import { flashLimiter, preferences, prefersReducedMotion } from './safety';
import { palette } from './tokens';

// ---------------------------------------------------------------------------------------------
// LUT generation
// ---------------------------------------------------------------------------------------------

/** Parameters for a procedural color grade baked into a 3D LUT. All optional. */
export interface GradeParams {
  /** Tint multiplied into shadows (hex). */
  shadows?: string;
  /** Tint multiplied into highlights (hex). */
  highlights?: string;
  /** How strongly the tints apply, 0..1 (default 0.35). */
  tintStrength?: number;
  /** 1 is neutral. */
  contrast?: number;
  /** 1 is neutral. */
  saturation?: number;
  /** Lifts the black point toward this color so blacks never crush to #000 (default ink). */
  blackPoint?: string;
  /** Pulls the white point toward this color so whites never clip to #FFF (default bone). */
  whitePoint?: string;
  /** Gamma, 1 is neutral; below 1 brightens midtones. */
  gamma?: number;
}

/** Room grades. Each room passes its own to `PostFX` (or builds a custom `GradeParams`). */
export const GRADES = {
  neutral: {},
  hub: { shadows: '#1a1a3a', highlights: '#ffe2a8', tintStrength: 0.3, contrast: 1.06, saturation: 1.04 },
  wretched: { shadows: '#20222e', highlights: '#ffd9a0', tintStrength: 0.4, contrast: 1.1, saturation: 0.78 },
  underneath: { shadows: '#2a2f5c', highlights: '#ffe7b8', tintStrength: 0.35, contrast: 1.04, saturation: 1.12 },
  gain: { shadows: '#1c2236', highlights: '#ffcf96', tintStrength: 0.42, contrast: 1.12, saturation: 0.92 },
} satisfies Record<string, GradeParams>;

/** Apply a grade to one display-referred RGB triple (0..1). Pure, exported for tests. */
export function gradeColor(rgb: [number, number, number], g: GradeParams): [number, number, number] {
  const sh = new Color(g.shadows ?? '#808080');
  const hi = new Color(g.highlights ?? '#808080');
  const bp = new Color(g.blackPoint ?? palette.ink);
  const wp = new Color(g.whitePoint ?? palette.bone);
  const k = g.tintStrength ?? 0.35;
  const contrast = g.contrast ?? 1;
  const sat = g.saturation ?? 1;
  const gamma = g.gamma ?? 1;
  let [r, gg, b] = rgb;
  const l0 = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  // Split toning: shadows lean toward one tint, highlights toward the other.
  const sw = (1 - l0) * (1 - l0) * k;
  const hw = l0 * l0 * k;
  const tint = (c: number, s: number, h: number) => c + (s - 0.5) * sw * 0.6 + (h - 0.5) * hw * 0.6;
  r = tint(r, sh.r, hi.r);
  gg = tint(gg, sh.g, hi.g);
  b = tint(b, sh.b, hi.b);
  const con = (c: number) => (c - 0.5) * contrast + 0.5;
  r = con(r);
  gg = con(gg);
  b = con(b);
  const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  r = l + (r - l) * sat;
  gg = l + (gg - l) * sat;
  b = l + (b - l) * sat;
  const fin = (c: number, lo: number, hiC: number) => {
    const v = Math.pow(clamp(c), gamma);
    return lo + (hiC - lo) * v;
  };
  // Colors are display-referred here; map 0..1 into [blackPoint, whitePoint].
  const s = (c: Color) => c.clone().convertLinearToSRGB();
  const bps = s(bp);
  const wps = s(wp);
  return [fin(r, bps.r, wps.r), fin(gg, bps.g, wps.g), fin(b, bps.b, wps.b)];
}

/** Bake a `GradeParams` into a 3D LUT texture usable by `PostFX.setLUT`. */
export function createGradeLUT(g: GradeParams, size = 32): LookupTexture {
  const lut = LookupTexture.createNeutral(size);
  const data = lut.image.data as Float32Array;
  for (let i = 0; i < data.length; i += 4) {
    const [r, gg, b] = gradeColor([data[i]!, data[i + 1]!, data[i + 2]!], g);
    data[i] = r;
    data[i + 1] = gg;
    data[i + 2] = b;
  }
  lut.minFilter = lut.magFilter = LinearFilter;
  lut.needsUpdate = true;
  return lut;
}

// ---------------------------------------------------------------------------------------------
// Custom effects
// ---------------------------------------------------------------------------------------------

class ExposureEffect extends Effect {
  constructor() {
    super('Exposure', `uniform float uExposure; void mainImage(const in vec4 i, const in vec2 uv, out vec4 o){ o = vec4(i.rgb * uExposure, i.a); }`, {
      uniforms: new Map([['uExposure', new Uniform(1)]]),
    });
  }
}

const GRADE_FRAG = /* glsl */ `
uniform float uSaturation, uVignette, uVignetteSoft, uGrain, uFade, uLetter;
uniform vec3 uFadeColor, uVignetteColor;
float _ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float _h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 _toDisplay(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 _toLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  // The effect chain is linear; grade in display space so grain, fades and dithering are
  // perceptually even, then hand linear back to the pass for its final sRGB encode.
  vec3 c = _toDisplay(clamp(inputColor.rgb, 0.0, 1.0));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  vec2 q = uv - 0.5; q.x *= mix(1.0, aspect, 0.35);
  float v = smoothstep(uVignetteSoft, 1.05, length(q) * 1.55);
  c = mix(c, uVignetteColor, v * uVignette);
  vec2 px = uv * resolution;
  float g = _h(px + fract(time) * 91.7) - 0.5;
  c += g * uGrain * (1.0 - 0.6 * l);
  c = mix(c, uFadeColor, uFade);
  float n = _ign(px);
  c += (vec3(n, fract(n + 0.618), fract(n + 0.382)) - 0.5) / 255.0 * 1.5;
  outputColor = vec4(_toLinear(clamp(c, 0.0, 1.0)), inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('Grade', GRADE_FRAG, {
      uniforms: new Map<string, Uniform>([
        ['uSaturation', new Uniform(1)],
        ['uVignette', new Uniform(0.55)],
        ['uVignetteSoft', new Uniform(0.35)],
        ['uGrain', new Uniform(0.03)],
        ['uFade', new Uniform(0)],
        ['uLetter', new Uniform(0)],
        ['uFadeColor', new Uniform(new Color(palette.ink).convertLinearToSRGB())],
        ['uVignetteColor', new Uniform(new Color(palette.ink).convertLinearToSRGB())],
      ]),
    });
  }
}

const DISTORT_FRAG = /* glsl */ `
uniform float uHeat, uGlitch, uBlur, uSplit;
uniform vec2 uCenter;
float _dh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float _vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(_dh(i), _dh(i + vec2(1.0, 0.0)), f.x), mix(_dh(i + vec2(0.0, 1.0)), _dh(i + vec2(1.0)), f.x), f.y); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  vec2 p = uv;
  if (uHeat > 0.0){
    float n1 = _vn(p * vec2(8.0, 18.0) + vec2(0.0, -time * 1.3)) - 0.5;
    float n2 = _vn(p * vec2(19.0, 37.0) + vec2(3.0, -time * 2.4)) - 0.5;
    p += vec2(n1 + 0.5 * n2, 0.4 * n1) * uHeat * 0.02;
  }
  float split = uSplit;
  if (uGlitch > 0.0){
    float t = floor(time * 20.0);
    float row = floor(p.y * 22.0 + _dh(vec2(t, 3.0)) * 7.0);
    if (_dh(vec2(row, t)) < uGlitch * 0.4) p.x += (_dh(vec2(t, row)) - 0.5) * 0.14 * uGlitch;
    p.x += (_dh(vec2(floor(p.y * resolution.y * 0.5), t)) - 0.5) * 0.006 * uGlitch;
    split += 0.006 * uGlitch * (0.5 + _dh(vec2(t, 9.0)));
  }
  vec3 c;
  if (uBlur > 0.0){
    vec2 d = (uCenter - p) * uBlur * 0.12;
    float j = _dh(p * resolution + fract(time));
    c = vec3(0.0);
    for (int i = 0; i < BLUR_SAMPLES; i++){ c += texture2D(inputBuffer, p + d * ((float(i) + j) / float(BLUR_SAMPLES))).rgb; }
    c /= float(BLUR_SAMPLES);
  } else { c = texture2D(inputBuffer, p).rgb; }
  if (split > 0.0){
    vec2 o = normalize(p - 0.5 + 1e-4) * split;
    c.r = mix(c.r, texture2D(inputBuffer, p + o).r, 0.9);
    c.b = mix(c.b, texture2D(inputBuffer, p - o).b, 0.9);
  }
  outputColor = vec4(c, inputColor.a);
}`;

class DistortionEffect extends Effect {
  constructor(samples: number) {
    super('Distortion', DISTORT_FRAG, {
      attributes: EffectAttribute.CONVOLUTION,
      defines: new Map([['BLUR_SAMPLES', String(samples)]]),
      uniforms: new Map<string, Uniform>([
        ['uHeat', new Uniform(0)],
        ['uGlitch', new Uniform(0)],
        ['uBlur', new Uniform(0)],
        ['uSplit', new Uniform(0)],
        ['uCenter', new Uniform(new Vector2(0.5, 0.5))],
      ]),
    });
  }
}

// ---------------------------------------------------------------------------------------------
// PostFX
// ---------------------------------------------------------------------------------------------

export interface PostFXParams {
  /** Bloom strength. Glow means something; keep it restrained (default 0.55). */
  bloom: number;
  /** Luminance above which pixels bloom (HDR, default 0.82). */
  bloomThreshold: number;
  /** 1 is neutral, 0 is greyscale. */
  saturation: number;
  /** 0..1 */
  vignette: number;
  /** Film grain amount, 0.02 to 0.04 per DESIGN.md. */
  grain: number;
  /** Heat haze strength 0..1. */
  heat: number;
  /** Glitch strength 0..1 (RGB split, block displacement, scanline jitter). */
  glitch: number;
  /** Chromatic split on its own, in UV units (try 0.002). */
  split: number;
  /** Radial blur strength 0..1 toward `blurCenter`. */
  radialBlur: number;
  /** Depth of field on or off (high tier only). */
  dof: boolean;
  /** World-space focus distance for depth of field. */
  focusDistance: number;
  focusRange: number;
  bokeh: number;
}

export type PostFXPreset = 'cinematic' | 'clean' | 'dream' | 'stark';

export const POSTFX_PRESETS: Record<PostFXPreset, Partial<PostFXParams>> = {
  /** The default look: restrained bloom, soft vignette, 3% grain. */
  cinematic: { bloom: 0.55, bloomThreshold: 0.82, vignette: 0.55, grain: 0.03, saturation: 1 },
  /** For UI-heavy or bright scenes. */
  clean: { bloom: 0.3, bloomThreshold: 0.9, vignette: 0.3, grain: 0.02, saturation: 1 },
  /** Soft and glowing, for arrival and rest. */
  dream: { bloom: 0.9, bloomThreshold: 0.7, vignette: 0.45, grain: 0.025, saturation: 1.08 },
  /** Desaturated and heavy. */
  stark: { bloom: 0.35, bloomThreshold: 0.88, vignette: 0.75, grain: 0.04, saturation: 0.6 },
};

export interface PostFXOptions {
  preset?: PostFXPreset;
  /** The room's color grade. */
  grade?: GradeParams;
  scene?: Scene;
  camera?: Camera;
}

/**
 * The post-processing chain (pmndrs postprocessing).
 *
 * Pass order: render → depth of field → bloom (+ god rays) → distortion → room effects →
 * exposure, ACES tone map, LUT, grade (saturation, vignette, grain, fades, dithering).
 *
 * ```ts
 * const fx = new PostFX(engine, { preset: 'cinematic', grade: GRADES.gain });
 * fx.params.heat = 0.4;              // any param can be set or tweened directly
 * fx.glitchBurst(0.8, 0.25);         // flash-limited automatically
 * fx.fadeTo('white', 1, 1.2);        // white-out over 1.2 s
 * fx.addEffect(new MyEffect());      // register a custom room effect
 * loop.onFrame((dt) => fx.render(dt));
 * ```
 */
export class PostFX {
  readonly composer: EffectComposer;
  readonly params: PostFXParams = {
    bloom: 0.55, bloomThreshold: 0.82, saturation: 1, vignette: 0.55, grain: 0.03,
    heat: 0, glitch: 0, split: 0, radialBlur: 0, dof: false, focusDistance: 8, focusRange: 4, bokeh: 3,
  };
  /** Radial blur center in UV space. */
  readonly blurCenter = new Vector2(0.5, 0.5);

  private readonly engine: Engine;
  private scene: Scene;
  private camera: Camera;
  private renderPass: RenderPass;
  private bloom: BloomEffect | SelectiveBloomEffect | null = null;
  private dof: DepthOfFieldEffect | null = null;
  private godRays: GodRaysEffect | null = null;
  private distortion: DistortionEffect;
  private distortionPass: EffectPass | null = null;
  private dofPass: EffectPass | null = null;
  private exposure = new ExposureEffect();
  private tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  private lut: LUT3DEffect;
  private grade = new GradeEffect();
  private custom: Effect[] = [];
  private customPasses: Pass[] = [];
  private bloomSelection: Object3D[] | null = null;
  private fade = { value: 0, target: 0, rate: 0 };
  private burst = { glitch: 0, time: 0, duration: 0 };
  private flashValue = 0;
  private offResize: () => void;
  private offQuality: () => void;

  constructor(engine: Engine, opts: PostFXOptions = {}) {
    this.engine = engine;
    this.scene = opts.scene ?? engine.scene;
    this.camera = opts.camera ?? engine.camera;
    Object.assign(this.params, POSTFX_PRESETS[opts.preset ?? 'cinematic']);
    this.composer = new EffectComposer(engine.renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.lut = new LUT3DEffect(createGradeLUT(opts.grade ?? GRADES.neutral));
    this.distortion = new DistortionEffect(engine.quality.tier === 'low' ? 8 : 16);
    this.rebuild();
    this.offResize = engine.onResize((w, h) => this.composer.setSize(w, h));
    this.offQuality = engine.quality.events.on('tier', () => this.rebuild());
    this.composer.setSize(engine.size.width, engine.size.height);
  }

  /** Swap the scene and camera being rendered (the Director does this between chapters). */
  setScene(scene: Scene, camera: Camera): void {
    this.scene = scene;
    this.camera = camera;
    this.rebuild();
  }

  /** Apply a named preset. */
  setPreset(preset: PostFXPreset): void {
    Object.assign(this.params, POSTFX_PRESETS[preset]);
  }

  /** Set the room color grade from parameters or a ready LUT texture. */
  setLUT(lut: GradeParams | Texture): void {
    const tex = (lut as Texture).isTexture ? (lut as Texture) : createGradeLUT(lut as GradeParams);
    this.lut.lut?.dispose();
    this.lut.lut = tex;
  }

  /**
   * Restrict bloom to specific objects (true selective bloom), or pass `null` to go back to
   * luminance-threshold bloom, where only HDR-bright pixels glow.
   */
  setBloomSelection(objects: Object3D[] | null): void {
    this.bloomSelection = objects;
    this.rebuild();
  }

  /** Volumetric god rays from a bright mesh (medium and high tiers). Pass `null` to remove. */
  setGodRays(source: Mesh | Points | null, opts: { density?: number; weight?: number; decay?: number; exposure?: number } = {}): void {
    this.godRays?.dispose();
    this.godRays = null;
    if (source && this.engine.quality.budget.postFx >= 1) {
      this.godRays = new GodRaysEffect(this.camera, source, {
        samples: this.engine.quality.tier === 'high' ? 60 : 30,
        density: opts.density ?? 0.96,
        decay: opts.decay ?? 0.93,
        weight: opts.weight ?? 0.35,
        exposure: opts.exposure ?? 0.5,
        clampMax: 1,
        blur: true,
        resolutionScale: 0.5,
      });
    }
    this.rebuild();
  }

  /**
   * Register a custom room effect. It runs after distortion and before tone mapping, in HDR.
   * Effects flagged CONVOLUTION get their own pass automatically.
   * @returns a function that removes it.
   */
  addEffect(effect: Effect): () => void {
    this.custom.push(effect);
    this.rebuild();
    return () => {
      this.custom = this.custom.filter((e) => e !== effect);
      this.rebuild();
    };
  }

  /** Register a whole custom pass (advanced). It runs just before the final grade pass. */
  addPass(pass: Pass): () => void {
    this.customPasses.push(pass);
    this.rebuild();
    return () => {
      this.customPasses = this.customPasses.filter((p) => p !== pass);
      this.rebuild();
    };
  }

  /**
   * Fade the whole frame toward white (bone) or black (ink). `amount` 0 clears the fade.
   * Fast fades count as flashes and are softened by the flash limiter.
   */
  fadeTo(colorName: 'white' | 'black' | string, amount: number, seconds = 0.8): void {
    const hex = colorName === 'white' ? palette.bone : colorName === 'black' ? palette.ink : colorName;
    (this.grade.uniforms.get('uFadeColor')!.value as Color).set(hex).convertLinearToSRGB();
    let target = clamp(amount);
    if (seconds < 0.35 && colorName !== 'black') {
      target = this.fade.value + flashLimiter.request(target - this.fade.value);
    }
    this.fade.target = target;
    this.fade.rate = seconds <= 0 ? Infinity : Math.abs(target - this.fade.value) / seconds;
  }

  /** A brief full-frame flash of light. Goes through the global flash limiter. */
  flash(intensity = 0.8, colorHex: string = palette.goldLight): void {
    const allowed = flashLimiter.request(clamp(intensity));
    if (allowed <= 0) return;
    (this.grade.uniforms.get('uFadeColor')!.value as Color).set(colorHex).convertLinearToSRGB();
    this.flashValue = Math.max(this.flashValue, allowed);
  }

  /** A short glitch burst on top of `params.glitch`. Softened under reduce-flashing or reduced motion. */
  glitchBurst(strength = 0.7, seconds = 0.25): void {
    const soften = preferences.get().reduceFlashing || prefersReducedMotion() ? 0.3 : 1;
    this.burst = { glitch: clamp(strength) * soften, time: 0, duration: seconds };
  }

  /** Render one frame. Call from `loop.onFrame`. */
  render(dt: number): void {
    const p = this.params;
    const q = this.engine.quality.budget;
    // fades
    if (this.fade.value !== this.fade.target) {
      const step = this.fade.rate * dt;
      const d = this.fade.target - this.fade.value;
      this.fade.value = Math.abs(d) <= step ? this.fade.target : this.fade.value + Math.sign(d) * step;
    }
    this.flashValue = damp(this.flashValue, 0, 5, dt);
    if (this.flashValue < 0.002) this.flashValue = 0;
    // glitch burst envelope
    let glitch = p.glitch;
    if (this.burst.duration > 0) {
      this.burst.time += dt;
      const k = 1 - this.burst.time / this.burst.duration;
      if (k <= 0) this.burst.duration = 0;
      else glitch = Math.max(glitch, this.burst.glitch * k);
    }
    const du = this.distortion.uniforms;
    du.get('uHeat')!.value = p.heat;
    du.get('uGlitch')!.value = glitch;
    du.get('uBlur')!.value = p.radialBlur;
    du.get('uSplit')!.value = p.split;
    (du.get('uCenter')!.value as Vector2).copy(this.blurCenter);
    if (this.distortionPass) {
      this.distortionPass.enabled = p.heat > 0 || glitch > 0 || p.radialBlur > 0 || p.split > 0;
    }
    if (this.bloom) {
      this.bloom.intensity = p.bloom;
      this.bloom.luminanceMaterial.threshold = p.bloomThreshold;
    }
    if (this.dof && this.dofPass) {
      this.dofPass.enabled = p.dof && q.postFx >= 2;
      this.dof.cocMaterial.worldFocusDistance = p.focusDistance;
      this.dof.cocMaterial.worldFocusRange = p.focusRange;
      this.dof.bokehScale = p.bokeh;
    }
    const gu = this.grade.uniforms;
    gu.get('uSaturation')!.value = p.saturation;
    gu.get('uVignette')!.value = p.vignette;
    gu.get('uGrain')!.value = p.grain;
    gu.get('uFade')!.value = Math.max(this.fade.value, this.flashValue);
    this.exposure.uniforms.get('uExposure')!.value = this.engine.exposure;
    this.composer.render(dt);
  }

  private rebuild(): void {
    const c = this.composer;
    const tier = this.engine.quality.budget.postFx;
    for (const pass of [...c.passes]) c.removePass(pass);
    this.bloom?.dispose();
    this.dof?.dispose();
    this.bloom = null;
    this.dof = null;
    this.dofPass = null;
    this.renderPass.mainScene = this.scene;
    this.renderPass.mainCamera = this.camera;
    c.addPass(this.renderPass);

    if (tier >= 2) {
      this.dof = new DepthOfFieldEffect(this.camera, {
        worldFocusDistance: this.params.focusDistance,
        worldFocusRange: this.params.focusRange,
        bokehScale: this.params.bokeh,
        resolutionScale: 0.5,
      });
      this.dofPass = new EffectPass(this.camera, this.dof);
      this.dofPass.enabled = this.params.dof;
      c.addPass(this.dofPass);
    }
    if (tier >= 1) {
      const bloomOpts = {
        mipmapBlur: true,
        intensity: this.params.bloom,
        luminanceThreshold: this.params.bloomThreshold,
        luminanceSmoothing: 0.2,
        radius: 0.72,
        levels: this.engine.quality.tier === 'high' ? 7 : 5,
      };
      if (this.bloomSelection) {
        const sel = new SelectiveBloomEffect(this.scene, this.camera, bloomOpts);
        sel.selection.set(this.bloomSelection);
        sel.ignoreBackground = true;
        this.bloom = sel;
      } else {
        this.bloom = new BloomEffect(bloomOpts);
      }
      if (this.godRays) this.godRays.mainCamera = this.camera;
      const lightEffects: Effect[] = this.godRays ? [this.godRays, this.bloom] : [this.bloom];
      c.addPass(new EffectPass(this.camera, ...lightEffects));
    }
    this.distortionPass = new EffectPass(this.camera, this.distortion);
    c.addPass(this.distortionPass);
    const plain = this.custom.filter((e) => !(e.getAttributes() & EffectAttribute.CONVOLUTION));
    const conv = this.custom.filter((e) => e.getAttributes() & EffectAttribute.CONVOLUTION);
    for (const e of conv) c.addPass(new EffectPass(this.camera, e));
    for (const pass of this.customPasses) c.addPass(pass);
    c.addPass(new EffectPass(this.camera, ...plain, this.exposure, this.tone, this.lut, this.grade));
  }

  dispose(): void {
    this.offResize();
    this.offQuality();
    this.composer.dispose();
  }
}

export { BlendFunction, Effect, EffectAttribute, EffectPass };
