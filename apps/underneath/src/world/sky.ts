// The sky column: everything that makes the five layers, driven by the camera's altitude.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, InstancedBufferAttribute,
  InstancedBufferGeometry, Mesh, NormalBlending, PlaneGeometry, Points, ShaderMaterial, Vector3, type Camera,
} from 'three';
import { CloudField, HeightFog, Sky, flashLimiter, glsl, seededRandom, type CoreContext } from '@delivered/core';
import { COLUMN, GRADES_BY_LAYER, LAYERS, LOOKS, dominantLayer, layerAt, type LayerName } from './layers';
import { CloudDome, type CloudLook } from './cloudscape';
import { RIM } from './visitor';

const RIM_LOOK: Record<LayerName, { color: string; k: number }> = {
  heights: { color: '#ffc47a', k: 3.6 },
  storm: { color: '#a9b8ff', k: 1.5 },
  night: { color: '#8fa6ff', k: 0.9 },
  fog: { color: '#f4f1ec', k: 0.3 },
  underneath: { color: '#ffd79a', k: 1.3 },
};
/** The low sun of the Heights: just right of the view along the island course (-z). */
export const SUN = { elevation: 7, azimuth: 2.83 };
const _rimDir = new Vector3();
const _rimTmp = new Vector3();

/** The far cloudscape per layer (the Storm draws its own walls on the dome). */
const CLOUD_LOOKS: Record<LayerName, CloudLook> = {
  heights: { lit: '#fff0d4', shade: '#c08f8c', sun: '#ffc874', sea: 1, high: 0.6, banks: 1 },
  storm: { lit: '#4c5694', shade: '#1b1f3a', sun: '#000000', sea: 0, high: 0, banks: 0 },
  night: { lit: '#1c2350', shade: '#0b0e24', sun: '#000000', sea: 0, high: 0, banks: 0 },
  fog: { lit: '#e4e1dc', shade: '#b4b1ad', sun: '#000000', sea: 0, high: 0, banks: 0 },
  underneath: { lit: '#8a6274', shade: '#2c2036', sun: '#000000', sea: 0, high: 0.35, banks: 0.7 },
};
const DAY_CLOUDS: CloudLook = { lit: '#fffdf8', shade: '#a9bcd8', sun: '#fff2d6', sea: 1, high: 0.5, banks: 0.95 };

const _a = new Color();
const _b = new Color();

/** Mix a color field of the five looks by weight. */
function mixColor(w: Record<LayerName, number>, pick: (l: LayerName) => string, out: Color): Color {
  out.setRGB(0, 0, 0);
  for (const l of LAYERS) out.add(_a.set(pick(l)).multiplyScalar(w[l]));
  return out;
}
function mixNum(w: Record<LayerName, number>, pick: (l: LayerName) => number): number {
  let s = 0;
  for (const l of LAYERS) s += pick(l) * w[l];
  return s;
}

