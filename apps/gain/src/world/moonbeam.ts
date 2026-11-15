// The moonbeam: the only true light in the cell, and the hero of the room.
//
// High tier: a raymarched volume. Moonlight is parallel, so every sample point is traced back
// along the beam to the window's outer face, its bars and its inner face; the light is the
// window's shape with the bars' shadows in it, filled with slow drifting haze.
// Medium and low: the core's cone (`LightShaft`) for the shaft, with the same motes.
// Every tier: a spot light from outside the window (with shadows where the tier allows, so the
// bars fall across the floor), a soft scatter decal on the floor, a faint cool bounce, and dust
// motes that only show where the light catches them.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { LightShaft, glsl, seededRandom, type QualityTier as Tier } from '@delivered/core';
import { BEAM_DIR, BEAM_FLOOR, BEAM_LENGTH, BEAM_ORIGIN, CELL, WINDOW } from './layout';

const MOON = '#CFE0FF';

/** GLSL: the window's light mask at a world point (1 inside the lit beam, 0 in shadow). */
const MASK_GLSL = /* glsl */ `
uniform vec3 uDir; uniform vec4 uWin; uniform vec3 uPlanes; uniform vec3 uBarX; uniform float uBarR;
float gainRect(vec2 q, vec2 hs, float soft){ vec2 d = abs(q) - hs; return 1.0 - smoothstep(-soft, soft, max(d.x, d.y)); }
vec2 gainBack(vec3 p, float z){ float t = (p.z - z) / uDir.z; return (p - uDir * t).xy - uWin.xy; }
float windowMask(vec3 p){
  float tb = max(p.z - uPlanes.x, 0.0) / uDir.z;
  float soft = 0.006 + tb * 0.009;
  float m = gainRect(gainBack(p, uPlanes.y), uWin.zw, soft);
  vec2 qb = gainBack(p, uPlanes.z);
  float bs = soft * 0.7;
  m *= smoothstep(uBarR, uBarR + bs, abs(qb.x - uBarX.x));
  m *= smoothstep(uBarR, uBarR + bs, abs(qb.x - uBarX.y));
  m *= smoothstep(uBarR, uBarR + bs, abs(qb.x - uBarX.z));
  m *= smoothstep(0.012, 0.012 + bs, abs(qb.y - 0.02));
  return m * step(uPlanes.x, p.z) * step(0.0, p.y);
}
`;

const VOLUME_FRAG = /* glsl */ `
#define FBM_OCTAVES 2
uniform vec3 uCam, uColor; uniform mat4 uInv; uniform float uIntensity, uTime, uLen, uHaze;
varying vec3 vWorld;
${glsl.hash}
${glsl.simplex3D}
${glsl.fbm}
${glsl.dither}
${MASK_GLSL}
void main(){
  vec3 ro = uCam; vec3 rd = normalize(vWorld - uCam);
  vec3 lo = (uInv * vec4(ro, 1.0)).xyz; vec3 ld = (uInv * vec4(rd, 0.0)).xyz;
  vec3 inv = 1.0 / ld; vec3 a = (-0.5 - lo) * inv; vec3 b = (0.5 - lo) * inv;
  vec3 mn = min(a, b); vec3 mx = max(a, b);
  float tn = max(max(max(mn.x, mn.y), mn.z), 0.0);
  float tf = min(min(mx.x, mx.y), mx.z);
  if (rd.y < 0.0) tf = min(tf, -ro.y / rd.y);
  if (rd.z < 0.0) tf = min(tf, (uPlanes.x - ro.z) / rd.z);
  if (tf <= tn) discard;
  float stepL = (tf - tn) / float(STEPS);
  float jitter = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 61.0);
  float acc = 0.0;
  for (int i = 0; i < STEPS; i++){
    vec3 p = ro + rd * (tn + (float(i) + jitter) * stepL);
    float m = windowMask(p);
    if (m > 0.002) {
      float along = clamp((p.z - uPlanes.x) / uDir.z / uLen, 0.0, 1.0);
      vec3 q = p * vec3(2.3, 1.7, 2.3) + vec3(uTime * 0.025, uTime * 0.04, -uTime * 0.03);
      float n = fbm(q);
      float haze = mix(1.0, 0.62 + 0.75 * smoothstep(-0.45, 0.65, n), uHaze);
      // Brightest just inside the window, settling toward the floor, with a little pooling low.
      float fall = mix(1.15, 0.6, along) + 0.35 * smoothstep(0.55, 0.0, p.y);
      acc += m * haze * fall * stepL;
    }
  }
  float c = dot(uDir, -rd);
  float g = 0.42;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
  vec3 col = uColor * acc * uIntensity * (0.35 + phase * 0.55);
  gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
}`;

