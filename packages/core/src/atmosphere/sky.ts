import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { glsl } from '../shaders/chunks';

export interface SkyParams {
  zenith: string;
  horizon: string;
  ground: string;
  sun: string;
  /** 0..1 star visibility. */
  stars: number;
  /** Angular size of the sun disc (0.01 small .. 0.06 large). */
  sunSize: number;
  /** Halo strength around the sun. */
  sunGlow: number;
  /** HDR multiplier on the disc so bloom picks it up. */
  sunIntensity: number;
}

interface Key extends SkyParams {
  t: number;
  elevation: number;
}

/** Time-of-day keyframes (hour, colors, sun elevation in degrees). */
const KEYS: Key[] = [
  { t: 0, zenith: '#04050c', horizon: '#0a0d1f', ground: '#07070a', sun: '#cfe0ff', stars: 1, sunSize: 0.02, sunGlow: 0.25, sunIntensity: 1.6, elevation: 55 },
  { t: 5, zenith: '#0a0d1f', horizon: '#2a2440', ground: '#0a0a10', sun: '#ffd9a0', stars: 0.7, sunSize: 0.03, sunGlow: 0.5, sunIntensity: 2, elevation: -6 },
  { t: 6.5, zenith: '#2c3f6b', horizon: '#f2b866', ground: '#3a2c2a', sun: '#ffe9b0', stars: 0.1, sunSize: 0.035, sunGlow: 1, sunIntensity: 4, elevation: 5 },
  { t: 9, zenith: '#4f7fb5', horizon: '#f4ebdd', ground: '#6b6a70', sun: '#fff4da', stars: 0, sunSize: 0.03, sunGlow: 0.7, sunIntensity: 5, elevation: 30 },
  { t: 13, zenith: '#3f74b3', horizon: '#c9dcec', ground: '#74757c', sun: '#fff8e6', stars: 0, sunSize: 0.028, sunGlow: 0.55, sunIntensity: 6, elevation: 65 },
  { t: 17, zenith: '#46689c', horizon: '#f4d9a8', ground: '#5a4c44', sun: '#ffe9b0', stars: 0, sunSize: 0.032, sunGlow: 0.8, sunIntensity: 5, elevation: 22 },
  { t: 18.6, zenith: '#2b3a6a', horizon: '#f2a65a', ground: '#33262a', sun: '#ffc77a', stars: 0.08, sunSize: 0.04, sunGlow: 1.1, sunIntensity: 4, elevation: 4 },
  { t: 20, zenith: '#0d1230', horizon: '#3b2a4a', ground: '#0c0b10', sun: '#ff9e6b', stars: 0.6, sunSize: 0.03, sunGlow: 0.4, sunIntensity: 1.5, elevation: -8 },
  { t: 24, zenith: '#04050c', horizon: '#0a0d1f', ground: '#07070a', sun: '#cfe0ff', stars: 1, sunSize: 0.02, sunGlow: 0.25, sunIntensity: 1.6, elevation: 55 },
];

const FRAG = /* glsl */ `
uniform vec3 uZenith, uHorizon, uGround, uSun, uSunDir;
uniform float uStars, uSunSize, uSunGlow, uSunIntensity, uTime;
varying vec3 vDir;
${glsl.hash}
${glsl.dither}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(smoothstep(0.0, 1.0, max(h, 0.0)), 0.55));
  c = mix(c, uGround, smoothstep(0.0, -0.35, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSun * pow(sd, 6.0) * 0.18 * uSunGlow;
  c += uSun * pow(sd, 48.0) * 0.5 * uSunGlow;
  float disc = smoothstep(1.0 - uSunSize * uSunSize * 0.5, 1.0 - uSunSize * uSunSize * 0.35, sd);
  c += uSun * disc * uSunIntensity;
  if (uStars > 0.001 && h > -0.05){
    vec3 p = d * 220.0;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float r = hash13(id);
    float star = step(0.9965, r) * smoothstep(0.32, 0.0, length(f));
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 60.0);
    c += vec3(0.97, 0.95, 0.92) * star * tw * uStars * smoothstep(-0.05, 0.25, h) * 1.6;
  }
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
}`;

