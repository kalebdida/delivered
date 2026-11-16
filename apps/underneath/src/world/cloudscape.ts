// The far cloudscape, painted on a dome around the camera: high cirrus and altocumulus, cumulus
// banks on the horizon, an endless cloud sea below (or its underside above, once the visitor has
// fallen through it), and in the Storm a wall of indigo cloud with real structure, lit from inside
// by the lightning. It is cheap enough for every tier; near clouds (billboards, or the raymarched
// sea on high tier) draw in front of it.
import { BackSide, Color, CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, SphereGeometry, Vector3, type Camera } from 'three';
import { glsl } from '@delivered/core';

const FRAG = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uLit, uShade, uHaze, uCam;
uniform float uTime, uSeaY, uSeaOp, uSeaCover, uHighOp, uBankOp;
uniform float uStorm, uFlash, uBolt, uBoltSeed;
uniform vec3 uFlashDir, uStormLit, uStormShade, uFlashCol;
uniform vec3 uRiderDir; uniform float uRider;
varying vec3 vDir;
#define FBM_OCTAVES 4
${glsl.hash}
${glsl.simplex3D}
${glsl.fbm}
${glsl.dither}

vec4 over(vec4 front, vec4 back){ return front + back * (1.0 - front.a); }

// Soft shading of a noise heightfield toward the light: a cheap normal from two taps.
float shade2(vec2 p, vec2 l, float z){
  float a = fbm(vec3(p, z));
  float b = fbm(vec3(p + l * 0.06, z));
  return clamp(0.55 + (a - b) * 8.0, 0.0, 1.0);
}

vec4 highLayer(vec3 d, float sd){
  if (d.y <= 0.015 || uHighOp <= 0.001) return vec4(0.0);
  vec2 uv = d.xz / d.y;
  // Cirrus: long combed streaks.
  vec2 q = vec2(uv.x * 0.28 + uv.y * 0.14, uv.y * 1.3 - uv.x * 0.22) + vec2(uTime * 0.004, 0.0);
  float n = fbm(vec3(q * 1.3, 2.0));
  float cir = smoothstep(0.18, 0.66, n) * (0.5 + 0.5 * fbm(vec3(uv * 2.6, 7.0)));
  // Altocumulus: a broken field of small puffs, in patches.
  float patchy = smoothstep(-0.05, 0.4, fbm(vec3(uv * 0.45 + 3.0, 1.0)));
  float puff = smoothstep(0.24, 0.52, fbm(vec3(uv * 3.4 + vec2(uTime * 0.006, 0.0), 4.0))) * patchy;
  float dens = clamp(max(cir * 0.75, puff * 0.85), 0.0, 1.0);
  float lit = shade2(uv * 3.4, normalize(uSunDir.xz + 1e-4), 4.0);
  vec3 col = mix(mix(uShade, uLit, 0.5), uLit, 0.45 + 0.55 * lit);
  // Forward scattering: clouds near the sun burn gold at their thin edges.
  float fwd = pow(max(sd, 0.0), 7.0);
  col += uSunCol * fwd * (1.4 - dens) * 1.2;
  col = mix(col, uHaze, (1.0 - smoothstep(0.015, 0.4, d.y)) * 0.65);
  float a = dens * smoothstep(0.015, 0.16, d.y) * uHighOp * 0.85;
  return vec4(col * a, a);
}

vec4 banks(vec3 d, float sd){
  if (uBankOp <= 0.001 || d.y > 0.24 || d.y < -0.12) return vec4(0.0);
  vec2 az = normalize(d.xz + 1e-5);
  // The skyline of the banks: towers and gaps around the horizon.
  float skyline = fbm(vec3(az * 1.7, 1.3)) * 0.5 + 0.5;
  float top = 0.012 + 0.15 * pow(skyline, 2.2);
  float billow = fbm(vec3(d * 14.0 + vec3(0.0, 0.0, uTime * 0.003)));
  top += billow * 0.022;
  float body = smoothstep(top + 0.004, top - 0.02, d.y);
  if (body <= 0.001) return vec4(0.0);
  // Lit from the low sun: bright crowns, rose-shadowed bases, the sun side warmer.
  float crown = smoothstep(top - 0.09, top, d.y);
  float sunSide = pow(max(dot(az, normalize(uSunDir.xz + 1e-5)), 0.0), 2.0);
  float lit = clamp(crown * (0.45 + 0.55 * sunSide) + billow * 0.25, 0.0, 1.0);
  vec3 col = mix(uShade, uLit, lit);
  // Silver lining where the banks stand in front of the sun.
  float rim = smoothstep(top - 0.012, top, d.y) * pow(max(sd, 0.0), 10.0);
  col += uSunCol * rim * 2.4;
  col = mix(col, uHaze, 0.42 - crown * 0.2);
  float a = body * uBankOp;
  return vec4(col * a, a);
}

