// The everlasting arms: two vast sculpted forms of light rising out of a floor of mist, open hands
// cupped together to make a cradle. Never a body: no shoulders, no torso, the roots dissolve into
// the haze, so they read more like a landscape than limbs. A faint gold mark rings each wrist
// (never explained on screen).
//
// Layers, from solid to air:
//   1. the core: a dense smooth mesh, soft-shaded with an inner (subsurface) glow and a fresnel rim;
//   2. ribbons of light wound around each arm, flowing toward the hands;
//   3. GPU particles sampled on the surface, drifting along it like a current of light.
// The mesh is built in two poses (open and closed) with the same topology and blended on the GPU,
// so the fingers curl and the palms roll into a bowl without any per-frame CPU work.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, DoubleSide, FrontSide, Group, Mesh, NormalBlending, PlaneGeometry,
  Points, ShaderMaterial, Vector3,
} from 'three';
import { glsl, seededRandom } from '@delivered/core';

export const ARM_COUNTS = { low: 25_000, medium: 80_000, high: 300_000 } as const;

const UP = new Vector3(0, 1, 0);
/** How far (local units) the hands lift as the arms rise. */
const RISE = 0.016;
/** How far the palms roll into a bowl when closed (radians). */
const ROLL = 0.3;
/** Size of the hands relative to the arms' reach. */
const HS = 1.4;

interface Tube {
  pts: Vector3[];
  rx: number[];
  ry: number[];
  cup: number[];
  /** Weight of the hand roll per point. */
  roll: number[];
  /** Global position along the arm, 0 at the root .. 1 at the fingertips. */
  t: number[];
  finger: number;
}

/** A sampled frame of a tube, after the hand roll. */
interface Ring {
  c: Vector3;
  l: Vector3;
  u: Vector3;
  rx: number;
  ry: number;
  cup: number;
  t: number;
}

const sm = (e0: number, e1: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The arm from its root in the mist to the knuckles, as one swept tube. */
function armTube(s: number, n: number): { tube: Tube; wristT: number } {
  const ctrl = [
    [0.86, -0.34, -1.8],
    [0.54, -0.045, -0.95],
    [0.27, -0.055, -0.4],
    [0.14, -0.008, -0.16],
    [0.06 * HS, 0.0, -0.012 * HS],
    [0.029 * HS, 0.0, 0.03 * HS],
    [0.0245 * HS, 0.002 * HS, 0.06 * HS],
  ].map(([x, y, z]) => new Vector3(s * x!, y!, z!));
  const curve = new CatmullRomCurve3(ctrl, false, 'centripetal');
  const lengths = curve.getLengths(2000);
  const total = lengths[2000]!;
  const uw = lengths[Math.round((2000 * 4) / 6)]! / total;
  // Dense sampling at the hand: 70% of the rings from the root to the wrist, 30% for the palm.
  const na = Math.round(n * 0.7);
  const tube: Tube = { pts: [], rx: [], ry: [], cup: [], roll: [], t: [], finger: 0 };
  for (let i = 0; i < n; i++) {
    const u = i < na ? (i / na) * uw : uw + ((i - na) / (n - na - 1)) * (1 - uw);
    tube.pts.push(curve.getPointAt(Math.min(1, u)));
    if (u <= uw) {
      const k = u / uw;
      // A broad root, a long tapering forearm with a slight swell, a narrow wrist.
      const r = 0.023 * HS + 0.085 * Math.pow(1 - k, 1.15) + 0.012 * Math.exp(-(((k - 0.72) / 0.13) ** 2));
      tube.rx.push(r);
      tube.ry.push(r * 0.9);
      tube.cup.push(0);
    } else {
      const k = (u - uw) / (1 - uw);
      tube.rx.push((lerp(0.023, 0.029, sm(0, 0.45, k)) - 0.003 * sm(0.6, 1, k)) * HS);
      tube.ry.push((lerp(0.0207, 0.0105, sm(0, 0.45, k)) - 0.0015 * sm(0.7, 1, k)) * HS);
      tube.cup.push(0.0055 * HS * sm(0.1, 0.5, k));
    }
    tube.roll.push(sm(uw - 0.05, uw + 0.015, u));
    tube.t.push(u * 0.88);
  }
  return { tube, wristT: uw * 0.88 };
}

/** Rotate `v` about the unit `axis` by `a` (Rodrigues). */
function rotate(v: Vector3, axis: Vector3, a: number): Vector3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const cross = new Vector3().crossVectors(axis, v);
  const dot = axis.dot(v);
  return v.clone().multiplyScalar(c).addScaledVector(cross, s).addScaledVector(axis, dot * (1 - c));
}

