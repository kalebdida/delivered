import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
} from 'three';
import { seededRandom } from '../math/random';
import { glsl } from '../shaders/chunks';

export interface LightShaftOptions {
  color?: string;
  /** Length of the beam along -Y (it shines downward from the group's origin). */
  length?: number;
  radiusTop?: number;
  radiusBottom?: number;
  /** 0..1+ brightness. */
  intensity?: number;
  /** Number of dust motes drifting in the beam (0 disables). */
  motes?: number;
  seed?: number | string;
}

const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity, uTime;
varying vec3 vNormalV; varying vec3 vViewV; varying vec2 vUv; varying vec3 vWorld;
${glsl.hash}
${glsl.dither}
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1.,0.)), f.x), mix(hash12(i+vec2(0.,1.)), hash12(i+vec2(1.)), f.x), f.y); }
void main(){
  // Soft edges: brightest where we look through the thick middle of the cone.
  float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
  float edge = pow(facing, 2.2);
  // Streaks that slide slowly around and down the beam.
  float streak = 0.55 + 0.45 * vnoise(vec2(vUv.x * 26.0 + uTime * 0.03, vUv.y * 1.5 - uTime * 0.02));
  float fine = 0.8 + 0.2 * vnoise(vec2(vUv.x * 90.0 - uTime * 0.05, vUv.y * 4.0));
  // Fade at the source and toward the far end.
  float along = smoothstep(0.0, 0.08, 1.0 - vUv.y) * mix(0.18, 1.0, pow(vUv.y, 0.6));
  float a = edge * streak * fine * along * uIntensity;
  gl_FragColor = vec4(uColor * a + dither(gl_FragCoord.xy), a);
}`;

const MOTE_VERT = /* glsl */ `
uniform float uTime, uLength, uRTop, uRBottom, uPixelRatio;
attribute vec4 aSeed;
varying float vAlpha;
void main(){
  float t = fract(aSeed.x + uTime * 0.012 * (0.4 + aSeed.y));
  float y = -t * uLength;
  float r = mix(uRTop, uRBottom, t) * sqrt(aSeed.z) * 0.92;
  float ang = aSeed.w * 6.2831 + uTime * 0.08 * (aSeed.y - 0.5) + sin(uTime * 0.3 + aSeed.x * 40.0) * 0.3;
  vec3 p = vec3(cos(ang) * r, y + sin(uTime * 0.5 + aSeed.w * 30.0) * 0.06, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + aSeed.y * 2.0) + aSeed.x * 90.0);
  vAlpha = smoothstep(0.0, 0.1, t) * smoothstep(1.0, 0.8, t) * (0.25 + 0.75 * tw);
  gl_PointSize = (1.5 + 3.0 * aSeed.y) * uPixelRatio * (6.0 / max(-mv.z, 0.5));
}`;

/**
 * A volumetric light shaft (GAIN's moonbeam) with drifting dust motes. The beam is a soft
 * additive cone; no shadow maps or ray marching, so it is cheap on every tier.
 *
 * ```ts
 * const beam = new LightShaft({ color: '#CFE0FF', length: 6, radiusTop: 0.3, radiusBottom: 1.4 });
 * beam.group.position.set(0, 5, 0);       // the source; it shines toward -Y
 * beam.group.rotation.z = 0.4;            // tilt it
 * scene.add(beam.group);
 * loop.onFrame((dt) => beam.update(dt));
 * ```
 */
export class LightShaft {
  readonly group = new Group();
  private beamMat: ShaderMaterial;
  private moteMat: ShaderMaterial | null = null;
  private time = 0;

  constructor(opts: LightShaftOptions = {}) {
    const length = opts.length ?? 6;
    const rTop = opts.radiusTop ?? 0.3;
    const rBottom = opts.radiusBottom ?? 1.4;
    const color = new Color(opts.color ?? '#CFE0FF');
    this.beamMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: color }, uIntensity: { value: opts.intensity ?? 0.5 }, uTime: { value: 0 } },
      vertexShader: `varying vec3 vNormalV; varying vec3 vViewV; varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vNormalV = normalMatrix * normal; vViewV = -mv.xyz;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: BEAM_FRAG,
    });
    const geo = new CylinderGeometry(rTop, rBottom, length, 48, 1, true);
    geo.translate(0, -length / 2, 0);
    const beam = new Mesh(geo, this.beamMat);
    beam.renderOrder = 10;
    this.group.add(beam);

    const count = opts.motes ?? 260;
    if (count > 0) {
      const rng = seededRandom(opts.seed ?? 'motes');
      const seeds = new Float32Array(count * 4);
      for (let i = 0; i < seeds.length; i++) seeds[i] = rng();
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('aSeed', new BufferAttribute(seeds, 4));
      this.moteMat = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 }, uLength: { value: length }, uRTop: { value: rTop }, uRBottom: { value: rBottom },
          uColor: { value: color }, uIntensity: { value: opts.intensity ?? 0.5 },
          uPixelRatio: { value: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) },
        },
        vertexShader: MOTE_VERT,
        fragmentShader: `uniform vec3 uColor; uniform float uIntensity; varying float vAlpha;
          void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
          gl_FragColor = vec4(uColor * a * vAlpha * (0.6 + uIntensity), a * vAlpha); }`,
      });
      const pts = new Points(g, this.moteMat);
      pts.frustumCulled = false;
      pts.renderOrder = 11;
      this.group.add(pts);
    }
  }

  /** Brightness 0..1+ (tween this to "open" the beam). */
  set intensity(v: number) {
    this.beamMat.uniforms.uIntensity!.value = v;
    if (this.moteMat) this.moteMat.uniforms.uIntensity!.value = v;
  }
  get intensity(): number {
    return this.beamMat.uniforms.uIntensity!.value;
  }
  set color(hex: string) {
    (this.beamMat.uniforms.uColor!.value as Color).set(hex);
  }

  update(dt: number): void {
    this.time += dt;
    this.beamMat.uniforms.uTime!.value = this.time;
    if (this.moteMat) this.moteMat.uniforms.uTime!.value = this.time;
  }

  dispose(): void {
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.beamMat.dispose();
    this.moteMat?.dispose();
    this.group.removeFromParent();
  }
}