vec4 sea(vec3 d, float sd){
  if (uSeaOp <= 0.001) return vec4(0.0);
  float h = uCam.y - uSeaY;
  bool above = h > 0.0;
  if (above && d.y > -0.002) return vec4(0.0);
  if (!above && d.y < 0.002) return vec4(0.0);
  float t = abs(h) / max(abs(d.y), 0.002);
  vec2 p = (uCam.xz + d.xz * t) / 220.0 + vec2(uTime * 0.0016, uTime * 0.0006);
  float n = fbm(vec3(p, 0.5)) * 0.5 + 0.5;
  float n2 = fbm(vec3(p * 3.3, 9.0)) * 0.5 + 0.5;
  float cover = smoothstep(0.62 - uSeaCover * 0.6, 0.92 - uSeaCover * 0.6, n + n2 * 0.28);
  // Toward the horizon the gaps close into one continuous sea.
  cover = mix(cover, 1.0, smoothstep(700.0, 3200.0, t));
  float lit = shade2(p * 3.3, normalize(uSunDir.xz + 1e-4), 9.0);
  vec3 col;
  if (above) {
    col = mix(uShade, uLit, clamp(0.2 + 0.85 * lit * (0.5 + 0.6 * n), 0.0, 1.0));
    // Sun glare across the tops toward the low sun.
    vec3 r = reflect(d, vec3(0.0, 1.0, 0.0));
    col += uSunCol * pow(max(dot(r, uSunDir), 0.0), 14.0) * 0.55 * cover;
  } else {
    // The underside: soft and dim, brightest where the sun shines through the thin parts.
    col = mix(uShade * 0.62, uLit * 0.82, (1.0 - n) * 0.5 + 0.2);
  }
  float haze = 1.0 - exp(-t / 2400.0);
  col = mix(col, uHaze, haze * 0.85);
  float a = cover * uSeaOp * smoothstep(0.0, 0.035, abs(d.y) + 0.01);
  return vec4(col * a, a);
}