/** A finger (or thumb) as a jointed, curled tube. `c` is how closed the hand is. */
function digit(base: Vector3, dir0: Vector3, len: number, rad: number, curls: number[], fractions: number[], n: number): Tube {
  const joints = [base.clone()];
  let dir = dir0.clone().normalize();
  let p = base.clone();
  curls.forEach((curl, k) => {
    const axis = new Vector3().crossVectors(dir, UP).normalize();
    dir = rotate(dir, axis, curl).normalize();
    p = p.clone().addScaledVector(dir, len * fractions[k]!);
    joints.push(p);
  });
  const curve = new CatmullRomCurve3(joints, false, 'centripetal');
  const tube: Tube = { pts: curve.getSpacedPoints(n - 1), rx: [], ry: [], cup: [], roll: [], t: [], finger: 1 };
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    let r = rad * (1 - 0.2 * k);
    if (k > 0.78) r *= Math.sqrt(Math.max(0.06, 1 - ((k - 0.78) / 0.22) ** 2));
    tube.rx.push(r);
    tube.ry.push(r * 0.86);
    tube.cup.push(0);
    tube.roll.push(1);
    tube.t.push(0.88 + 0.12 * k);
  }
  return tube;
}

function handDigits(s: number, c: number): Tube[] {
  const out: Tube[] = [];
  // Index (outer) to little finger (inner, toward the other hand).
  const lat = [0.0178, 0.006, -0.006, -0.0178];
  const rad = [0.0062, 0.0066, 0.0062, 0.0053];
  const len = [0.056, 0.062, 0.057, 0.046];
  const spread = [0.08, 0.026, -0.026, -0.08];
  for (let j = 0; j < 4; j++) {
    const a = spread[j]! * (1 - 0.65 * c) * s;
    out.push(
      digit(new Vector3(s * (0.0245 + lat[j]!), 0.0035, 0.047).multiplyScalar(HS), new Vector3(Math.sin(a), 0.02, Math.cos(a)), len[j]! * HS, rad[j]! * HS,
        [0.04 + 0.22 * c, 0.08 + 0.34 * c, 0.08 + 0.3 * c], [0.42, 0.33, 0.25], 18),
    );
  }
  // The thumb, on the outer side: open it points outward; closed it rises to frame the cradle.
  const open = new Vector3(s * 0.8, 0.12, 0.6).normalize();
  const shut = new Vector3(s * 0.28, 0.45, 0.85).normalize();
  out.push(digit(new Vector3(s * 0.046, 0.001, 0.008).multiplyScalar(HS), open.lerp(shut, c), 0.046 * HS, 0.0086 * HS, [0.08 + 0.2 * c, 0.1 + 0.3 * c], [0.55, 0.45], 16));
  return out;
}

/** Parallel-transport frames along a tube, then the hand roll about the seam between the hands. */
function frames(tube: Tube, s: number, c: number): Ring[] {
  const n = tube.pts.length;
  const out: Ring[] = [];
  let u = new Vector3();
  const zAxis = new Vector3(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const a = tube.pts[Math.max(0, i - 1)]!;
    const b = tube.pts[Math.min(n - 1, i + 1)]!;
    const t = b.clone().sub(a).normalize();
    if (i === 0) u = UP.clone().addScaledVector(t, -t.dot(UP)).normalize();
    else u.addScaledVector(t, -t.dot(u)).normalize();
    const l = new Vector3().crossVectors(t, u).normalize();
    const ang = s * ROLL * c * tube.roll[i]!;
    out.push({
      c: rotate(tube.pts[i]!, zAxis, ang),
      l: rotate(l, zAxis, ang),
      u: rotate(u.clone(), zAxis, ang),
      rx: tube.rx[i]!,
      ry: tube.ry[i]!,
      cup: tube.cup[i]!,
      t: tube.t[i]!,
    });
  }
  return out;
}

function ringPoint(r: Ring, theta: number, out: Vector3, inflate = 1): Vector3 {
  const st = Math.sin(theta);
  const y = st * r.ry - (st > 0 ? r.cup * st * st : 0);
  return out.copy(r.c).addScaledVector(r.l, Math.cos(theta) * r.rx * inflate).addScaledVector(r.u, y * inflate);
}

