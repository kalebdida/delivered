// A stylized Mediterranean at night, for the letter's flight (CH3) and the view from above (CH6).
// Coastlines are hand-simplified from real coordinates (km east and south of Rome), extruded low
// and dark, over a moonlit sea. Rome and Philippi are small clusters of warm lights. 1 km = 0.02.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Shape,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { Sky, glsl, seededRandom } from '@delivered/core';

export const KM = 0.02;

/** km east, km south of Rome → world (x, z). */
const P = (x: number, z: number) => new Vector2(x * KM, z * KM);

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
uniform float uTime; uniform vec3 uMoonDir; varying vec3 vWorld;
${glsl.hash}
${glsl.simplex3D}
${glsl.dither}
void main(){
  vec2 p = vWorld.xz;
  float n = snoise(vec3(p * 1.4, uTime * 0.08)) * 0.5 + snoise(vec3(p * 4.0, uTime * 0.15)) * 0.25;
  vec3 deep = vec3(0.012, 0.025, 0.055);
  vec3 shallow = vec3(0.03, 0.06, 0.1);
  vec3 c = mix(deep, shallow, 0.5 + 0.5 * n);
  // A road of moonlight on the water, glinting.
  float glint = pow(max(0.0, snoise(vec3(p * 22.0, uTime * 0.6))), 6.0);
  float road = exp(-pow((p.x - p.y * 0.4 - 10.0) * 0.18, 2.0));
  c += vec3(0.75, 0.82, 1.0) * glint * (0.35 + road * 1.8);
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
}`;

export class MapWorld {
  readonly group = new Group();
  readonly sky: Sky;
  private seaMat: ShaderMaterial;
  private lightsMat: ShaderMaterial;
  private time = 0;

  constructor() {
    const rng = seededRandom('map');
    this.sky = new Sky(800);
    this.sky.set({ zenith: '#03050c', horizon: '#0f1730', ground: '#05060a', sun: '#CFE0FF', stars: 1, sunSize: 0.02, sunGlow: 0.4, sunIntensity: 3 });
    this.sky.setSun(30, 3.6);
    this.group.add(this.sky.mesh);

    this.seaMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uMoonDir: { value: new Vector3(-0.3, 0.6, -0.7) } },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: SEA_FRAG,
    });
    const sea = new Mesh(new PlaneGeometry(90, 60).rotateX(-Math.PI / 2), this.seaMat);
    sea.position.set(14, -0.02, 4);
    this.group.add(sea);

    const land = new MeshStandardMaterial({ color: '#5a5c66', roughness: 0.95, emissive: '#151a28', emissiveIntensity: 1 });
    const rim = new MeshStandardMaterial({ color: '#66666e', roughness: 0.95, emissive: '#151a28', emissiveIntensity: 1 });
    const addLand = (pts: readonly (readonly number[])[], height: number, mat: MeshStandardMaterial) => {
      const shape = new Shape(pts.map(([x, z]) => P(x!, z!)));
      const g = new ExtrudeGeometry(shape, { depth: height, bevelEnabled: true, bevelThickness: height * 0.6, bevelSize: 0.08, bevelSegments: 2, curveSegments: 4 });
      g.rotateX(Math.PI / 2);
      g.computeVertexNormals();
      const m = new Mesh(g, mat);
      m.position.y = height;
      this.group.add(m);
    };
    addLand(ITALY, 0.12, land);
    addLand(BALKANS, 0.14, land);
    addLand(ANATOLIA, 0.12, land);
    addLand(SICILY, 0.08, rim);
    addLand(CRETE, 0.08, rim);
    for (const [[x, z], r] of ISLANDS) {
      const pts: number[][] = [];
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = r * (0.7 + rng() * 0.6);
        pts.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr]);
      }
      addLand(pts, 0.04, rim);
    }

    // City lights: Rome a broad warm cluster, Philippi small; scattered villages along the road.
    const lights: number[] = [];
    const sizes: number[] = [];
    const cluster = (cx: number, cz: number, n: number, spread: number, size: number) => {
      for (let i = 0; i < n; i++) {
        const r = Math.pow(rng(), 0.6) * spread;
        const a = rng() * Math.PI * 2;
        lights.push((cx + Math.cos(a) * r) * KM, 0.32, (cz + Math.sin(a) * r) * KM);
        sizes.push(size * (0.5 + rng()));
      }
    };
    cluster(-10, 0, 260, 22, 3);
    cluster(990, 100, 60, 8, 3);
    for (let i = 0; i < 70; i++) {
      const p = ROUTE.getPoint(rng());
      lights.push(p.x + (rng() - 0.5) * 1.2, 0.3, p.z + (rng() - 0.5) * 1.2);
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

    const moon = new DirectionalLight('#9fb3dd', 2.2);
    moon.position.set(-20, 30, -20);
    this.group.add(moon, new HemisphereLight('#25324f', '#0b0a0a', 0.6));
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

  constructor(size = 0.08) {
    const mat = new ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); gl_Position = projectionMatrix * c; }',
      fragmentShader: 'varying vec2 vUv; void main(){ float d = length(vUv - 0.5); float a = exp(-d * 9.0) + exp(-d * 30.0) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a * 2.4, 1.0); }',
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
    this.group.add(this.head, this.trail);
  }

  /** Move the head; the trail follows. */
  moveTo(p: Vector3): void {
    this.trailPos.copyWithin(3, 0, (this.n - 1) * 3);
    this.trailPos[0] = p.x;
    this.trailPos[1] = p.y;
    this.trailPos[2] = p.z;
    this.head.position.copy(p);
    this.trail.geometry.attributes.position!.needsUpdate = true;
  }

  /** Put the whole trail at one point (no streak across the world on the first frame). */
  reset(p: Vector3): void {
    for (let i = 0; i < this.n; i++) this.trailPos.set([p.x, p.y, p.z], i * 3);
    this.head.position.copy(p);
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

