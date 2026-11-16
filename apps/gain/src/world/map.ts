// A stylized Mediterranean at night, for the letter's flight (CH3) and the view from above (CH6).
// Coastlines are hand-simplified from real coordinates (km east and south of Rome), extruded low
// and dark, over a moonlit sea. Rome and Philippi are small clusters of warm lights. 1 km = 0.02.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type Material,
} from 'three';
import { Sky, createNoise, glsl, seededRandom } from '@delivered/core';

export const KM = 0.02;


const ITALY = [
  [-300, -278], [-215, -150], [-120, -70], [-20, 6], [60, 70], [150, 117], [215, 230], [262, 330], [260, 433], [300, 400], [330, 300],
  [395, 175], [430, 190], [500, 233], [470, 150], [455, 144], [368, 89], [300, 20], [293, -10], [200, -110], [84, -189], [40, -300],
  [-17, -390], [-60, -470], [-200, -520], [-380, -470], [-420, -360],
];
const BALKANS = [
  [110, -410], [200, -300], [327, -178], [400, -120], [470, -78], [540, 0], [580, 67], [588, 155], [620, 255], [690, 322], [774, 411],
  [757, 522], [800, 590], [841, 611], [860, 560], [883, 578], [866, 478], [940, 450], [960, 410], [967, 378], [910, 330], [874, 278],
  [880, 220], [870, 160], [910, 190], [950, 240], [960, 200], [985, 150], [1000, 111], [1125, 117], [1250, 120], [1378, 100],
  [1700, 100], [1700, -700], [110, -700],
];
const ANATOLIA = [[1420, 160], [1700, 160], [1700, 900], [1300, 900], [1230, 700], [1260, 520], [1300, 380], [1350, 250]];
const SICILY = [[90, 400], [200, 395], [306, 420], [260, 545], [150, 520], [100, 470]];
const CRETE = [[924, 733], [1050, 720], [1160, 745], [1120, 765], [1000, 768], [930, 755]];
const ISLANDS = [[[1040, 500], 18], [[1080, 560], 14], [[1120, 470], 16], [[1160, 600], 20], [[1010, 640], 12], [[1240, 300], 22], [[1200, 230], 14], [[680, 380], 14]] as const;

export const ROME = new Vector3(-10 * KM, 0, 0);
export const PHILIPPI = new Vector3(990 * KM, 0, 100 * KM);
/** The letter's road: over the Apennines to Brundisium, across to Dyrrachium, along the Via Egnatia. */
export const ROUTE = new CatmullRomCurve3([
  new Vector3(-10, 0.2 / KM, 0),
  new Vector3(200, 2.4 / KM, 80),
  new Vector3(455, 3.2 / KM, 144),
  new Vector3(520, 3.0 / KM, 110),
  new Vector3(580, 2.6 / KM, 67),
  new Vector3(740, 2.8 / KM, 120),
  new Vector3(870, 2.2 / KM, 144),
  new Vector3(990, 0.3 / KM, 100),
].map((v) => v.multiplyScalar(KM)));

