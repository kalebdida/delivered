/**
 * GLSL chunk library. Each export is a string to interpolate into a shader:
 *
 * ```ts
 * const fragmentShader = `${glsl.hash}${glsl.simplex3D}${glsl.fbm}
 *   void main(){ gl_FragColor = vec4(vec3(fbm(vPos)), 1.0); }`;
 * ```
 * Dependencies: `fbm` needs `simplex3D`; `curl` needs `simplex3D`; everything random needs `hash`.
 */
const hash = /* glsl */ `
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
`;

const simplex2D = /* glsl */ `
vec3 _permute3(vec3 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = _permute3(_permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const simplex3D = /* glsl */ `
vec4 _permute4(vec4 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 _taylorInvSqrt4(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = _permute4(_permute4(_permute4(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = _taylorInvSqrt4(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const simplex4D = /* glsl */ `
vec4 _perm4d(vec4 x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
float _perm1d(float x){ return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 _grad4(float j, vec4 ip){
  const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
  vec4 p, s;
  p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
  p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
  s = vec4(lessThan(p, vec4(0.0)));
  p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
  return p;
}
float snoise(vec4 v){
  const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);
  vec4 i = floor(v + dot(v, C.yyyy));
  vec4 x0 = v - i + dot(i, C.xxxx);
  vec4 i0;
  vec3 isX = step(x0.yzw, x0.xxx);
  vec3 isYZ = step(x0.zww, x0.yyz);
  i0.x = isX.x + isX.y + isX.z;
  i0.yzw = 1.0 - isX;
  i0.y += isYZ.x + isYZ.y;
  i0.zw += 1.0 - isYZ.xy;
  i0.z += isYZ.z;
  i0.w += 1.0 - isYZ.z;
  vec4 i3 = clamp(i0, 0.0, 1.0);
  vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
  vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);
  vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
  vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
  vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
  vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;
  i = mod(i, 289.0);
  float j0 = _perm1d(_perm1d(_perm1d(_perm1d(i.w) + i.z) + i.y) + i.x);
  vec4 j1 = _perm4d(_perm4d(_perm4d(_perm4d(i.w + vec4(i1.w, i2.w, i3.w, 1.0)) + i.z + vec4(i1.z, i2.z, i3.z, 1.0)) + i.y + vec4(i1.y, i2.y, i3.y, 1.0)) + i.x + vec4(i1.x, i2.x, i3.x, 1.0));
  vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
  vec4 p0 = _grad4(j0, ip);
  vec4 p1 = _grad4(j1.x, ip);
  vec4 p2 = _grad4(j1.y, ip);
  vec4 p3 = _grad4(j1.z, ip);
  vec4 p4 = _grad4(j1.w, ip);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  p4 *= 1.79284291400159 - 0.85373472095314 * dot(p4, p4);
  vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
  m0 = m0 * m0; m1 = m1 * m1;
  return 49.0 * (dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2))) + dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4))));
}
`;

/** fbm over `snoise(vec3)`. Requires `simplex3D`. Define FBM_OCTAVES before it to change (default 5). */
const fbm = /* glsl */ `
#ifndef FBM_OCTAVES
#define FBM_OCTAVES 5
#endif
float fbm(vec3 p){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < FBM_OCTAVES; i++){ s += a * snoise(p); n += a; p = p * 2.02 + vec3(13.1, 7.7, 3.3); a *= 0.5; }
  return s / n;
}
`;

/** Divergence-free curl noise. Requires `simplex3D`. */
const curl = /* glsl */ `
vec3 _snoiseVec3(vec3 x){
  return vec3(snoise(x), snoise(vec3(x.y - 19.1, x.z + 33.4, x.x + 47.2)), snoise(vec3(x.z + 74.2, x.x - 124.5, x.y + 99.4)));
}
vec3 curlNoise(vec3 p){
  const float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0), dy = vec3(0.0, e, 0.0), dz = vec3(0.0, 0.0, e);
  vec3 px0 = _snoiseVec3(p - dx), px1 = _snoiseVec3(p + dx);
  vec3 py0 = _snoiseVec3(p - dy), py1 = _snoiseVec3(p + dy);
  vec3 pz0 = _snoiseVec3(p - dz), pz1 = _snoiseVec3(p + dz);
  float x = py1.z - py0.z - pz1.y + pz0.y;
  float y = pz1.x - pz0.x - px1.z + px0.z;
  float z = px1.y - px0.y - py1.x + py0.x;
  return normalize(vec3(x, y, z) / (2.0 * e) + 1e-5);
}
`;

/** Voronoi returning vec3(F1, edgeDistance, cellId). Requires `hash`. */
const voronoi = /* glsl */ `
vec3 voronoi(vec2 x){
  vec2 n = floor(x), f = fract(x);
  vec2 mg, mr; float md = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md){ md = d; mr = r; mg = g; id = hash12(n + g); }
  }
  float ed = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++){
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 0.00001) ed = min(ed, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec3(sqrt(md), ed, id);
}
`;

const fresnel = /* glsl */ `
float fresnel(vec3 viewDir, vec3 normal, float power){
  return pow(1.0 - clamp(dot(normalize(viewDir), normalize(normal)), 0.0, 1.0), power);
}
`;

/** UV offset for heat haze. Requires `simplex3D`. */
const heatDistortion = /* glsl */ `
vec2 heatDistort(vec2 uv, float time, float strength){
  float n1 = snoise(vec3(uv * vec2(6.0, 14.0) + vec2(0.0, -time * 0.9), time * 0.35));
  float n2 = snoise(vec3(uv * vec2(13.0, 26.0) + vec2(4.0, -time * 1.7), time * 0.5));
  return uv + vec2(n1 + 0.5 * n2, 0.5 * n1) * strength;
}
`;

/**
 * Dithering that kills gradient banding. `ditherNoise` is a cheap blue-ish interleaved gradient
 * noise; add `dither(gl_FragCoord.xy)` to any color before output.
 */
const dither = /* glsl */ `
float ditherNoise(vec2 fragCoord){
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}
vec3 dither(vec2 fragCoord){
  float n = ditherNoise(fragCoord);
  vec3 d = vec3(n, fract(n + 0.618034), fract(n + 0.381966)) - 0.5;
  return d / 255.0 * 1.5;
}
`;

/**
 * Soft particles: fade a fragment where it meets scene depth.
 * Needs uniforms `sampler2D tDepth; float cameraNear, cameraFar; vec2 resolution;`.
 */
const softParticles = /* glsl */ `
float _linearDepth(float d, float near, float far){
  float z = d * 2.0 - 1.0;
  return (2.0 * near * far) / (far + near - z * (far - near));
}
float softParticle(sampler2D depthTex, vec2 screenUv, float fragZ, float near, float far, float softness){
  float scene = _linearDepth(texture2D(depthTex, screenUv).r, near, far);
  float self = _linearDepth(fragZ, near, far);
  return clamp((scene - self) / softness, 0.0, 1.0);
}
`;

export const glsl = {
  hash,
  simplex2D,
  simplex3D,
  simplex4D,
  fbm,
  curl,
  voronoi,
  fresnel,
  heatDistortion,
  dither,
  softParticles,
} as const;