interface Built {
  /** Per tube, per pose: frames. */
  tubes: { rings: [Ring[], Ring[]]; finger: number }[];
  wristT: number;
}

function buildArms(armRings: number): Built {
  const tubes: Built['tubes'] = [];
  let wristT = 0.8;
  for (const s of [-1, 1]) {
    const { tube, wristT: w } = armTube(s, armRings);
    wristT = w;
    tubes.push({ rings: [frames(tube, s, 0), frames(tube, s, 1)], finger: 0 });
    const open = handDigits(s, 0);
    const shut = handDigits(s, 1);
    open.forEach((d, j) => tubes.push({ rings: [frames(d, s, 0), frames(shut[j]!, s, 1)], finger: 1 }));
  }
  return { tubes, wristT };
}

/** Sweep every tube into one indexed mesh per pose (same topology), with smooth normals. */
function sweepGeometry(built: Built, around: number): BufferGeometry {
  const poses: BufferGeometry[] = [];
  let info: Float32Array | null = null;
  const v = new Vector3();
  for (let pose = 0; pose < 2; pose++) {
    const pos: number[] = [];
    const inf: number[] = [];
    const tan: number[] = [];
    const idx: number[] = [];
    for (const tube of built.tubes) {
      const rings = tube.rings[pose as 0 | 1];
      const k = tube.finger ? Math.max(10, Math.round(around * 0.5)) : around;
      const base = pos.length / 3;
      // Start cap centre, the rings, end cap centre.
      const first = rings[0]!;
      const last = rings[rings.length - 1]!;
      const t0 = rings[1]!.c.clone().sub(first.c).normalize();
      const t1 = last.c.clone().sub(rings[rings.length - 2]!.c).normalize();
      v.copy(first.c).addScaledVector(t0, -Math.min(first.rx, first.ry) * 0.6);
      pos.push(v.x, v.y, v.z);
      inf.push(first.t, tube.finger);
      tan.push(t0.x, t0.y, t0.z);
      rings.forEach((r, i) => {
        const along = rings[Math.min(rings.length - 1, i + 1)]!.c.clone().sub(rings[Math.max(0, i - 1)]!.c).normalize();
        for (let j = 0; j < k; j++) {
          ringPoint(r, (j / k) * Math.PI * 2, v);
          pos.push(v.x, v.y, v.z);
          inf.push(r.t, tube.finger);
          tan.push(along.x, along.y, along.z);
        }
      });
      v.copy(last.c).addScaledVector(t1, Math.min(last.rx, last.ry) * 0.6);
      pos.push(v.x, v.y, v.z);
      inf.push(last.t, tube.finger);
      tan.push(t1.x, t1.y, t1.z);
      const ring = (i: number, j: number) => base + 1 + i * k + (((j % k) + k) % k);
      const endC = base + 1 + rings.length * k;
      for (let j = 0; j < k; j++) idx.push(base, ring(0, j), ring(0, j + 1));
      for (let i = 0; i < rings.length - 1; i++) {
        for (let j = 0; j < k; j++) {
          const a = ring(i, j);
          const b = ring(i, j + 1);
          const c = ring(i + 1, j);
          const d = ring(i + 1, j + 1);
          idx.push(a, c, b, b, c, d);
        }
      }
      for (let j = 0; j < k; j++) idx.push(endC, ring(rings.length - 1, j + 1), ring(rings.length - 1, j));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (pose === 0) g.setAttribute('aTan', new BufferAttribute(new Float32Array(tan), 3));
    poses.push(g);
    info = new Float32Array(inf);
  }
  const g = poses[0]!;
  g.setAttribute('aP1', poses[1]!.getAttribute('position'));
  g.setAttribute('aN1', poses[1]!.getAttribute('normal'));
  g.setAttribute('aInfo', new BufferAttribute(info!, 2));
  poses[1]!.dispose();
  return g;
}

/** Ribbons of light wound around each arm, in both poses. */
function ribbonGeometry(built: Built, count: number, rng: () => number): BufferGeometry {
  const pos: number[] = [];
  const p1: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const arms = built.tubes.filter((t) => t.finger === 0);
  const v = new Vector3();
  for (let r = 0; r < count; r++) {
    const arm = arms[r % arms.length]!;
    const n = arm.rings[0].length;
    const i0 = Math.floor(n * (0.08 + rng() * 0.3));
    const i1 = Math.min(n - 3, Math.floor(n * (0.86 + rng() * 0.1)));
    const theta0 = rng() * Math.PI * 2;
    const turns = (0.8 + rng() * 1.6) * (rng() < 0.5 ? -1 : 1);
    const width = 0.005 + rng() * 0.008;
    const lift = 1.015 + rng() * 0.035;
    const base = pos.length / 3;
    const segs = i1 - i0;
    for (let i = i0; i <= i1; i++) {
      const k = (i - i0) / segs;
      const theta = theta0 + turns * Math.PI * 2 * k;
      for (const pose of [0, 1] as const) {
        const ring = arm.rings[pose][i]!;
        const a = width / Math.max(0.004, (ring.rx + ring.ry) * 0.5);
        const out = pose === 0 ? pos : p1;
        ringPoint(ring, theta - a, v, lift);
        out.push(v.x, v.y, v.z);
        ringPoint(ring, theta + a, v, lift);
        out.push(v.x, v.y, v.z);
      }
      uv.push(k, 0, k, 1);
      if (i < i1) {
        const a = base + (i - i0) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aP1', new BufferAttribute(new Float32Array(p1), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  return g;
}

/** Particles sampled on the surface in both poses, each with a direction to flow along. */
function particleGeometry(mesh: BufferGeometry, count: number, wristT: number, rng: () => number): BufferGeometry {
  const p0 = mesh.getAttribute('position') as BufferAttribute;
  const n0 = mesh.getAttribute('normal') as BufferAttribute;
  const q1 = mesh.getAttribute('aP1') as BufferAttribute;
  const m1 = mesh.getAttribute('aN1') as BufferAttribute;
  const info = mesh.getAttribute('aInfo') as BufferAttribute;
  const index = mesh.index!.array;
  const tris = index.length / 3;
  // Area-weighted triangle picking, with the hands weighted up: that is where the eye goes.
  const cdf = new Float32Array(tris);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let acc = 0;
  for (let i = 0; i < tris; i++) {
    a.fromBufferAttribute(p0, index[i * 3]!);
    b.fromBufferAttribute(p0, index[i * 3 + 1]!);
    c.fromBufferAttribute(p0, index[i * 3 + 2]!);
    const area = b.sub(a).cross(c.sub(a)).length() * 0.5;
    const t = info.getX(index[i * 3]!);
    acc += area * (t > 0.84 ? 3.5 : 0.6 + t);
    cdf[i] = acc;
  }
  const pos = new Float32Array(count * 3);
  const pos1 = new Float32Array(count * 3);
  const tan = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  const pa = new Vector3();
  const pb = new Vector3();
  const na = new Vector3();
  const nb = new Vector3();
  const tmp = new Vector3();
  for (let i = 0; i < count; i++) {
    const x = rng() * acc;
    let lo = 0;
    let hi = tris - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid]! < x) lo = mid + 1;
      else hi = mid;
    }
    const ia = index[lo * 3]!;
    const ib = index[lo * 3 + 1]!;
    const ic = index[lo * 3 + 2]!;
    let u = rng();
    let w = rng();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    const bary = (attr: BufferAttribute, out: Vector3) =>
      out.fromBufferAttribute(attr, ia).multiplyScalar(1 - u - w).add(tmp.fromBufferAttribute(attr, ib).multiplyScalar(u)).add(tmp.fromBufferAttribute(attr, ic).multiplyScalar(w));
    bary(p0, pa);
    bary(q1, pb);
    bary(n0, na).normalize();
    bary(m1, nb).normalize();
    // Most sit just above the skin; a few float further out as an aura.
    const far = rng() < 0.18;
    const off = far ? 0.004 + Math.pow(rng(), 2) * 0.03 : 0.0008 + rng() * 0.003;
    pa.addScaledVector(na, off);
    pb.addScaledVector(nb, off);
    pos.set([pa.x, pa.y, pa.z], i * 3);
    pos1.set([pb.x, pb.y, pb.z], i * 3);
    // Flow direction: along the form toward the hands, kept on the surface.
    const t = info.getX(ia);
    bary(mesh.getAttribute('aTan') as BufferAttribute, a);
    a.addScaledVector(na, -a.dot(na)).normalize();
    tan.set([a.x, a.y, a.z], i * 3);
    const gold = Math.abs(t - wristT) < 0.006 ? 1 : rng() < 0.03 ? 0.5 : 0;
    data.set([t, rng(), gold, far ? 1 : 0], i * 4);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('aP1', new BufferAttribute(pos1, 3));
  g.setAttribute('aTan', new BufferAttribute(tan, 3));
  g.setAttribute('aData', new BufferAttribute(data, 4));
  return g;
}

export interface ArmsOptions {
  count: number;
  /** World size of the whole form (root to root). */
  scale: number;
  ribbons?: number;
  seed?: string;
  /** Rings around the arm (smoothness of the core). */
  around?: number;
  /** A floor of mist the arms rise out of (the world's arms, not the playground catcher). */
  floor?: boolean;
}

export class Arms {
  readonly group = new Group();
  readonly uniforms = {
    uTime: { value: 0 },
    uClose: { value: 0 },
    uRise: { value: 0 },
    uLevel: { value: 1 },
    uScale: { value: 1 },
    uPixel: { value: 1 },
    uWarm: { value: new Color('#fff1d2') },
    uGold: { value: new Color('#f5c76b') },
    uDeep: { value: new Color('#b98544') },
    uRim: { value: new Color('#ffe3b0') },
    uHaze: { value: new Color('#6a4658') },
    uKeyDir: { value: new Vector3(0.2, 0.86, -0.46).normalize() },
    uWrist: { value: 0.8 },
    uGlow: { value: 0 },
    uGlowSize: { value: 12 },
    uCradle: { value: new Vector3() },
  };
  readonly core: Mesh;
  readonly points: Points;
  readonly ribbons: Mesh;
  readonly floor: Mesh | null = null;
  private glowMesh: Mesh;
  private time = 0;
  /** Where a held visitor rests (local units, before the rise). */
  readonly cradle = new Vector3(0, 0.0085 * HS, 0.034 * HS);

  constructor(readonly opts: ArmsOptions) {
    const rng = seededRandom(opts.seed ?? 'arms');
    const built = buildArms(Math.max(60, Math.round((opts.around ?? 28) * 4.2)));
    this.uniforms.uWrist.value = built.wristT;
    this.uniforms.uScale.value = opts.scale;
    const u = this.uniforms;

    // 1 · the core.
    const coreGeo = sweepGeometry(built, opts.around ?? 28);
    const coreMat = new ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: true,
      side: FrontSide,
      blending: NormalBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aP1; attribute vec3 aN1; attribute vec2 aInfo;
        uniform float uClose; uniform float uRise; uniform float uTime;
        varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying float vT; varying float vF;
        void main(){
          vec3 p = mix(position, aP1, uClose);
          vec3 n = normalize(mix(normal, aN1, uClose));
          float hand = smoothstep(0.55, 0.9, aInfo.x);
          p.y += uRise * ${RISE.toFixed(4)} * (0.3 + 0.7 * hand);
          // The form breathes, very slowly.
          p += n * 0.0009 * sin(uTime * 0.7 + aInfo.x * 7.0);
          vec4 w = modelMatrix * vec4(p, 1.0);
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * n); vObj = p; vT = aInfo.x; vF = aInfo.y;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm; uniform vec3 uGold; uniform vec3 uDeep; uniform vec3 uRim; uniform vec3 uHaze; uniform vec3 uKeyDir;
        uniform float uLevel; uniform float uTime; uniform float uWrist; uniform float uScale; uniform vec3 uCradle; uniform float uGlow;
        varying vec3 vW; varying vec3 vN; varying vec3 vObj; varying float vT; varying float vF;
        ${glsl.simplex3D}
        ${glsl.dither}
        void main(){
          vec3 N = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          float ndv = clamp(dot(N, V), 0.0, 1.0);
          float ndl = dot(N, uKeyDir);
          float wrap = clamp((ndl + 0.55) / 1.55, 0.0, 1.0);
          float sss = pow(ndv, 1.6);
          float fres = pow(1.0 - ndv, 2.6);
          // Light moving through the form toward the hands: slow bands and a soft marbling.
          float along = vT * 46.0 - uTime * 0.9;
          float n1 = snoise(vObj * 26.0 + vec3(0.0, uTime * 0.05, 0.0));
          float bands = pow(0.5 + 0.5 * sin(along + n1 * 2.2), 6.0);
          float marble = 0.5 + 0.5 * snoise(vObj * 9.0 - vec3(0.0, 0.0, uTime * 0.03));
          // Light, not a lit object: the thick middle glows from within, the key light only shapes it,
          // and a fresnel rim draws the silhouette.
          vec3 body = mix(uDeep, uWarm, clamp(0.35 + wrap * 0.45 + sss * 0.35, 0.0, 1.0));
          vec3 col = body * (0.34 + 0.5 * wrap + 0.42 * sss) * (0.82 + 0.36 * marble);
          col += uRim * fres * (0.65 + 0.8 * wrap);
          // Translucency where the key light comes through toward the eye.
          col += uWarm * pow(clamp(dot(-V, uKeyDir) * 0.5 + 0.5, 0.0, 1.0), 6.0) * fres * 0.6;
          col += uWarm * bands * 0.12 * (0.4 + 0.6 * sss);
          // The hands carry the most light; the roots fall away into the mist.
          col *= mix(0.6, 1.1, smoothstep(0.25, 0.95, vT));
          // Light pooled in the palms around the one they hold: the hottest point of the frame.
          float pd = length(vObj - uCradle);
          col += uWarm * (exp(-pd * 22.0) * 0.55 + exp(-pd * 95.0) * 1.6 * uGlow) * (0.5 + 0.5 * sss);
          // The gold mark at each wrist.
          float mark = exp(-pow((vT - uWrist) / 0.0065, 2.0)) * (1.0 - vF);
          col = mix(col, uGold * 1.5, mark * 0.5);
          col *= max(1.0, 1.0 + (uLevel - 1.0) * 0.35);
          // Aerial haze by distance (in the form's own units) and depth below the mist floor.
          float d = length(cameraPosition - vW) / uScale;
          float haze = 1.0 - exp(-max(0.0, d - 0.12) * 1.15);
          haze = max(haze, smoothstep(0.0, -0.15, vObj.y));
          col = mix(col, uHaze * 0.9, clamp(haze, 0.0, 0.96));
          // Below the mist floor the form dissolves completely.
          float root = smoothstep(-0.26, -0.1, vObj.y);
          gl_FragColor = vec4(col + dither(gl_FragCoord.xy), clamp(uLevel, 0.0, 1.0) * root);
        }`,
    });
    this.core = new Mesh(coreGeo, coreMat);
    this.core.frustumCulled = false;
    this.core.renderOrder = 2;

    // 2 · ribbons of light.
    const ribbonMat = new ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aP1; uniform float uClose; uniform float uRise; uniform float uScale; varying vec2 vUv; varying float vFade;
        void main(){
          vUv = uv;
          vec3 p = mix(position, aP1, uClose);
          p.y += uRise * ${RISE.toFixed(4)} * (0.3 + 0.7 * smoothstep(0.6, 1.0, uv.x));
          vec4 w = modelMatrix * vec4(p, 1.0);
          float d = length(cameraPosition - w.xyz) / uScale;
          vFade = smoothstep(-0.12, 0.0, p.y) * exp(-max(0.0, d - 0.12) * 1.6);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uLevel; uniform vec3 uWarm; uniform vec3 uGold; varying vec2 vUv; varying float vFade;
        void main(){
          float edge = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float flow = pow(0.5 + 0.5 * sin(vUv.x * 36.0 - uTime * 2.2), 3.0);
          float ends = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          float a = edge * (0.3 + 0.7 * flow) * ends * 0.75 * clamp(uLevel, 0.0, 2.0) * vFade;
          gl_FragColor = vec4(mix(uGold, uWarm, flow) * 1.7 * a, a);
        }`,
    });
    this.ribbons = new Mesh(ribbonGeometry(built, opts.ribbons ?? 12, rng), ribbonMat);
    this.ribbons.frustumCulled = false;
    this.ribbons.renderOrder = 3;

    // 3 · particles flowing over the surface.
    const ptsMat = new ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aP1; attribute vec3 aTan; attribute vec4 aData;
        uniform float uTime; uniform float uClose; uniform float uRise; uniform float uScale; uniform float uPixel;
        varying float vA; varying float vGold;
        void main(){
          float t = aData.x; float seed = aData.y; float far = aData.w;
          vec3 p = mix(position, aP1, uClose);
          float phase = fract(seed * 17.0 + uTime * (0.05 + seed * 0.07));
          p += aTan * (phase - 0.5) * (0.026 + far * 0.03);
          p.y += uRise * ${RISE.toFixed(4)} * (0.3 + 0.7 * smoothstep(0.55, 0.9, t)) + far * phase * 0.01;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float size = (0.5 + seed * 1.3 + aData.z * 1.6) * uScale * 0.0011 * uPixel;
          gl_PointSize = clamp(size * 900.0 / -mv.z, 1.0, 14.0);
          vA = sin(phase * 3.14159) * (0.45 + 0.55 * fract(seed * 31.7)) * (far > 0.5 ? 0.55 : 1.0) * smoothstep(-0.12, 0.0, p.y);
          vGold = aData.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm; uniform vec3 uGold; uniform float uLevel; varying float vA; varying float vGold;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a * vA * clamp(uLevel, 0.0, 2.0) * 0.8;
          vec3 col = mix(uWarm, uGold, vGold) * (1.5 + vGold * 1.5);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.points = new Points(particleGeometry(coreGeo, opts.count, built.wristT, rng), ptsMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;

    this.group.add(this.core, this.ribbons, this.points);

    // The floor of mist the arms rise out of, lit warm around the hands.
    if (opts.floor) {
      const floor = new Mesh(
        new PlaneGeometry(6, 6, 1, 1).rotateX(-Math.PI / 2),
        new ShaderMaterial({
          uniforms: u,
          transparent: true,
          depthWrite: false,
          vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
          fragmentShader: /* glsl */ `
            uniform vec3 uHaze; uniform vec3 uWarm; uniform vec3 uGold; uniform float uLevel; uniform float uTime;
            varying vec3 vP; varying vec3 vW;
            ${glsl.hash}${glsl.simplex3D}${glsl.fbm}${glsl.dither}
            void main(){
              vec2 q = vP.xz;
              float r = length(q);
              float n = fbm(vec3(q * 3.2, uTime * 0.02)) * 0.5 + 0.5;
              float n2 = fbm(vec3(q * 9.0 + 4.0, uTime * 0.03)) * 0.5 + 0.5;
              // Light pooled under the hands and along the arms' line.
              float pool = exp(-length(q - vec2(0.0, 0.0)) * 7.0);
              vec3 dusk = uHaze * (0.5 + 0.5 * n) * (0.8 + 0.3 * n2);
              vec3 col = mix(dusk, mix(uGold, uWarm, n2) * 0.95, clamp(pool * (0.55 + 0.6 * n2), 0.0, 1.0));
              float a = smoothstep(3.0, 1.6, r) * (0.68 + 0.3 * n) * clamp(uLevel, 0.0, 1.0);
              gl_FragColor = vec4(col + dither(gl_FragCoord.xy), a);
            }`,
        }),
      );
      floor.position.y = -0.11;
      floor.frustumCulled = false;
      floor.renderOrder = 1;
      this.floor = floor;
      this.group.add(floor);
    }

    // A warm glow where the visitor rests: the focal point of the catch.
    const glow = new Mesh(
      new PlaneGeometry(1, 1),
      new ShaderMaterial({
        uniforms: { uGlow: u.uGlow, uSize: u.uGlowSize, uC: u.uCradle },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: AdditiveBlending,
        vertexShader: `uniform float uSize; uniform vec3 uC; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(uC, 1.0); mv.xy += position.xy * uSize; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uGlow; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = (exp(-d * 16.0) * 1.6 + exp(-d * 5.0) * 0.45 + exp(-d * 2.2) * 0.12) * smoothstep(1.0, 0.75, d) * uGlow; gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * 1.8, a); }`,
      }),
    );
    glow.frustumCulled = false;
    glow.renderOrder = 6;
    this.glowMesh = glow;
    this.group.add(glow);
    this.group.scale.setScalar(opts.scale);
    this.updateCradle();
  }

  private updateCradle(): void {
    this.uniforms.uCradle.value.copy(this.cradle).setY(this.cradle.y + this.uniforms.uRise.value * RISE);
  }

  /** World position of the cradle (follows the rise of the hands). */
  cradleWorld(out: Vector3): Vector3 {
    this.updateCradle();
    this.group.updateMatrixWorld();
    return out.copy(this.uniforms.uCradle.value).applyMatrix4(this.group.matrixWorld);
  }

  update(dt: number, pixelRatio: number): void {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uPixel.value = pixelRatio;
    this.updateCradle();
  }

  dispose(): void {
    for (const o of [this.core, this.ribbons, this.glowMesh, this.floor]) {
      if (!o) continue;
      o.geometry.dispose();
      (o.material as ShaderMaterial).dispose();
    }
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
    this.group.removeFromParent();
  }
}