const SEA_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uMoonDir; uniform vec3 uHorizon; varying vec3 vWorld;
${glsl.hash}
${glsl.simplex3D}
${glsl.dither}
float waves(vec2 p){ return snoise(vec3(p * 1.4, uTime * 0.08)) * 0.5 + snoise(vec3(p * 4.0, uTime * 0.15)) * 0.25 + snoise(vec3(p * 11.0, uTime * 0.4)) * 0.08; }
void main(){
  vec2 p = vWorld.xz;
  float n = waves(p);
  float e = 0.02;
  vec3 N = normalize(vec3(-(waves(p + vec2(e, 0.0)) - n) / e * 0.035, 1.0, -(waves(p + vec2(0.0, e)) - n) / e * 0.035));
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 deep = vec3(0.014, 0.03, 0.065);
  vec3 shallow = vec3(0.035, 0.07, 0.12);
  vec3 c = mix(deep, shallow, 0.5 + 0.5 * n);
  // The sky in the water toward the horizon (fresnel), so the sea never reads as a flat slab.
  float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  c = mix(c, uHorizon, clamp(fr * 0.9, 0.0, 0.85));
  // The moon's road: a sharp glitter and a broad sheen along the real reflection.
  vec3 R = reflect(-V, N);
  float m = max(dot(R, normalize(uMoonDir)), 0.0);
  float glint = pow(max(0.0, snoise(vec3(p * 22.0, uTime * 0.6))), 4.0);
  c += vec3(0.78, 0.85, 1.0) * (pow(m, 260.0) * 2.4 + pow(m, 24.0) * 0.18 + glint * pow(m, 6.0) * 0.9);
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
}`;

/** All coast polygons (km), each with how high its mountains rise. */
const LANDS: [readonly (readonly number[])[], number][] = [
  [ITALY, 0.55],
  [BALKANS, 0.75],
  [ANATOLIA, 0.6],
  [SICILY, 0.4],
  [CRETE, 0.45],
];

function inside(px: number, pz: number, poly: readonly (readonly number[])[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi! > pz !== zj! > pz && px < ((xj! - xi!) * (pz - zi!)) / (zj! - zi!) + xi!) c = !c;
  }
  return c;
}

function edgeDist(px: number, pz: number, poly: readonly (readonly number[])[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j]!;
    const [bx, bz] = poly[i]!;
    const dx = bx! - ax!;
    const dz = bz! - az!;
    const t = Math.max(0, Math.min(1, ((px - ax!) * dx + (pz - az!) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(px - ax! - t * dx, pz - az! - t * dz));
  }
  return best;
}

export interface MapOptions {
  /** Moon elevation (degrees) and azimuth (radians). Default high behind the start of the route. */
  moon?: [number, number];
}

export class MapWorld {
  readonly group = new Group();
  readonly sky: Sky;
  private seaMat: ShaderMaterial;
  private lightsMat: ShaderMaterial;
  private time = 0;

  constructor(opts: MapOptions = {}) {
    const rng = seededRandom('map');
    this.sky = new Sky(800);
    this.sky.set({ zenith: '#03050c', horizon: '#0f1730', ground: '#05060a', sun: '#CFE0FF', stars: 1, sunSize: 0.02, sunGlow: 0.4, sunIntensity: 3 });
    const [elev, az] = opts.moon ?? [30, 3.6];
    this.sky.setSun(elev, az);
    this.group.add(this.sky.mesh);

    this.seaMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMoonDir: { value: this.sky.sunDirection.clone() }, uHorizon: { value: new Color('#1d2a4e') } },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: SEA_FRAG,
    });
    const sea = new Mesh(new PlaneGeometry(320, 260).rotateX(-Math.PI / 2), this.seaMat);
    sea.position.set(14, -0.02, 4);
    this.group.add(sea);

    // The land: one heightfield with soft coasts and moonlit ridges (mountains rise away from the
    // shore), coloured by height: pale shingle at the water, dark scrub, grey stone on the ridges.
    const noise = createNoise('map-land');
    const isles = ISLANDS.map(([[x, z], r]) => {
      const pts: number[][] = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * (0.7 + rng() * 0.6);
        pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
      }
      return [pts, 0.18] as [number[][], number];
    });
    const lands = [...LANDS, ...isles];
    const X0 = -9, X1 = 35, Z0 = -15, Z1 = 19;
    const NX = 240, NZ = 186;
    const geo = new PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ).rotateX(-Math.PI / 2);
    geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
    const pos = geo.attributes.position!;
    const col = new Float32Array(pos.count * 3);
    const shore = new Color('#8a8578');
    const scrub = new Color('#3c4436');
    const stone = new Color('#6e6c70');
    const tmp = new Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const kx = x / KM;
      const kz = z / KM;
      let land = -1;
      let dist = Infinity;
      for (const [poly, peak] of lands) {
        const d = edgeDist(kx, kz, poly) * KM;
        if (inside(kx, kz, poly)) land = Math.max(land, peak);
        dist = Math.min(dist, d);
      }
      let y: number;
      if (land > 0) {
        const ridge = 1 - Math.abs(noise.fbm2(x * 0.17, z * 0.17, 3));
        const up = Math.min(1, dist / 1.4);
        y = 0.03 + Math.min(1, dist / 0.25) * 0.05 + ridge * ridge * ridge * land * 0.9 * up;
        const hk = Math.min(1, y / (land * 0.7 + 0.01));
        tmp.copy(shore).lerp(scrub, Math.min(1, dist / 0.18)).lerp(stone, Math.max(0, hk - 0.35) * 1.4);
      } else {
        y = -0.04 - Math.min(1, dist / 0.6) * 0.2;
        tmp.copy(shore).multiplyScalar(0.6);
      }
      pos.setY(i, y);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const terrain = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, emissive: '#0c1020', emissiveIntensity: 1 }));
    this.group.add(terrain);

    // City lights: Rome a broad warm cluster, Philippi small; scattered villages along the road.
    const lights: number[] = [];
    const sizes: number[] = [];
    const cluster = (cx: number, cz: number, n: number, spread: number, size: number) => {
      for (let i = 0; i < n; i++) {
        const r = Math.pow(rng(), 0.6) * spread;
        const a = rng() * Math.PI * 2;
        lights.push((cx + Math.cos(a) * r) * KM, 0.14, (cz + Math.sin(a) * r) * KM);
        sizes.push(size * (0.5 + rng()));
      }
    };
    cluster(-10, 0, 260, 22, 3);
    cluster(990, 100, 60, 8, 3);
    for (let i = 0; i < 70; i++) {
      const p = ROUTE.getPoint(rng());
      lights.push(p.x + (rng() - 0.5) * 1.2, 0.16, p.z + (rng() - 0.5) * 1.2);
      sizes.push(1.5 + rng() * 1.5);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(lights), 3));
    g.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1));
    this.lightsMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) } },
      vertexShader: `attribute float aSize; uniform float uPixelRatio, uTime; varying float vTw;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
          vTw = 0.75 + 0.25 * sin(uTime * 2.0 + position.x * 40.0);
          gl_PointSize = aSize * uPixelRatio * clamp(6.0 / -mv.z, 0.6, 3.0); }`,
      fragmentShader: `varying float vTw; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.7, 0.36) * a * a * vTw * 2.2, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const pts = new Points(g, this.lightsMat);
    pts.frustumCulled = false;
    this.group.add(pts);

    // Key: the moon, from where it hangs in the sky. Rim: a cool light from the opposite side that
    // picks out the ridges. Fill: the night sky.
    const moon = new DirectionalLight('#b0c2ea', 3.2);
    moon.position.copy(this.sky.sunDirection).multiplyScalar(40);
    const rim = new DirectionalLight('#6f84bd', 1.2);
    rim.position.set(-this.sky.sunDirection.x * 40, 20, -this.sky.sunDirection.z * 40);
    this.group.add(moon, rim, new HemisphereLight('#2c3a60', '#0b0a0a', 0.9));
  }

  update(dt: number): void {
    this.time += dt;
    this.sky.update(dt);
    this.seaMat.uniforms.uTime!.value = this.time;
    this.lightsMat.uniforms.uTime!.value = this.time;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
    this.sky.dispose();
    this.group.removeFromParent();
  }
}

