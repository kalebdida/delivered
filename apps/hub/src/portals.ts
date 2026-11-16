import {
  AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color,
  CylinderGeometry, DirectionalLight, DoubleSide, FogExp2, Group, HalfFloatType, LatheGeometry, LinearFilter, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PointLight, Scene, ShaderMaterial, Shape, ShapeGeometry, SphereGeometry,
  TorusGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import { CloudField, Dust, LightShaft, glsl, type AppId, type QualityTier } from '@delivered/core';

export interface PortalDef {
  id: AppId;
  title: string;
  ref: string;
  /** The light that fills the screen when flying through. */
  light: string;
}

export const PORTALS: PortalDef[] = [
  { id: 'wretched', title: 'WRETCHED', ref: 'Romans 7:24', light: '#FFD9A0' },
  { id: 'underneath', title: 'UNDERNEATH', ref: 'Deuteronomy 33:27', light: '#FFF4DA' },
  { id: 'gain', title: 'GAIN', ref: 'Philippians 1:21', light: '#CFE0FF' },
];

export const ARCH = { width: 1.6, height: 3.5 };

/** The arch outline: straight sides, a round top. */
function archPoints(w: number, h: number, segments = 28): Vector3[] {
  const r = w / 2;
  const pts: Vector3[] = [new Vector3(-r, 0, 0), new Vector3(-r, (h - r) * 0.5, 0)];
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - (i / segments) * Math.PI;
    pts.push(new Vector3(Math.cos(a) * r, h - r + Math.sin(a) * r, 0));
  }
  pts.push(new Vector3(r, (h - r) * 0.5, 0), new Vector3(r, 0, 0));
  return pts;
}

interface Preview {
  scene: Scene;
  camera: PerspectiveCamera;
  update(time: number, dt: number): void;
  dispose(): void;
}

/**
 * The visitor, in the silhouette the three rooms share: a hood drawn back to a soft peak and
 * opening onto shadow, a mantle over the shoulders, a long cloak. Each room dyes it its own colour.
 */