const DECAL_FRAG = /* glsl */ `
uniform vec3 uColor, uFloor; uniform float uIntensity, uTime; varying vec3 vWorld;
${glsl.hash}
${glsl.dither}
${MASK_GLSL}
void main(){
  // The lit window on the floor, plus a wide soft scatter around it (the dusty air glowing).
  float m = windowMask(vWorld + vec3(0.0, 0.002, 0.0));
  float r = length((vWorld - uFloor).xz * vec2(0.9, 1.1));
  float glow = exp(-r * 2.4) * 0.22 + exp(-r * 6.0) * 0.12;
  vec3 col = uColor * (m * 0.12 + glow) * uIntensity;
  gl_FragColor = vec4(col + dither(gl_FragCoord.xy), 1.0);
}`;

const MOTE_VERT = /* glsl */ `
uniform float uTime, uPixelRatio, uPull, uLen; uniform vec3 uPullTarget, uOrigin, uAxisX, uAxisZ;
attribute vec4 aSeed; attribute vec3 aBase;
varying float vLit; varying float vTw; varying float vPull;
${MASK_GLSL}
void main(){
  // Drift inside the beam's box: slow fall along the light, lazy sideways wander.
  float along = fract(aSeed.x + uTime * 0.006 * (0.4 + aSeed.y));
  vec3 p = uOrigin + uDir * (along * uLen)
    + uAxisX * (aBase.x + sin(uTime * 0.21 + aSeed.w * 40.0) * 0.05)
    + uAxisZ * (aBase.z + cos(uTime * 0.17 + aSeed.z * 30.0) * 0.05);
  p.y += sin(uTime * 0.5 + aSeed.w * 20.0) * 0.03;
  // After many tries the motes lean toward the visitor (CH1): a slow, gentle pull.
  float k = uPull * smoothstep(0.0, 1.0, aSeed.y * 0.7 + 0.3);
  vec3 toT = uPullTarget + vec3(sin(aSeed.x * 50.0 + uTime * 0.4), cos(aSeed.z * 40.0 + uTime * 0.3) * 0.6 + 0.4, sin(aSeed.w * 60.0)) * 0.35;
  p = mix(p, toT, k * 0.85);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vLit = max(windowMask(p), k * 0.9);
  vPull = k;
  vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed.y * 1.6) + aSeed.x * 90.0);
  float big = step(0.93, aSeed.z);
  gl_PointSize = (1.6 + 2.8 * aSeed.y + big * 6.0) * uPixelRatio * (5.5 / max(-mv.z, 0.4));
}`;