/**
 * Procedural sky: gradient, sun (or moon) disc with halo, twinkling stars, dithered.
 *
 * ```ts
 * const sky = new Sky();
 * scene.add(sky.mesh);
 * sky.setTime(6.5);                 // golden hour; 0 and 24 are deep night
 * light.position.copy(sky.sunDirection).multiplyScalar(50);
 * loop.onFrame((dt) => sky.update(dt));
 * ```
 */
export class Sky {
  readonly mesh: Mesh;
  /** Unit vector pointing at the sun (or moon at night). Use it to place your key light. */
  readonly sunDirection = new Vector3(0, 1, 0);
  /** Compass angle of the sun in radians. */
  azimuth = -0.6;
  private mat: ShaderMaterial;
  private hour = 12;

  constructor(radius = 900) {
    this.mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uGround: { value: new Color() },
        uSun: { value: new Color() }, uSunDir: { value: this.sunDirection },
        uStars: { value: 0 }, uSunSize: { value: 0.03 }, uSunGlow: { value: 0.6 }, uSunIntensity: { value: 4 }, uTime: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: FRAG,
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 32, 20), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2000;
    this.mesh.name = 'Sky';
    this.setTime(12);
  }

  /** Set the time of day, 0..24. Colors, star visibility and sun elevation interpolate between keys. */
  setTime(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
    let a = KEYS[0]!;
    let b = KEYS[KEYS.length - 1]!;
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (this.hour >= KEYS[i]!.t && this.hour <= KEYS[i + 1]!.t) {
        a = KEYS[i]!;
        b = KEYS[i + 1]!;
        break;
      }
    }
    const k = b.t === a.t ? 0 : (this.hour - a.t) / (b.t - a.t);
    const u = this.mat.uniforms;
    const mix = (name: string, ca: string, cb: string) => (u[name]!.value as Color).set(ca).lerp(_c.set(cb), k);
    mix('uZenith', a.zenith, b.zenith);
    mix('uHorizon', a.horizon, b.horizon);
    mix('uGround', a.ground, b.ground);
    mix('uSun', a.sun, b.sun);
    const num = (key: 'stars' | 'sunSize' | 'sunGlow' | 'sunIntensity' | 'elevation') => a[key] + (b[key] - a[key]) * k;
    u.uStars!.value = num('stars');
    u.uSunSize!.value = num('sunSize');
    u.uSunGlow!.value = num('sunGlow');
    u.uSunIntensity!.value = num('sunIntensity');
    this.setSun(num('elevation'), this.azimuth);
  }
  get time(): number {
    return this.hour;
  }

  /** Place the sun by elevation (degrees above the horizon) and azimuth (radians). */
  setSun(elevationDeg: number, azimuth = this.azimuth): void {
    this.azimuth = azimuth;
    const e = (elevationDeg * Math.PI) / 180;
    this.sunDirection.set(Math.sin(azimuth) * Math.cos(e), Math.sin(e), Math.cos(azimuth) * Math.cos(e)).normalize();
  }

  /** Override any colors or amounts directly (room palettes). */
  set(params: Partial<SkyParams>): void {
    const u = this.mat.uniforms;
    if (params.zenith) (u.uZenith!.value as Color).set(params.zenith);
    if (params.horizon) (u.uHorizon!.value as Color).set(params.horizon);
    if (params.ground) (u.uGround!.value as Color).set(params.ground);
    if (params.sun) (u.uSun!.value as Color).set(params.sun);
    if (params.stars !== undefined) u.uStars!.value = params.stars;
    if (params.sunSize !== undefined) u.uSunSize!.value = params.sunSize;
    if (params.sunGlow !== undefined) u.uSunGlow!.value = params.sunGlow;
    if (params.sunIntensity !== undefined) u.uSunIntensity!.value = params.sunIntensity;
  }
  /** Current horizon color, handy for matching fog to the sky. */
  get horizonColor(): Color {
    return this.mat.uniforms.uHorizon!.value as Color;
  }

  update(dt: number): void {
    this.mat.uniforms.uTime!.value += dt;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
const _c = new Color();