function hooded(color: string, emissive = '#3a2c1e', glow = 0.35): Group {
  const g = new Group();
  const mat = new MeshStandardMaterial({ color, roughness: 0.9, emissive, emissiveIntensity: glow });
  // One unbroken line from the point of the hood, over the shoulders, down the cloak to the hem.
  const profile: [number, number][] = [
    [0, 1.8], [0.055, 1.76], [0.125, 1.66], [0.16, 1.54], [0.155, 1.43], [0.185, 1.36], [0.27, 1.27], [0.305, 1.1], [0.3, 0.8], [0.335, 0.4], [0.4, 0.05], [0.385, 0],
  ];
  const geo = new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 24);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    // The cloak is a little flat front to back, and the crown of the hood is drawn back to a soft point.
    pos.setZ(i, pos.getZ(i) * 0.84 - Math.max(0, y - 1.5) * 0.42);
  }
  geo.computeVertexNormals();
  const cloak = new Mesh(geo, mat);
  const face = new Mesh(new CircleGeometry(0.1, 16), new MeshBasicMaterial({ color: '#0a0807' }));
  face.scale.set(0.9, 1.2, 1);
  face.position.set(0, 1.55, 0.118);
  face.rotation.x = -0.12;
  g.add(cloak, face);
  return g;
}
/** A soft round glow on a camera-facing plane (halos, distant lights). */
function softGlow(color: string, strength: number): Mesh {
  return new Mesh(
    new PlaneGeometry(1, 1),
    new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false,
      uniforms: { uColor: { value: new Color(color) }, uStrength: { value: strength } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.6) * uStrength; gl_FragColor = vec4(uColor * a * 2.0, a); }`,
    }),
  );
}

/** WRETCHED: a dim ash plain, a figure chained to its own shadow, a warm light far away. */
function wretchedPreview(): Preview {
  const scene = new Scene();
  scene.background = new Color('#0c0b0e');
  scene.fog = new FogExp2('#1c1b20', 0.035);
  const camera = new PerspectiveCamera(38, ARCH.width / ARCH.height, 0.1, 200);
  camera.position.set(0.5, 1.5, 6.4);
  camera.lookAt(0, 1.5, -6);
  const ground = new Mesh(new CircleGeometry(60, 48), new MeshStandardMaterial({ color: '#6f6c66', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  const beam = new Mesh(new CylinderGeometry(0.07, 0.07, 60, 8), new MeshBasicMaterial({ color: new Color('#FFD9A0').multiplyScalar(3), fog: false }));
  beam.position.set(0.2, 30.4, -40);
  const halo = softGlow('#FFD9A0', 1.1);
  halo.scale.set(13, 13, 1);
  halo.position.set(0.2, 2.2, -39.5);
  const hill = new Mesh(new SphereGeometry(9, 24, 12), new MeshStandardMaterial({ color: '#5d5a55', roughness: 1 }));
  hill.scale.set(2.4, 0.22, 1);
  hill.position.set(0.2, -0.6, -40);
  // The visitor, seen from behind, facing the far light.
  const figure = hooded('#cfc6b6');
  figure.position.set(-0.16, 0, -0.4);
  figure.rotation.y = Math.PI + 0.12;
  // The double: the same shape, dark, lying in the dust behind them, with two ember eyes.
  const double = hooded('#131115', '#000000', 0);
  double.rotation.set(0, 0.9, Math.PI / 2 - 0.05);
  double.scale.setScalar(0.62);
  double.position.set(0.86, 0.2, 0.25);
  const eyes = new Group();
  for (const dx of [-0.045, 0.045]) {
    const e = new Mesh(new SphereGeometry(0.02, 8, 6), new MeshBasicMaterial({ color: new Color('#FF6A3D').multiplyScalar(3) }));
    e.position.set(0.02 + dx * 0.6, 0.27, 0.72 + dx * 0.7);
    eyes.add(e);
  }
  const chainCurve = new CatmullRomCurve3([new Vector3(-0.1, 0.1, -0.3), new Vector3(0.0, 0.03, 0.2), new Vector3(0.18, 0.03, 0.25), new Vector3(0.42, 0.1, 0.4)]);
  const chain = new Mesh(new TubeGeometry(chainCurve, 24, 0.02, 6), new MeshStandardMaterial({ color: '#8a8890', roughness: 0.4, metalness: 0.9 }));
  const key = new DirectionalLight('#ffd9a0', 3.4);
  key.position.set(0.3, 4, -10);
  const rim = new DirectionalLight('#8f9cc0', 1.5);
  rim.position.set(4, 3, 6);
  const fill = new PointLight('#ffe2b8', 5, 7, 1.6);
  fill.position.set(-1.3, 1.7, 2.2);
  scene.add(ground, hill, beam, halo, figure, double, eyes, chain, key, rim, fill, new AmbientLight('#4a4a58', 1.5));
  const dust = new Dust({ count: 160, bounds: [3, 2, 5], color: '#b8b2a8', size: 3, opacity: 0.4, seed: 'w' });
  dust.points.position.set(0, 1.6, 1);
  scene.add(dust.points);
  return {
    scene,
    camera,
    update(time, dt) {
      dust.update(dt);
      figure.rotation.z = Math.sin(time * 0.9) * 0.012;
      const flare = 2.2 + Math.sin(time * 2.3) * 0.8;
      eyes.children.forEach((e) => ((e as Mesh).material as MeshBasicMaterial).color.set('#FF6A3D').multiplyScalar(flare));
    },
    dispose: () => dust.dispose(),
  };
}

/** UNDERNEATH: golden clouds seen from above, a tiny figure falling, huge soft arms of light below. */
function underneathPreview(tier: QualityTier): Preview {
  const scene = new Scene();
  scene.background = new Color('#7fa6c9');
  const camera = new PerspectiveCamera(46, ARCH.width / ARCH.height, 0.1, 400);
  camera.position.set(0, 14, 5);
  camera.lookAt(0, -10, -3);
  const sun = new Vector3(0.5, 0.45, -0.6).normalize();
  const clouds = new CloudField({
    mode: 'billboard', tier, count: tier === 'low' ? 46 : 80, base: -17, top: -7, extent: 24, coverage: 0.85, density: 1, scale: 13,
    wind: [0.7, 0, 0.25], lightDirection: sun, lightColor: '#fff0cc', shadowColor: '#b98a66', hazeColor: '#f2b866', seed: 'hub',
  });
  // Arms of light: two great soft arcs far below the clouds, open like cupped hands.
  const armMat = new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new Color('#FFE6B4') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      float arc(vec2 p, vec2 c, float r, float w){ float d = abs(length(p - c) - r); return smoothstep(w, 0.0, d); }
      void main(){ vec2 p = vUv * 2.0 - 1.0;
        float breathe = 0.85 + 0.15 * sin(uTime * 0.5);
        float l = arc(p, vec2(0.55, 0.55), 1.05, 0.34) * smoothstep(0.25, -0.5, p.x - p.y * 0.3);
        float r = arc(p, vec2(-0.55, 0.55), 1.05, 0.34) * smoothstep(-0.25, 0.5, p.x + p.y * 0.3);
        float fade = smoothstep(1.0, 0.55, length(p));
        float a = (l + r) * fade * breathe;
        gl_FragColor = vec4(uColor * a * 1.9, a); }`,
  });
  // Just above the cloud tops, so the light of them comes up through the gold.
  const arms = new Mesh(new PlaneGeometry(34, 34), armMat);
  arms.rotation.x = -Math.PI / 2;
  arms.position.set(0, -6.4, -5);
  const figure = new Group();
  const falling = hooded('#7d86b4', '#3e4270', 1.1);
  falling.position.y = -0.8;
  figure.add(falling);
  figure.scale.setScalar(0.8);
  figure.position.set(0, 2, -1.5);
  const key = new DirectionalLight('#fff0cc', 3);
  key.position.copy(sun).multiplyScalar(30);
  scene.add(clouds.object, arms, figure, key, new AmbientLight('#b9c6e6', 1.4));
  return {
    scene,
    camera,
    update(time, dt) {
      clouds.update(dt, camera);
      armMat.uniforms.uTime!.value = time;
      figure.rotation.z = time * 0.35;
      figure.rotation.x = time * 0.22 + 1;
      figure.position.y = 2 + Math.sin(time * 0.5) * 0.6;
      figure.position.x = Math.sin(time * 0.31) * 0.5;
    },
    dispose: () => {
      clouds.dispose();
      armMat.dispose();
    },
  };
}