/** Instanced soft puffs that recycle around the camera vertically, so a fall has speed. */
class Wisps {
  readonly mesh: Mesh;
  readonly uniforms = {
    uCam: { value: new Vector3() },
    uSpan: { value: 260 },
    uColor: { value: new Color('#f4ebdd') },
    uShade: { value: new Color('#9aa3c4') },
    uOpacity: { value: 0 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashPos: { value: new Vector3() },
    uFlashCol: { value: new Color('#dde6ff') },
  };
  constructor(count: number, seed: string, span = 260, rMin = 10, rMax = 150, sMin = 14, sMax = 48) {
    const rng = seededRandom(seed);
    const geo = new InstancedBufferGeometry();
    const plane = new PlaneGeometry(1, 1);
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = rMin + Math.pow(rng(), 0.7) * (rMax - rMin);
      off.set([Math.cos(a) * r, rng() * span, Math.sin(a) * r, sMin + rng() * (sMax - sMin)], i * 4);
    }
    geo.setAttribute('aOff', new InstancedBufferAttribute(off, 4));
    geo.instanceCount = count;
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform vec3 uCam; uniform float uSpan; uniform float uTime;
        varying vec2 vUv; varying float vFade; varying float vSeed; varying vec3 vC;
        void main(){
          float y = uCam.y + mod(aOff.y - uCam.y, uSpan) - uSpan * 0.5;
          vec3 c = vec3(aOff.x, y, aOff.z);
          vC = c;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float s = aOff.w;
          mv.xy += position.xy * s;
          vUv = uv; vSeed = fract(aOff.x * 0.137 + aOff.z * 0.071);
          float edge = 1.0 - smoothstep(uSpan * 0.32, uSpan * 0.5, abs(y - uCam.y));
          float near = smoothstep(s * 0.25, s * 1.2, -mv.z);
          vFade = edge * near;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uShade; uniform float uOpacity; uniform float uTime;
        uniform float uFlash; uniform vec3 uFlashPos; uniform vec3 uFlashCol;
        varying vec2 vUv; varying float vFade; varying float vSeed; varying vec3 vC;
        ${glsl.hash}${glsl.simplex3D}${glsl.fbm}${glsl.dither}
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float n = fbm(vec3(p * 1.6, vSeed * 10.0 + uTime * 0.05));
          float d = length(p) + n * 0.35;
          float a = smoothstep(1.0, 0.15, d) * vFade * uOpacity;
          if (a < 0.003) discard;
          vec3 col = mix(uShade, uColor, clamp(0.55 + p.y * 0.35 + n * 0.4, 0.0, 1.0));
          // Lightning inside the cloud: the thick middle lights up first, the billows show.
          float fl = uFlash * exp(-distance(vC, uFlashPos) / 180.0);
          col += uFlashCol * fl * (0.25 + 0.75 * smoothstep(0.9, 0.1, d)) * (0.7 + 0.6 * n) * 2.3;
          gl_FragColor = vec4(col + dither(gl_FragCoord.xy), a * 0.75);
        }`,
    });
    this.uniforms.uSpan.value = span;
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

/** Rain streaks around the camera, stretched by the fall speed. */
class Rain {
  readonly mesh: Mesh;
  readonly uniforms = { uCam: { value: new Vector3() }, uTime: { value: 0 }, uOpacity: { value: 0 }, uStretch: { value: 6 } };
  constructor(count: number) {
    const rng = seededRandom('rain');
    const geo = new InstancedBufferGeometry();
    const plane = new PlaneGeometry(1, 1);
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) off.set([(rng() - 0.5) * 50, rng() * 60, (rng() - 0.5) * 50, rng()], i * 4);
    geo.setAttribute('aOff', new InstancedBufferAttribute(off, 4));
    geo.instanceCount = count;
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform vec3 uCam; uniform float uTime; uniform float uStretch;
        varying float vA; varying vec2 vUv;
        void main(){
          float span = 60.0;
          float y = uCam.y + mod(aOff.y + uTime * (30.0 + aOff.w * 20.0) - uCam.y, span) - span * 0.5;
          vec3 c = vec3(uCam.x + aOff.x + uTime * 6.0 * (aOff.w - 0.3), y, uCam.z + aOff.z);
          vec4 mv = viewMatrix * vec4(c, 1.0);
          vec4 top = viewMatrix * vec4(c + vec3(0.0, uStretch, 0.0), 1.0);
          vec2 dir = normalize(top.xy - mv.xy + 1e-4);
          vec2 side = vec2(-dir.y, dir.x);
          mv.xy += side * position.x * 0.045 + (top.xy - mv.xy) * (position.y + 0.5);
          vUv = position.xy + 0.5;
          vA = smoothstep(1.5, 6.0, -mv.z) * (1.0 - smoothstep(20.0, 30.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vA; varying vec2 vUv;
        void main(){
          float a = vA * uOpacity * sin(vUv.y * 3.14159) * 0.4;
          gl_FragColor = vec4(vec3(0.75, 0.8, 1.0) * a, a);
        }`,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

/** A shell of stars around the camera: above AND below. */
class Stars {
  readonly points: Points;
  readonly uniforms = { uOpacity: { value: 0 }, uTime: { value: 0 } };
  constructor(count: number) {
    const rng = seededRandom('stars');
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * 800, u * 800, Math.sin(a) * s * 800], i * 3);
      seed[i] = rng();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; varying float vB;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vB = (0.4 + 0.6 * pow(aSeed, 3.0)) * (0.75 + 0.25 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0));
          gl_PointSize = 1.2 + pow(aSeed, 6.0) * 3.2;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying float vB;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vB * uOpacity;
          gl_FragColor = vec4(vec3(0.97, 0.95, 0.92) * a * 1.6, a);
        }`,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1500;
  }
  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}

const _ldir = new Vector3();
const _lrand = new Vector3();
const _fwd = new Vector3();

/** A soft additive glow inside the storm clouds; flash-limited. */
class Lightning {
  readonly mesh: Mesh;
  readonly uniforms = { uI: { value: 0 } };
  private next = 3;
  private level = 0;
  /** Where the last strike lit the cloud (world). */
  readonly at = new Vector3();
  /** 0..1 how bright the strike is now; `bolt` while the bolt itself is visible. */
  flash = 0;
  bolt = 0;
  boltSeed = 0;
  /** Strike as soon as allowed (the screenshot hook). */
  soon = false;
  private since = 9;
  onStrike: ((distance: number) => void) | null = null;
  constructor() {
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy * 260.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * uI; gl_FragColor = vec4(vec3(0.87, 0.9, 1.0) * a, a); }`,
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  update(dt: number, active: number, cam: Vector3, fwd: Vector3): void {
    this.next -= dt;
    if (this.soon && active > 0.3) this.next = 0;
    if (active > 0.3 && this.next <= 0) {
      this.next = 1.6 + Math.random() * 3.5;
      const allowed = flashLimiter.request(0.9);
      if (this.soon && allowed <= 0.05) this.next = 0;
      if (allowed > 0.05) {
        this.soon = false;
        this.level = allowed * active;
        // Somewhere inside the view (within ~32 degrees of where the camera looks), deep in the cloud.
        const dist = 70 + Math.random() * 110;
        const dir = _ldir.copy(fwd).add(_lrand.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.8)).normalize();
        this.mesh.position.copy(cam).addScaledVector(dir, dist);
        this.at.copy(this.mesh.position);
        this.boltSeed = Math.random() * 100;
        this.since = 0;
        this.onStrike?.(dist / 200);
      }
    }
    // The cloud keeps glowing for a moment after the strike (a soft afterglow, never a hard
    // on/off); the bolt itself is brief.
    this.since += dt;
    this.level = Math.max(0, this.level - dt * 0.95);
    const flicker = this.level > 0 ? 0.78 + 0.22 * Math.sin(performance.now() * 0.06) : 0;
    this.flash = this.level * flicker;
    this.bolt = Math.max(0, 1 - this.since / 0.35) * (this.level > 0 ? 1 : 0) * flicker;
    this.uniforms.uI.value = this.flash * 1.1;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