const MOTE_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity; varying float vLit; varying float vTw; varying float vPull;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  float lit = 0.035 + vLit;
  vec3 c = mix(uColor, vec3(1.0, 0.92, 0.75), vPull * 0.5);
  gl_FragColor = vec4(c * a * lit * vTw * uIntensity * 2.8, 1.0);
}`;

export class Moonbeam {
  readonly group = new Group();
  readonly spot: SpotLight;
  readonly bounce: PointLight;
  readonly scatter: PointLight;
  /** Where the motes drift when pulled (CH1). */
  readonly pullTarget = new Vector3();
  private readonly shared: Record<string, { value: unknown }>;
  private volume: Mesh | null = null;
  private volumeMat: ShaderMaterial | null = null;
  private cone: LightShaft | null = null;
  private decalMat: ShaderMaterial;
  private openingMat: ShaderMaterial;
  private moteMat: ShaderMaterial;
  private master = 1;
  private time = 0;
  private readonly baseSpot = 7.5;
  private readonly baseBounce = 2.6;
  private readonly baseScatter = 2.2;

  constructor(opts: { tier: Tier; shadows: boolean; shadowMapSize: number; motes: number }) {
    const t = CELL.wall;
    const third = WINDOW.w / (WINDOW.bars + 1);
    this.shared = {
      uDir: { value: BEAM_DIR.clone() },
      uWin: { value: new Vector4(WINDOW.x, WINDOW.y, WINDOW.w / 2, WINDOW.h / 2) },
      uPlanes: { value: new Vector3(CELL.z0, CELL.z0 - t + 0.03, CELL.z0 - t + 0.09) },
      uBarX: { value: new Vector3(-third, 0, third) },
      uBarR: { value: 0.018 },
      uColor: { value: new Color(MOON) },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
    };

    // Shaft.
    if (opts.tier === 'high') {
      const steps = 36;
      const len = BEAM_LENGTH + 0.6;
      const box = new Mesh(new BoxGeometry(1, 1, 1));
      const mid = BEAM_ORIGIN.clone().add(BEAM_FLOOR).multiplyScalar(0.5);
      box.position.copy(mid);
      box.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), BEAM_DIR);
      box.scale.set(1.25, len, 1.25);
      box.updateMatrixWorld(true);
      this.volumeMat = new ShaderMaterial({
        defines: { STEPS: steps },
        uniforms: {
          ...this.shared,
          uCam: { value: new Vector3() },
          uInv: { value: new Matrix4().copy(box.matrixWorld).invert() },
          uLen: { value: BEAM_LENGTH },
          uHaze: { value: 1 },
          uIntensity: { value: 1.25 },
        },
        vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: VOLUME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: FrontSide,
      });
      box.material = this.volumeMat;
      box.renderOrder = 10;
      box.frustumCulled = false;
      this.volume = box;
      this.group.add(box);
    } else {
      this.cone = new LightShaft({ color: MOON, length: BEAM_LENGTH, radiusTop: 0.27, radiusBottom: 0.36, intensity: 1.7, motes: 0 });
      this.cone.group.position.copy(BEAM_ORIGIN);
      this.cone.group.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), BEAM_DIR);
      this.group.add(this.cone.group);
    }

    // The window on the floor, and the dusty air glowing around it.
    this.decalMat = new ShaderMaterial({
      uniforms: { ...this.shared, uIntensity: { value: 1 }, uFloor: { value: BEAM_FLOOR.clone() } },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: DECAL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const decal = new Mesh(new PlaneGeometry(4.4, 4.4).rotateX(-Math.PI / 2), this.decalMat);
    decal.position.set(BEAM_FLOOR.x, 0.004, BEAM_FLOOR.z);
    decal.renderOrder = 5;
    this.group.add(decal);

    // Looking up into the chute you would see the bright night sky through the bars: a glowing
    // window shape at the inner opening with a soft halo on the stone around it.
    this.openingMat = new ShaderMaterial({
      uniforms: { uIntensity: { value: 1 }, uColor: this.shared.uColor!, uTime: this.shared.uTime! , uSize: { value: new Vector2(WINDOW.w, WINDOW.h) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uIntensity; uniform vec2 uSize; varying vec2 vP;
        ${glsl.dither}
        void main(){
          vec2 hs = uSize * 0.5;
          vec2 d = abs(vP) - hs;
          float inside = 1.0 - smoothstep(-0.012, 0.004, max(d.x, d.y));
          float third = uSize.x / 4.0;
          float bars = smoothstep(0.012, 0.022, abs(vP.x + third)) * smoothstep(0.012, 0.022, abs(vP.x)) * smoothstep(0.012, 0.022, abs(vP.x - third));
          bars *= smoothstep(0.01, 0.02, abs(vP.y - 0.02));
          float edge = length(max(d, 0.0));
          float halo = exp(-edge * 7.0) * 0.16 + exp(-edge * 22.0) * 0.18;
          vec3 c = uColor * (inside * bars * 1.25 + halo * (1.0 - inside * 0.7)) * uIntensity;
          gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const opening = new Mesh(new PlaneGeometry(WINDOW.w + 1.2, WINDOW.h + 1.2), this.openingMat);
    opening.position.set(BEAM_ORIGIN.x, BEAM_ORIGIN.y, CELL.z0 + 0.012);
    opening.renderOrder = 9;
    this.group.add(opening);

    // The real light: a spot far outside the window, so the walls and bars shape it.
    this.spot = new SpotLight(MOON, this.baseSpot, 0, 0.082, 0.35, 0);
    this.spot.position.copy(BEAM_ORIGIN).addScaledVector(BEAM_DIR, -9);
    this.spot.target.position.copy(BEAM_FLOOR);
    if (opts.shadows) {
      this.spot.castShadow = true;
      this.spot.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
      this.spot.shadow.camera.near = 6;
      this.spot.shadow.camera.far = 16;
      this.spot.shadow.bias = -0.0004;
      this.spot.shadow.normalBias = 0.015;
    }
    this.group.add(this.spot, this.spot.target);
    this.bounce = new PointLight('#a9bad8', this.baseBounce, 5.5, 1.3);
    this.bounce.position.copy(BEAM_FLOOR).add(new Vector3(-0.2, 0.6, 0.1));
    this.group.add(this.bounce);
    // The beam itself glows in the dusty air and lights what is near it (a cool rim on the figure).
    this.scatter = new PointLight('#b4c6e6', this.baseScatter, 3.2, 1.4);
    this.scatter.position.copy(BEAM_ORIGIN).addScaledVector(BEAM_DIR, BEAM_LENGTH * 0.42);
    this.group.add(this.scatter);

    // Motes, spread through the beam's box; only those the light catches show.
    const count = opts.motes;
    const rng = seededRandom('motes');
    const seeds = new Float32Array(count * 4);
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rng();
      base[i * 3] = rng.range(-0.55, 0.55);
      base[i * 3 + 2] = rng.range(-0.55, 0.55);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSeed', new BufferAttribute(seeds, 4));
    g.setAttribute('aBase', new BufferAttribute(base, 3));
    const axisX = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), BEAM_DIR));
    const axisZ = new Vector3(0, 0, 1).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), BEAM_DIR));
    this.moteMat = new ShaderMaterial({
      uniforms: {
        ...this.shared,
        uIntensity: { value: 1 },
        uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
        uPull: { value: 0 },
        uPullTarget: { value: this.pullTarget },
        uOrigin: { value: BEAM_ORIGIN.clone().addScaledVector(BEAM_DIR, -0.1) },
        uAxisX: { value: axisX },
        uAxisZ: { value: axisZ },
        uLen: { value: BEAM_LENGTH + 0.2 },
      },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const pts = new Points(g, this.moteMat);
    pts.frustumCulled = false;
    pts.renderOrder = 12;
    this.group.add(pts);
  }

  /** Master brightness (1 is the resting beam; the reveal pushes it to ~2.4). */
  set intensity(v: number) {
    this.master = v;
    if (this.volumeMat) this.volumeMat.uniforms.uIntensity!.value = 1.25 * v;
    if (this.cone) this.cone.intensity = 1.7 * v;
    this.decalMat.uniforms.uIntensity!.value = v;
    this.openingMat.uniforms.uIntensity!.value = Math.min(v, 1.6);
    this.moteMat.uniforms.uIntensity!.value = Math.min(v, 1.8);
    this.spot.intensity = this.baseSpot * v;
    this.bounce.intensity = this.baseBounce * v;
    this.scatter.intensity = this.baseScatter * v;
  }
  get intensity(): number {
    return this.master;
  }

  /** 0..1: the motes drift toward `pullTarget`. */
  set pull(v: number) {
    this.moteMat.uniforms.uPull!.value = v;
  }
  get pull(): number {
    return this.moteMat.uniforms.uPull!.value as number;
  }

  /** Warm the beam toward Christ-light gold (0 moon, 1 gold). */
  set warmth(v: number) {
    const c = new Color(MOON).lerp(new Color('#FFE9B0'), v);
    (this.shared.uColor!.value as Color).copy(c);
    this.spot.color.copy(c);
    if (this.cone) this.cone.color = `#${c.getHexString()}`;
  }

  update(dt: number, camera: { position: Vector3 }): void {
    this.time += dt;
    this.shared.uTime!.value = this.time;
    if (this.volumeMat) {
      this.volumeMat.uniforms.uTime!.value = this.time;
      (this.volumeMat.uniforms.uCam!.value as Vector3).copy(camera.position);
    }
    this.cone?.update(dt);
    // The moon breathes very slightly (thin cloud passing), never a flicker.
    const breathe = 1 + Math.sin(this.time * 0.23) * 0.025 + Math.sin(this.time * 0.071 + 1.3) * 0.02;
    this.spot.intensity = this.baseSpot * this.master * breathe;
  }

  dispose(): void {
    this.group.traverse((o) => (o as Mesh).geometry?.dispose());
    this.volumeMat?.dispose();
    this.cone?.dispose();
    this.decalMat.dispose();
    this.openingMat.dispose();
    this.moteMat.dispose();
    this.spot.dispose();
    this.bounce.dispose();
    this.scatter.dispose();
    this.group.removeFromParent();
  }
}
