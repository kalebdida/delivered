import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Data3DTexture,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  RGFormat,
  ShaderMaterial,
  Vector3,
  type Camera,
  type Object3D,
} from 'three';
import { seededRandom } from '../math/random';
import { QUALITY_BUDGETS, type QualityTier } from '../quality';
import { glsl } from '../shaders/chunks';

export interface CloudParams {
  /** World Y of the bottom of the cloud layer. */
  base: number;
  /** World Y of the top of the cloud layer. */
  top: number;
  /** Half-size of the field on X and Z (billboards wrap inside it; the raymarch fades at it). */
  extent: number;
  /** 0 (clear) .. 1 (overcast). */
  coverage: number;
  /** Overall opacity multiplier. */
  density: number;
  /** Lit color (sun side). */
  lightColor: string;
  /** Shadow color (far side and undersides). */
  shadowColor: string;
  /** Color the clouds fade toward with distance (match the sky's horizon). */
  hazeColor: string;
  /** Wind in world units per second. */
  wind: [number, number, number];
  /** Feature size in world units (bigger is broader, calmer shapes). */
  scale: number;
  /** Strength of the bright rim when looking toward the light. */
  silverLining: number;
}

export interface CloudOptions extends Partial<CloudParams> {
  /** Quality tier (decides billboard vs raymarch unless `mode` is given). */
  tier?: QualityTier;
  mode?: 'billboard' | 'raymarch';
  /** Number of billboards (default scales with tier). */
  count?: number;
  /** Direction TO the light (unit vector). Shared by reference: mutate it to move the sun. */
  lightDirection?: Vector3;
  seed?: number | string;
}

const DEFAULTS: CloudParams = {
  base: -20, top: 10, extent: 220, coverage: 0.55, density: 1,
  lightColor: '#fff4da', shadowColor: '#7b88ad', hazeColor: '#f2b866',
  wind: [1.2, 0, 0.4], scale: 60, silverLining: 0.6,
};

// ---------------------------------------------------------------------------------------------
// Tiling 3D noise texture for the raymarcher (R = shape fbm, G = wispy detail)
// ---------------------------------------------------------------------------------------------

let noiseTex: Data3DTexture | null = null;
let noiseUsers = 0;

/** Build (once) the tiling 3D noise volume used by raymarched clouds. Exported for custom shaders. */
export function cloudNoiseTexture(size = 48): Data3DTexture {
  if (noiseTex) return noiseTex;
  const rng = seededRandom('cloud-noise');
  const table = new Float32Array(4096);
  for (let i = 0; i < table.length; i++) table[i] = rng();
  const h = (x: number, y: number, z: number, p: number) =>
    table[((((x % p) + p) % p) * 73 + (((y % p) + p) % p) * 157 + (((z % p) + p) % p) * 311) & 4095]!;
  const sm = (t: number) => t * t * (3 - 2 * t);
  const value = (x: number, y: number, z: number, p: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(h(ix, iy, iz, p), h(ix + 1, iy, iz, p), fx), l(h(ix, iy + 1, iz, p), h(ix + 1, iy + 1, iz, p), fx), fy),
      l(l(h(ix, iy, iz + 1, p), h(ix + 1, iy, iz + 1, p), fx), l(h(ix, iy + 1, iz + 1, p), h(ix + 1, iy + 1, iz + 1, p), fx), fy),
      fz,
    );
  };
  const data = new Uint8Array(size * size * size * 2);
  let o = 0;
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, w = z / size;
        let shape = 0, amp = 0.5, norm = 0;
        for (let oct = 0, p = 4; oct < 4; oct++, p *= 2) {
          shape += amp * value(u * p, v * p, w * p, p);
          norm += amp;
          amp *= 0.5;
        }
        shape /= norm;
        let detail = 0;
        amp = 0.5;
        norm = 0;
        for (let oct = 0, p = 12; oct < 2; oct++, p *= 2) {
          detail += amp * Math.abs(value(u * p + 5, v * p + 9, w * p + 3, p) * 2 - 1);
          norm += amp;
          amp *= 0.5;
        }
        data[o++] = Math.round(Math.min(1, Math.max(0, (shape - 0.2) / 0.6)) * 255);
        data[o++] = Math.round((1 - detail / norm) * 255);
      }
    }
  }
  noiseTex = new Data3DTexture(data, size, size, size);
  noiseTex.format = RGFormat;
  noiseTex.minFilter = noiseTex.magFilter = LinearFilter;
  noiseTex.wrapS = noiseTex.wrapT = noiseTex.wrapR = RepeatWrapping;
  noiseTex.unpackAlignment = 1;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