vec4 storm(vec3 d){
  if (uStorm <= 0.001) return vec4(0.0);
  // Towering walls: stretched vertically, billowed, slowly churning.
  vec3 q = d * vec3(2.6, 4.4, 2.6) + vec3(0.0, uTime * 0.012, uTime * 0.006);
  float n = fbm(q);
  float ridge = 1.0 - abs(fbm(q * 2.1 + 5.0));
  float dens = smoothstep(-0.55, 0.35, n + d.y * 0.25);
  // Ambient: dim indigo, lighter on the upper faces of the billows so the structure reads.
  float form = clamp(0.35 + n * 0.6 + ridge * 0.35 + d.y * 0.25, 0.0, 1.0);
  vec3 col = mix(uStormShade, uStormLit, form);
  // The rider's wake: the cloud parts in a channel above it, its edges lit white-gold.
  if (uRider > 0.001) {
    vec3 top = normalize(uRiderDir + vec3(0.0, 1.6, 0.0));
    vec3 seg = top - uRiderDir;
    float s = clamp(dot(d - uRiderDir, seg) / dot(seg, seg), 0.0, 1.0);
    float ang = acos(clamp(dot(d, normalize(mix(uRiderDir, top, s))), -1.0, 1.0));
    float w = 0.05 + 0.16 * s;
    float wake = smoothstep(w, w * 0.25, ang + n * 0.03) * (1.0 - s * 0.5) * uRider;
    float lip = smoothstep(w * 1.9, w, ang) * (1.0 - smoothstep(w, w * 0.4, ang)) * uRider;
    dens *= 1.0 - 0.85 * wake;
    float near = exp(-acos(clamp(dot(d, uRiderDir), -1.0, 1.0)) * 3.5) * uRider;
    col += vec3(1.0, 0.93, 0.78) * (lip * (0.6 + ridge) * 1.2 + near * (0.4 + 0.6 * ridge) * 1.4);
  }
  // Lightning inside the cloud: a broad glow around the strike, broken up by the cloud's own
  // structure so the billows light up from within.
  float cosA = dot(d, uFlashDir);
  float ang = acos(clamp(cosA, -1.0, 1.0));
  float inner = exp(-ang * 3.6) * (0.45 + 0.75 * ridge) * (0.5 + 0.5 * smoothstep(-0.3, 0.6, n));
  col += uFlashCol * inner * uFlash * 2.5;
  // The bolt itself, half hidden in the cloud.
  if (uBolt > 0.001) {
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 right = normalize(cross(uFlashDir, up));
    vec3 vert = cross(right, uFlashDir);
    float x = dot(d, right);
    float y = dot(d, vert);
    float off = snoise(vec3(y * 9.0, uBoltSeed, 0.0)) * 0.035 + snoise(vec3(y * 40.0, uBoltSeed, 3.0)) * 0.008;
    float len = smoothstep(0.22, 0.12, y) * smoothstep(-0.32, -0.18, y);
    float core = exp(-abs(x - off) * 900.0) * len;
    float halo = exp(-abs(x - off) * 70.0) * len * 0.25;
    // A fork.
    float off2 = off + max(0.0, 0.05 - y) * 0.6 + snoise(vec3(y * 30.0, uBoltSeed, 7.0)) * 0.01;
    float len2 = smoothstep(0.05, 0.0, y) * smoothstep(-0.2, -0.1, y);
    core += exp(-abs(x - off2) * 1100.0) * len2 * 0.7;
    float hidden = 0.45 + 0.55 * smoothstep(0.2, -0.2, n);
    col += uFlashCol * (core * 3.0 + halo) * uBolt * hidden;
  }
  float a = dens * uStorm;
  return vec4(col * a, a);
}

void main(){
  vec3 d = normalize(vDir);
  float sd = dot(d, uSunDir);
  vec4 acc = highLayer(d, sd);
  acc = over(acc, banks(d, sd));
  acc = over(acc, sea(d, sd));
  vec4 st = storm(d);
  acc = mix(acc, st, uStorm);
  gl_FragColor = vec4(acc.rgb + dither(gl_FragCoord.xy) * acc.a, acc.a);
}`;

export interface CloudLook {
  lit: string;
  shade: string;
  sun: string;
  sea: number;
  high: number;
  banks: number;
}

export class CloudDome {
  readonly mesh: Mesh;
  readonly uniforms = {
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunCol: { value: new Color('#ffcf88') },
    uLit: { value: new Color('#fff1d6') },
    uShade: { value: new Color('#c49a92') },
    uHaze: { value: new Color('#f2b866') },
    uCam: { value: new Vector3() },
    uTime: { value: 0 },
    uSeaY: { value: 2320 },
    uSeaOp: { value: 1 },
    uSeaCover: { value: 0.6 },
    uHighOp: { value: 1 },
    uBankOp: { value: 1 },
    uStorm: { value: 0 },
    uFlash: { value: 0 },
    uBolt: { value: 0 },
    uBoltSeed: { value: 0 },
    uFlashDir: { value: new Vector3(1, 0, 0) },
    uStormLit: { value: new Color('#6773b4') },
    uStormShade: { value: new Color('#1e2342') },
    uFlashCol: { value: new Color('#dde6ff') },
    uRiderDir: { value: new Vector3(0, 1, 0) },
    uRider: { value: 0 },
  };

  constructor(radius = 1300) {
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99999; }`,
      fragmentShader: FRAG,
      side: BackSide,
      // A backdrop: in the opaque queue (so it draws before the scene), blended premultiplied.
      transparent: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1400;
  }

  update(dt: number, camera: Camera): void {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
    this.uniforms.uCam.value.copy(camera.position);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