/** GAIN: a moonlit stone cell with one beam of light and dust in it. */
function gainPreview(): Preview {
  const scene = new Scene();
  scene.background = new Color('#0e0c0b');
  scene.fog = new FogExp2('#0e0c0b', 0.045);
  const camera = new PerspectiveCamera(42, ARCH.width / ARCH.height, 0.1, 60);
  camera.position.set(0.3, 1.5, 5.2);
  camera.lookAt(-0.1, 1.7, 0);
  const wall = new MeshStandardMaterial({ color: '#4a443d', roughness: 0.95, side: BackSide });
  const room = new Mesh(new BoxGeometry(5.2, 5, 9), wall);
  room.position.set(0, 2.5, 0.5);
  // The window: a small bright slot high on the back wall.
  const windowMesh = new Mesh(new PlaneGeometry(0.5, 0.75), new MeshBasicMaterial({ color: new Color('#CFE0FF').multiplyScalar(2.6) }));
  windowMesh.position.set(0.5, 3.45, -3.98);
  const shaft = new LightShaft({ color: '#CFE0FF', length: 6.6, radiusTop: 0.22, radiusBottom: 1.25, intensity: 1.1, motes: 200, seed: 'gain' });
  shaft.group.position.set(0.5, 3.45, -3.9);
  shaft.group.rotation.set(-0.72, 0, -0.16);
  const pool = new PointLight('#CFE0FF', 3.2, 6, 1.8);
  pool.position.set(-0.1, 0.6, -0.3);
  // A seated figure at the edge of the light, a lamp beside it.
  const figure = hooded('#5a5048', '#2a2018', 0.5);
  figure.scale.set(1, 0.7, 1);
  figure.position.set(-0.6, 0, -0.5);
  figure.rotation.y = 0.5;
  const lamp = new Mesh(new SphereGeometry(0.06, 10, 8), new MeshBasicMaterial({ color: new Color('#FFB25C').multiplyScalar(3.2) }));
  lamp.position.set(0.62, 0.3, 0.5);
  const lampLight = new PointLight('#FFB25C', 1.6, 4, 2);
  lampLight.position.copy(lamp.position);
  scene.add(room, windowMesh, shaft.group, pool, figure, lamp, lampLight, new AmbientLight('#2a2a34', 1.2));
  return {
    scene,
    camera,
    update(time, dt) {
      shaft.update(dt);
      lampLight.intensity = 2 + Math.sin(time * 9) * 0.25 + Math.sin(time * 23) * 0.12;
    },
    dispose: () => shaft.dispose(),
  };
}