// ---------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------

const RAYMARCH_FRAG = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uNoise;
uniform vec3 uLightDir, uLightColor, uShadowColor, uHazeColor, uWind;
uniform float uBase, uTop, uExtent, uCoverage, uDensity, uScale, uSilver, uTime;
varying vec3 vRay;
${glsl.hash}
${glsl.dither}
float density(vec3 p, bool cheap){
  float h = (p.y - uBase) / (uTop - uBase);
  if (h < 0.0 || h > 1.0) return 0.0;
  float hg = smoothstep(0.0, 0.22, h) * smoothstep(1.0, 0.45, h);
  vec3 q = (p + uWind * uTime) / uScale;
  float shape = texture(uNoise, q * 0.35).r;
  float d = shape * hg - (1.0 - uCoverage) * 0.85;
  if (d <= 0.0) return 0.0;
  if (!cheap){
    float det = texture(uNoise, q * 1.9 + vec3(0.0, uTime * 0.004, 0.0)).g;
    d -= (1.0 - det) * 0.22 * (1.0 - smoothstep(0.0, 0.5, d));
  }
  float edge = 1.0 - smoothstep(uExtent * 0.75, uExtent, length(p.xz - cameraPosition.xz));
  return max(d, 0.0) * uDensity * edge;
}
void main(){
  vec3 rd = normalize(vRay);
  vec3 ro = cameraPosition;
  // Intersect the horizontal slab [uBase, uTop].
  float t0, t1;
  if (abs(rd.y) < 1e-4){
    if (ro.y < uBase || ro.y > uTop) discard;
    t0 = 0.0; t1 = uExtent;
  } else {
    float a = (uBase - ro.y) / rd.y, b = (uTop - ro.y) / rd.y;
    t0 = max(min(a, b), 0.0); t1 = min(max(a, b), uExtent * 1.5);
  }
  if (t1 <= t0) discard;
  float stepLen = (t1 - t0) / float(STEPS);
  float t = t0 + stepLen * hash12(gl_FragCoord.xy + fract(uTime) * 61.0);
  float trans = 1.0;
  vec3 col = vec3(0.0);
  float cosT = dot(rd, uLightDir);
  float phase = mix(0.6, 1.0 + 2.2 * pow(max(cosT, 0.0), 8.0), uSilver);
  for (int i = 0; i < STEPS; i++){
    vec3 p = ro + rd * t;
    float d = density(p, false);
    if (d > 0.002){
      float od = 0.0;
      float ls = (uTop - uBase) * 0.14;
      for (int j = 1; j <= LIGHT_STEPS; j++) od += density(p + uLightDir * ls * float(j), true);
      float lightT = exp(-od * ls * 0.09);
      float powder = 1.0 - exp(-d * 6.0);
      vec3 lit = mix(uShadowColor, uLightColor * phase, lightT * mix(1.0, powder, 0.35));
      float hgt = clamp((p.y - uBase) / (uTop - uBase), 0.0, 1.0);
      lit = mix(lit * 0.82, lit, hgt);
      float haze = 1.0 - exp(-t / (uExtent * 0.55));
      lit = mix(lit, uHazeColor, haze * 0.75);
      float a = 1.0 - exp(-d * stepLen * 0.11);
      col += lit * a * trans;
      trans *= 1.0 - a;
      if (trans < 0.02) break;
    }
    t += stepLen;
  }
  float alpha = 1.0 - trans;
  gl_FragColor = vec4(col + dither(gl_FragCoord.xy) * alpha, alpha);
}`;

const BILLBOARD_VERT = /* glsl */ `
attribute vec3 aOffset; attribute vec4 aSeed;
uniform vec3 uWind, uCenter; uniform float uTime, uExtent, uBase, uTop;
varying vec2 vUv; varying vec4 vSeed; varying float vDepth; varying float vHeight; varying float vEdge;
void main(){
  vec3 c = aOffset + uWind * uTime;
  // Wrap around the field centre so the layer is endless.
  c.xz = mod(c.xz - uCenter.xz + uExtent, uExtent * 2.0) - uExtent + uCenter.xz;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float s = aSeed.x;
  float rot = aSeed.y * 6.2831;
  vec2 corner = position.xy;
  corner = vec2(cos(rot) * corner.x - sin(rot) * corner.y, sin(rot) * corner.x + cos(rot) * corner.y);
  mv.xy += corner * s * vec2(1.0, 0.62);
  vUv = position.xy;
  vSeed = aSeed;
  vDepth = -mv.z;
  vEdge = length(c.xz - uCenter.xz) / uExtent;
  vHeight = clamp((c.y - uBase) / max(uTop - uBase, 0.001), 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const BILLBOARD_FRAG = /* glsl */ `
uniform vec3 uLightColor, uShadowColor, uHazeColor, uLightView;
uniform float uTime, uDensity, uExtent, uSilver, uCoverage;
varying vec2 vUv; varying vec4 vSeed; varying float vDepth; varying float vHeight; varying float vEdge;
${glsl.hash}
${glsl.dither}
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.,0.)), f.x), mix(hash12(i+vec2(0.,1.)), hash12(i+vec2(1.)), f.x), f.y); }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main(){
  vec2 uv = vUv * 2.0;
  float r = length(uv);
  if (r > 1.0) discard;
  float n = fbm2(uv * 1.6 + vSeed.z * 40.0 + uTime * 0.012);
  float body = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.9);
  float a = body * body * (0.35 + 0.65 * uCoverage) * uDensity * vSeed.w;
  // Fake a rounded normal for lighting.
  vec3 nrm = normalize(vec3(uv + (n - 0.5) * 0.6, sqrt(max(1.0 - r * r, 0.0)) + 0.35));
  float ndl = dot(nrm, normalize(uLightView));
  float lit = smoothstep(-0.55, 0.9, ndl);
  vec3 col = mix(uShadowColor, uLightColor, lit * (0.55 + 0.45 * vHeight));
  // Silver lining: thin edges glow when the light is behind the cloud.
  float back = max(-normalize(uLightView).z, 0.0);
  col += uLightColor * pow(1.0 - body, 2.0) * body * 2.2 * back * uSilver;
  col = mix(col, uHazeColor, (1.0 - exp(-vDepth / (uExtent * 0.6))) * 0.7);
  // Depth fade: sprites dissolve instead of clipping when the camera flies through them,
  // and fade out toward the edge of the field so wrapping is never visible.
  a *= smoothstep(0.5, 6.0 + vSeed.x * 0.15, vDepth) * (1.0 - smoothstep(0.72, 0.98, vEdge));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a + dither(gl_FragCoord.xy) * a, a);
}`;

/**
 * Volumetric cloud field.
 *
 * - High tier: a raymarched slab with self-shadowing, silver linings and aerial haze.
 * - Medium and low: layered soft billboards with fake rounded lighting and depth fade.
 *
 * Both modes share the same parameters and look related, so a room designs once.
 * The raymarched layer renders as a backdrop (drawn after the sky, before everything else), so
 * solid objects always appear in front of it. To pass *through* cloud, add a second
 * `CloudField({ mode: 'billboard' })` for wisps: billboards depth-test against the scene and
 * dissolve as the camera reaches them.
 *
 * ```ts
 * const clouds = new CloudField({ tier: quality.tier, base: -30, top: -5, coverage: 0.6,
 *   lightDirection: sky.sunDirection, hazeColor: '#F2B866' });
 * scene.add(clouds.object);
 * clouds.params.coverage = 0.8;      // every param is live
 * loop.onFrame((dt) => clouds.update(dt, camera));
 * ```
 */
export class CloudField {
  readonly object: Object3D;
  readonly params: CloudParams;
  readonly mode: 'billboard' | 'raymarch';
  /** Direction to the light. Shared by reference when passed in the options. */
  readonly lightDirection: Vector3;
  private mat: ShaderMaterial;
  private time = 0;
  private offsets: Float32Array | null = null;
  private seeds: Float32Array | null = null;
  private order: Uint32Array | null = null;
  private sortTimer = 0;
  private count = 0;
  private readonly _inv = new Matrix4();
  private readonly _v = new Vector3();

  constructor(opts: CloudOptions = {}) {
    const tier = opts.tier ?? 'medium';
    this.params = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS) as (keyof CloudParams)[]) {
      if (opts[k] !== undefined) (this.params as unknown as Record<string, unknown>)[k] = opts[k];
    }
    this.mode = opts.mode ?? QUALITY_BUDGETS[tier].clouds;
    this.lightDirection = opts.lightDirection ?? new Vector3(0.4, 0.7, 0.3).normalize();
    const common = {
      uLightColor: { value: new Color() }, uShadowColor: { value: new Color() }, uHazeColor: { value: new Color() },
      uWind: { value: new Vector3() }, uTime: { value: 0 }, uBase: { value: 0 }, uTop: { value: 1 },
      uExtent: { value: 1 }, uCoverage: { value: 0.5 }, uDensity: { value: 1 }, uSilver: { value: 0.6 },
    };

    if (this.mode === 'raymarch') {
      noiseUsers++;
      const b = QUALITY_BUDGETS[tier];
      this.mat = new ShaderMaterial({
        defines: { STEPS: Math.max(24, b.raymarchSteps || 40), LIGHT_STEPS: Math.max(3, b.cloudLightSteps || 4) },
        uniforms: {
          ...common, uNoise: { value: cloudNoiseTexture() }, uLightDir: { value: this.lightDirection },
          uScale: { value: 60 }, uInvViewProj: { value: new Matrix4() },
        },
        vertexShader: `uniform mat4 uInvViewProj; varying vec3 vRay;
          void main(){ vec4 w = uInvViewProj * vec4(position.xy, 1.0, 1.0); vRay = w.xyz / w.w - cameraPosition; gl_Position = vec4(position.xy, 1.0, 1.0); }`,
        fragmentShader: RAYMARCH_FRAG,
        depthTest: false,
        depthWrite: false,
        transparent: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        fog: false,
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
      const mesh = new Mesh(g, this.mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1000;
      mesh.onBeforeRender = (_r, _s, camera) => {
        this._inv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();
        (this.mat.uniforms.uInvViewProj!.value as Matrix4).copy(this._inv);
      };
      this.object = mesh;
    } else {
      const count = (this.count = opts.count ?? (tier === 'low' ? 90 : tier === 'medium' ? 180 : 260));
      const rng = seededRandom(opts.seed ?? 'clouds');
      const p = this.params;
      this.offsets = new Float32Array(count * 3);
      this.seeds = new Float32Array(count * 4);
      this.order = new Uint32Array(count);
      for (let i = 0; i < count; i++) {
        // Cluster puffs into banks: pick a bank centre, scatter around it.
        const bank = Math.floor(rng() * Math.max(6, count / 9));
        const br = seededRandom(`bank${bank}${opts.seed ?? ''}`);
        const bx = br.range(-p.extent, p.extent);
        const bz = br.range(-p.extent, p.extent);
        const spread = p.extent * 0.16;
        this.offsets[i * 3] = bx + rng.gauss() * spread;
        this.offsets[i * 3 + 1] = p.base + (p.top - p.base) * (0.15 + 0.7 * Math.pow(rng(), 1.6));
        this.offsets[i * 3 + 2] = bz + rng.gauss() * spread * 0.7;
        this.seeds[i * 4] = p.scale * rng.range(0.55, 1.35);
        this.seeds[i * 4 + 1] = rng.range(-0.08, 0.08);
        this.seeds[i * 4 + 2] = rng();
        this.seeds[i * 4 + 3] = rng.range(0.55, 1);
        this.order[i] = i;
      }
      const g = new InstancedBufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.setAttribute('aOffset', new InstancedBufferAttribute(this.offsets.slice(), 3).setUsage(DynamicDrawUsage));
      g.setAttribute('aSeed', new InstancedBufferAttribute(this.seeds.slice(), 4).setUsage(DynamicDrawUsage));
      g.instanceCount = count;
      this.mat = new ShaderMaterial({
        uniforms: { ...common, uCenter: { value: new Vector3() }, uLightView: { value: new Vector3() } },
        vertexShader: BILLBOARD_VERT,
        fragmentShader: BILLBOARD_FRAG,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        fog: false,
      });
      const mesh = new Mesh(g, this.mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      this.object = mesh;
    }
    this.object.name = `CloudField:${this.mode}`;
    this.push();
  }

  private push(): void {
    const u = this.mat.uniforms;
    const p = this.params;
    (u.uLightColor!.value as Color).set(p.lightColor);
    (u.uShadowColor!.value as Color).set(p.shadowColor);
    (u.uHazeColor!.value as Color).set(p.hazeColor);
    (u.uWind!.value as Vector3).set(p.wind[0], p.wind[1], p.wind[2]);
    u.uBase!.value = p.base;
    u.uTop!.value = p.top;
    u.uExtent!.value = p.extent;
    u.uCoverage!.value = p.coverage;
    u.uDensity!.value = p.density;
    u.uSilver!.value = p.silverLining;
    if (u.uScale) u.uScale.value = p.scale;
    u.uTime!.value = this.time;
  }

  /** Advance wind and push params. Call once per frame. */
  update(dt: number, camera: Camera): void {
    this.time += dt;
    this.push();
    if (this.mode !== 'billboard') return;
    const u = this.mat.uniforms;
    (u.uCenter!.value as Vector3).copy(camera.position);
    (u.uLightView!.value as Vector3).copy(this.lightDirection).transformDirection(camera.matrixWorldInverse);
    // Re-sort back to front a few times a second (cheap for a few hundred sprites).
    this.sortTimer -= dt;
    if (this.sortTimer <= 0) {
      this.sortTimer = 0.25;
      this.sort(camera);
    }
  }

  private sort(camera: Camera): void {
    const off = this.offsets!;
    const seeds = this.seeds!;
    const order = this.order!;
    const p = this.params;
    const e = p.extent;
    const dist = new Float32Array(this.count);
    camera.getWorldDirection(this._v);
    const wrap = (v: number, c: number) => ((((v - c + e) % (2 * e)) + 2 * e) % (2 * e)) - e;
    for (let i = 0; i < this.count; i++) {
      const x = wrap(off[i * 3]! + p.wind[0] * this.time, camera.position.x);
      const z = wrap(off[i * 3 + 2]! + p.wind[2] * this.time, camera.position.z);
      const y = off[i * 3 + 1]! + p.wind[1] * this.time - camera.position.y;
      dist[i] = x * this._v.x + y * this._v.y + z * this._v.z;
    }
    order.sort((a, b) => dist[b]! - dist[a]!);
    const g = (this.object as Mesh).geometry as InstancedBufferGeometry;
    const ao = g.getAttribute('aOffset') as InstancedBufferAttribute;
    const as = g.getAttribute('aSeed') as InstancedBufferAttribute;
    for (let i = 0; i < this.count; i++) {
      const s = order[i]!;
      ao.setXYZ(i, off[s * 3]!, off[s * 3 + 1]!, off[s * 3 + 2]!);
      as.setXYZW(i, seeds[s * 4]!, seeds[s * 4 + 1]!, seeds[s * 4 + 2]!, seeds[s * 4 + 3]!);
    }
    ao.needsUpdate = true;
    as.needsUpdate = true;
  }

  dispose(): void {
    (this.object as Mesh).geometry.dispose();
    this.mat.dispose();
    this.object.removeFromParent();
    if (this.mode === 'raymarch' && --noiseUsers <= 0) {
      noiseTex?.dispose();
      noiseTex = null;
      noiseUsers = 0;
    }
  }
}