/** A streak of light with a fading trail (the rolled letter in flight). */
export class Streak {
  readonly group = new Group();
  private head: Mesh;
  private trail: Points;
  private trailPos: Float32Array;
  private readonly n = 90;
  private glow: PointLight;

  /** Warm light the letter casts on what is under it (0 = none). */
  set light(v: number) {
    this.glow.intensity = v;
  }

  constructor(size = 0.08) {
    const mat = new ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); gl_Position = projectionMatrix * c; }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv - 0.5); float a = (exp(-d * 9.0) + exp(-d * 30.0) * 2.0) * smoothstep(0.5, 0.32, d); gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * 2.4, 1.0); }',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.head = new Mesh(new PlaneGeometry(1, 1), mat);
    this.head.scale.setScalar(size * 6);
    this.head.renderOrder = 40;
    this.trailPos = new Float32Array(this.n * 3);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.trailPos, 3));
    const fade = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) fade[i] = 1 - i / this.n;
    g.setAttribute('aFade', new BufferAttribute(fade, 1));
    this.trail = new Points(
      g,
      new ShaderMaterial({
        uniforms: { uSize: { value: size * 260 } },
        vertexShader: 'attribute float aFade; uniform float uSize; varying float vF; void main(){ vF = aFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * aFade / max(-mv.z, 0.2); }',
        fragmentShader: 'varying float vF; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * a * vF * 1.3, 1.0); }',
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    this.trail.frustumCulled = false;
    this.glow = new PointLight('#ffc77a', 0, size * 60, 1.6);
    this.group.add(this.head, this.trail, this.glow);
  }

  /** Move the head; the trail follows. */
  moveTo(p: Vector3): void {
    this.trailPos.copyWithin(3, 0, (this.n - 1) * 3);
    this.trailPos[0] = p.x;
    this.trailPos[1] = p.y;
    this.trailPos[2] = p.z;
    this.head.position.copy(p);
    this.glow.position.copy(p);
    this.trail.geometry.attributes.position!.needsUpdate = true;
  }

  /** Put the whole trail at one point (no streak across the world on the first frame). */
  reset(p: Vector3): void {
    for (let i = 0; i < this.n; i++) this.trailPos.set([p.x, p.y, p.z], i * 3);
    this.head.position.copy(p);
    this.glow.position.copy(p);
  }

  get position(): Vector3 {
    return this.head.position;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}