export class SkyColumn {
  readonly group = new Group();
  readonly sky = new Sky(1400);
  readonly fog: HeightFog;
  readonly cloudSea: CloudField;
  /** High tier: the cloud sea as a raymarched volume with self-shadowing and silver linings (the
   *  billboards stay in front of it for flying through). */
  readonly seaVolume: CloudField | null = null;
  readonly stormWalls: Wisps;
  readonly wisps: Wisps;
  readonly rain: Rain;
  readonly stars: Stars;
  readonly lightning = new Lightning();
  readonly dome = new CloudDome();
  /** A bright disc on the sun for the god rays (drawn behind the far clouds). */
  readonly sunMesh = new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      uniforms: { uC: { value: new Color('#ffe2b0') } },
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * 280.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uC; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.24, 0.16, d) * 0.9 + exp(-d * 6.0) * 0.35; gl_FragColor = vec4(uC * a, 1.0); }`,
    }),
  );
  readonly key = new DirectionalLight('#ffe2b0', 2.6);
  readonly rim = new DirectionalLight('#9fb6ff', 1.1);
  readonly hemi = new HemisphereLight('#bcd2ee', '#f2b866', 0.9);
  /** Overrides the altitude used for the look (cinematics); null = the camera's altitude. */
  lookAltitude: number | null = null;
  /** Extra multipliers chapters can tween. */
  fogScale = 1;
  wispScale = 1;
  storminess = 1;
  /** 0..1: bright midday for the playground. */
  dayMix = 0;
  /** 0..1: the reveal. The dusk falls away to a deep night, so the column of light carries the frame. */
  deepen = 0;
  readonly fogColor = new Color();
  private flashGlow = 0;
  weights = layerAt(COLUMN.islands);
  private layer: LayerName | null = null;
  private time = 0;

  constructor(private readonly ctx: CoreContext) {
    const tier = ctx.quality.tier;
    const n = (low: number, med: number, high: number) => (tier === 'low' ? low : tier === 'medium' ? med : high);
    this.sky.setTime(6.6);
    this.sky.setSun(SUN.elevation, SUN.azimuth);
    this.sunMesh.renderOrder = -1450;
    this.sunMesh.frustumCulled = false;
    this.fog = new HeightFog(ctx.engine.scene, { color: '#f1d2a4', density: 0.0016, base: 2280, falloff: 0.05, heightStrength: 0 });

    this.cloudSea = new CloudField({
      mode: 'billboard', count: n(120, 220, 280), base: COLUMN.cloudSea[0], top: COLUMN.cloudSea[1], extent: 700, coverage: 0.85, scale: 64,
      lightDirection: this.sky.sunDirection, lightColor: '#fff3dc', shadowColor: '#a87f88', hazeColor: '#f2b866', silverLining: 0.9, wind: [2, 0, 0.6], seed: 'sea',
    });
    if (tier === 'high') {
      this.seaVolume = new CloudField({
        tier, mode: 'raymarch', base: COLUMN.cloudSea[0] - 25, top: COLUMN.cloudSea[1] + 10, extent: 1500, coverage: 0.62, scale: 95, density: 1.1,
        lightDirection: this.sky.sunDirection, lightColor: '#fff1d6', shadowColor: '#a98490', hazeColor: '#f2b866', silverLining: 0.9, wind: [2, 0, 0.6],
      });
    }
    this.stormWalls = new Wisps(n(40, 70, 100), 'storm', 700, 25, 320, 70, 170);
    this.wisps = new Wisps(n(50, 110, 170), 'wisps');
    this.rain = new Rain(n(700, 1500, 2400));
    this.stars = new Stars(n(1500, 2600, 3600));
    this.lightning.onStrike = (d) => {
      ctx.audio.thunder({ distance: Math.min(1, d) });
      ctx.rig.addTrauma(0.12 * this.storminess);
    };
    this.key.position.copy(this.sky.sunDirection).multiplyScalar(60);
    this.rim.position.set(-40, 30, -50);
    this.dome.uniforms.uSunDir.value = this.sky.sunDirection;
    if (this.seaVolume) this.group.add(this.seaVolume.object);
    this.group.add(this.sky.mesh, this.stars.points, this.sunMesh, this.dome.mesh, this.cloudSea.object, this.stormWalls.mesh, this.wisps.mesh, this.rain.mesh, this.lightning.mesh);
    this.group.add(this.key, this.key.target, this.rim, this.rim.target, this.hemi);
    ctx.engine.setupShadowLight(this.key, 14, 80);
    ctx.engine.scene.add(this.group);
  }

  update(dt: number, camera: Camera, focus: Vector3): void {
    this.time += dt;
    const cam = camera.position;
    this.sky.mesh.position.copy(cam);
    this.stars.points.position.copy(cam);
    this.sky.update(dt);
    const y = this.lookAltitude ?? cam.y;
    const w = (this.weights = layerAt(y));

    const d = this.dayMix;
    const dp = this.deepen;
    const hex = (pick: (l: LayerName) => string, day: string, deep: string) =>
      '#' + mixColor(w, pick, _b).lerp(_a.set(day), d).lerp(_a.set(deep), dp).getHexString();
    this.sky.set({
      zenith: hex((l) => LOOKS[l].zenith, '#3a7bd0', '#080b22'),
      horizon: hex((l) => LOOKS[l].horizon, '#bcd6ef', '#2a1d52'),
      ground: hex((l) => LOOKS[l].ground, '#f4ebdd', '#120c26'),
      stars: 0,
      sunIntensity: mixNum(w, (l) => LOOKS[l].sunIntensity) * (1 - d) + 6 * d,
      sunGlow: 0.9 * w.heights * (1 - d) + 0.6 * d,
    });
    this.stars.uniforms.uOpacity.value = Math.min(1, mixNum(w, (l) => LOOKS[l].stars) + dp * 0.5);
    // The far cloudscape.
    const du = this.dome.uniforms;
    const cl = (pick: (c: CloudLook) => string, out: Color) => mixColor(w, (l) => pick(CLOUD_LOOKS[l]), out).lerp(_a.set(pick(DAY_CLOUDS)), d);
    cl((c) => c.lit, du.uLit.value);
    cl((c) => c.shade, du.uShade.value);
    cl((c) => c.sun, du.uSunCol.value);
    du.uLit.value.lerp(_a.set('#2c2348'), dp);
    du.uShade.value.lerp(_a.set('#090814'), dp);
    du.uHaze.value.copy(this.sky.horizonColor);
    const cn = (pick: (c: CloudLook) => number) => mixNum(w, (l) => pick(CLOUD_LOOKS[l])) * (1 - d) + pick(DAY_CLOUDS) * d;
    du.uSeaOp.value = cn((c) => c.sea);
    du.uHighOp.value = cn((c) => c.high);
    du.uBankOp.value = cn((c) => c.banks);
    du.uStorm.value = Math.min(1, w.storm * 1.25) * this.storminess;
    this.dome.update(dt, camera);
    this.sunMesh.position.copy(cam).addScaledVector(this.sky.sunDirection, 1150);
    this.sunMesh.visible = this.sky.sunDirection.y > -0.05 && w.heights + d > 0.05;
    ((this.sunMesh.material as ShaderMaterial).uniforms.uC!.value as Color).set('#ffe2b0').multiplyScalar(2.2 * (w.heights + d));
    this.stars.uniforms.uTime.value = this.time;
    mixColor(w, (l) => LOOKS[l].fog, this.fogColor).lerp(_a.set('#dbe6f0'), d).lerp(_a.set('#0b0a1a'), dp);
    this.fog.params.color = '#' + this.fogColor.getHexString();
    this.fog.params.density = mixNum(w, (l) => LOOKS[l].fogDensity) * this.fogScale * (1 - d * 0.5);
    this.fog.update();
    this.ctx.engine.exposure = mixNum(w, (l) => LOOKS[l].exposure);
    this.ctx.postfx.params.saturation = mixNum(w, (l) => LOOKS[l].saturation) * (1 - d) + 1.12 * d;

    // Lights follow the focus so shadows stay sharp where it matters.
    this.key.target.position.copy(focus);
    this.key.position.copy(focus).addScaledVector(this.sky.sunDirection, 60);
    this.rim.target.position.copy(focus);
    this.rim.position.copy(focus).add(new Vector3(-40, 30, -50));
    this.key.intensity = 2.8 * w.heights + 0.25 * w.storm + 0.1 * w.night + 0.5 * w.fog + 0.6 * w.underneath;
    this.key.color.set('#ffe2b0').lerp(_a.set('#9aa6d8'), w.storm + w.night).lerp(_b.set('#fff6e8'), d);
    this.key.intensity += d * 0.6;
    this.rim.intensity = 1.2 * w.heights + 0.9 * w.storm + 0.7 * w.night + 0.3 * w.fog + 1.6 * w.underneath;
    this.rim.color.set('#9fb6ff').lerp(_a.set('#ffd79a'), w.underneath);
    this.hemi.intensity = 0.95 * w.heights + 0.35 * w.storm + 0.2 * w.night + 1.1 * w.fog + 0.7 * w.underneath;
    this.hemi.color.set('#bcd2ee').lerp(_a.set('#c9c6c2'), w.fog);
    this.hemi.groundColor.set('#f2b866').lerp(_a.set('#1b1f3a'), w.storm + w.night).lerp(_b.set('#c9c6c2'), w.fog).lerp(_b.set('#f5c76b'), w.underneath);

    // Wisps: cream in the heights, indigo in the storm, white in the fog, none at night.
    const wc = this.wisps.uniforms;
    wc.uCam.value.copy(cam);
    wc.uTime.value = this.time;
    mixColor(w, (l) => ({ heights: '#fff6e8', storm: '#5c66a4', night: '#1a2044', fog: '#e4e1dc', underneath: '#ffe8bd' })[l], wc.uColor.value);
    mixColor(w, (l) => ({ heights: '#f2c99c', storm: '#1c2142', night: '#0a0d1f', fog: '#b4b1ad', underneath: '#e0b878' })[l], wc.uShade.value);
    wc.uOpacity.value = (0.55 * w.heights + 0.95 * w.storm + 0.0 * w.night + 1.0 * w.fog + 0.15 * w.underneath) * this.wispScale;

    this.rain.uniforms.uCam.value.copy(cam);
    this.rain.uniforms.uTime.value = this.time;
    this.rain.uniforms.uOpacity.value = w.storm * this.storminess;
    this.rain.mesh.visible = w.storm > 0.01;

    this.cloudSea.update(dt, camera);
    this.cloudSea.object.visible = cam.y > 2000;
    if (this.seaVolume) {
      const sv = this.seaVolume.params;
      _b.set(this.sky.horizonColor);
      sv.hazeColor = '#' + _b.getHexString();
      sv.lightColor = '#' + mixColor(w, () => '#fff1d6', _b).lerp(_a.set('#ffffff'), d).getHexString();
      sv.shadowColor = '#' + _b.set('#a98490').lerp(_a.set('#a9b8d0'), d).getHexString();
      sv.density = 1.1 * Math.min(1, w.heights + d);
      this.seaVolume.update(dt, camera);
      this.seaVolume.object.visible = cam.y > 1950 && sv.density > 0.01;
      // The far sea on the dome takes over beyond the volume.
    }
    const sw = this.stormWalls.uniforms;
    sw.uCam.value.copy(cam);
    sw.uTime.value = this.time;
    sw.uColor.value.set('#6670ae').lerp(_a.set('#9aa4d8'), this.flashGlow);
    sw.uShade.value.set('#222852');
    sw.uOpacity.value = Math.min(1, w.storm * 1.4) * this.wispScale;
    this.stormWalls.mesh.visible = sw.uOpacity.value > 0.01;
    this.lightning.update(dt, w.storm * this.storminess, cam, camera.getWorldDirection(_fwd));
    this.flashGlow = this.lightning.flash * 0.5;
    du.uFlash.value = this.lightning.flash;
    du.uBolt.value = this.lightning.bolt;
    du.uBoltSeed.value = this.lightning.boltSeed;
    du.uFlashDir.value.copy(this.lightning.at).sub(cam).normalize();
    for (const wp of [sw, wc]) {
      wp.uFlash.value = this.lightning.flash;
      wp.uFlashPos.value.copy(this.lightning.at);
    }

    // The rim light on the visitor: the low sun in the heights, cool sky light in the storm and the
    // night, the arms' light from below at the bottom of the world, plus every lightning strike.
    _rimDir.copy(this.sky.sunDirection).multiplyScalar(w.heights + d);
    _rimDir.addScaledVector(_rimTmp.set(0.2, 0.45, -1).normalize(), (w.storm + w.night + w.fog) * (1 - d));
    _rimDir.addScaledVector(_rimTmp.set(0, -1, 0.25).normalize(), w.underneath * (1 - d));
    if (this.lightning.flash > 0.02) _rimDir.lerp(_rimTmp.copy(this.lightning.at).sub(cam).normalize(), Math.min(1, this.lightning.flash * 1.5));
    RIM.uRimDir.value.copy(_rimDir.normalize()).transformDirection(camera.matrixWorldInverse);
    mixColor(w, (l) => RIM_LOOK[l].color, RIM.uRimColor.value).lerp(_a.set('#fff2d8'), d);
    RIM.uRim.value = mixNum(w, (l) => RIM_LOOK[l].k) * (1 - d) + 0.7 * d + this.lightning.flash * 1.6;

    const dom = dominantLayer(y);
    if (dom !== this.layer) {
      this.layer = dom;
      this.ctx.postfx.setLUT(GRADES_BY_LAYER[dom]);
    }
  }

  /** Force the grade (cinematics); the next layer change re-bakes as usual. */
  setGrade(layer: LayerName): void {
    this.layer = layer;
    this.ctx.postfx.setLUT(GRADES_BY_LAYER[layer]);
  }

  dispose(): void {
    this.sky.dispose();
    this.cloudSea.dispose();
    this.seaVolume?.dispose();
    this.stormWalls.dispose();
    this.wisps.dispose();
    this.rain.dispose();
    this.stars.dispose();
    this.lightning.dispose();
    this.dome.dispose();
    this.sunMesh.geometry.dispose();
    (this.sunMesh.material as ShaderMaterial).dispose();
    this.fog.dispose();
    this.group.removeFromParent();
  }
}