const WINDOW_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uBright, uOpen, uTime, uIntro; uniform vec3 uLight;
varying vec2 vUv;
${glsl.dither}
void main(){
  vec3 c = texture2D(uMap, vUv).rgb;
  // Dim until hovered; edges of the window fall off like looking into a deep room.
  vec2 q = vUv - 0.5;
  float edge = 1.0 - smoothstep(0.25, 0.62, length(q * vec2(1.0, 0.85)));
  c *= mix(0.66, 1.08, uBright) * mix(0.7, 1.0, edge) * uIntro;
  c += uLight * uOpen * 0.06;
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
}`;

export class Portal {
  readonly group = new Group();
  readonly def: PortalDef;
  /** 0..1 hover amount (eased). */
  hover = 0;
  hovered = false;
  /** 0 dark .. 1 lit: the arch igniting when the hub opens. */
  intro = 1;
  /** Where the portal rests. */
  readonly home = new Vector3();
  private preview: Preview;
  private rt: WebGLRenderTarget;
  private windowMat: ShaderMaterial;
  private frameMat: MeshBasicMaterial;
  private glowMat: ShaderMaterial;
  private seal: Mesh | null = null;
  private phase: number;
  private readonly base = new Vector3();

  constructor(def: PortalDef, index: number, tier: QualityTier) {
    this.def = def;
    this.phase = index * 2.1;
    this.preview = def.id === 'wretched' ? wretchedPreview() : def.id === 'underneath' ? underneathPreview(tier) : gainPreview();
    const res = tier === 'low' ? 192 : tier === 'medium' ? 288 : 400;
    this.rt = new WebGLRenderTarget(res, Math.round((res * ARCH.height) / ARCH.width), { type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: true });
    this.base.copy(this.preview.camera.position);

    const { width: w, height: h } = ARCH;
    const pts = archPoints(w, h);
    const shape = new Shape(pts.map((p) => ({ x: p.x, y: p.y }) as never));
    const geo = new ShapeGeometry(shape, 24);
    const pos = geo.attributes.position!;
    const uv = geo.attributes.uv!;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h);
    this.windowMat = new ShaderMaterial({
      uniforms: { uMap: { value: this.rt.texture }, uBright: { value: 0 }, uOpen: { value: 0 }, uTime: { value: 0 }, uIntro: { value: 1 }, uLight: { value: new Color(def.light) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: WINDOW_FRAG,
    });
    const windowMesh = new Mesh(geo, this.windowMat);
    windowMesh.name = 'window';

    // A frame of thin gold light. HDR color so it is the only thing that blooms.
    const curve = new CatmullRomCurve3(pts, false, 'catmullrom', 0.01);
    this.frameMat = new MeshBasicMaterial({ color: new Color('#F5C76B').multiplyScalar(1.5) });
    const frame = new Mesh(new TubeGeometry(curve, 160, 0.013, 6, false), this.frameMat);
    frame.position.z = 0.01;
    // A soft halo behind the arch so the frame sits in atmosphere.
    this.glowMat = new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uColor: { value: new Color(def.light) }, uAmount: { value: 0.2 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAmount; varying vec2 vUv; ${glsl.dither}
        void main(){ vec2 q = (vUv - 0.5) * vec2(1.0, 0.62); float a = smoothstep(0.5, 0.0, length(q)); a = a * a * uAmount;
        gl_FragColor = vec4(uColor * a + dither(gl_FragCoord.xy) * a, a); }`,
    });
    const glow = new Mesh(new PlaneGeometry(w * 3.4, h * 1.9), this.glowMat);
    glow.position.set(0, h * 0.5, -0.2);
    this.group.add(glow, windowMesh, frame);
  }

  get windowMesh(): Mesh {
    return this.group.getObjectByName('window') as Mesh;
  }

  /** Add the small gold seal a completed room earns. */
  setSealed(sealed: boolean): void {
    if (sealed && !this.seal) {
      const g = new BufferGeometry().copy(new TorusGeometry(0.075, 0.012, 8, 28));
      this.seal = new Mesh(g, new MeshBasicMaterial({ color: new Color('#FFE9B0').multiplyScalar(2.4) }));
      this.seal.position.set(0, ARCH.height + 0.2, 0.02);
      const dot = new Mesh(new SphereGeometry(0.024, 10, 8), this.seal.material);
      this.seal.add(dot);
      this.group.add(this.seal);
    } else if (!sealed && this.seal) {
      this.seal.removeFromParent();
      this.seal = null;
    }
  }

  /** Render this portal's world into its window. */
  render(renderer: WebGLRenderer, time: number, dt: number, pointer: { x: number; y: number }): void {
    this.preview.update(time, dt);
    // Parallax: the preview camera shifts with the pointer, so the window has real depth.
    const cam = this.preview.camera;
    cam.position.x = this.base.x + pointer.x * 0.35;
    cam.position.y = this.base.y - pointer.y * 0.2;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.rt);
    renderer.render(this.preview.scene, cam);
    renderer.setRenderTarget(prev);
  }

  update(time: number, dt: number, reduced: boolean): void {
    this.hover += ((this.hovered ? 1 : 0) - this.hover) * (1 - Math.exp(-7 * dt));
    const breathe = reduced ? 0 : Math.sin(time * 0.5 + this.phase);
    this.group.position.set(this.home.x, this.home.y + breathe * 0.07, this.home.z + this.hover * 0.35);
    this.group.rotation.y = (reduced ? 0 : Math.sin(time * 0.31 + this.phase) * 0.035) - this.home.x * 0.03;
    // Ignition: the frame flares as it catches, then settles; the world behind it comes up with it.
    const k = this.intro;
    const lit = k * k * (3 - 2 * k);
    const flare = Math.sin(Math.PI * k) ** 2;
    const s = (1 + this.hover * 0.045) * (0.95 + 0.05 * lit);
    this.group.scale.setScalar(s);
    this.windowMat.uniforms.uBright!.value = this.hover;
    this.windowMat.uniforms.uOpen!.value = this.hover + flare * 2.5;
    this.windowMat.uniforms.uIntro!.value = lit;
    this.frameMat.color.set('#F5C76B').multiplyScalar((1.35 + this.hover * 1.6 + breathe * 0.12) * lit + flare * 3);
    this.glowMat.uniforms.uAmount!.value = (0.16 + this.hover * 0.26 + breathe * 0.02) * lit + flare * 0.32;
  }

  dispose(): void {
    this.preview.dispose();
    this.rt.dispose();
  }
}
