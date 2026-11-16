// Floating islands of pale stone and grass, and the six things people lean on.
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry,
  InstancedMesh, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, ShaderMaterial, SphereGeometry,
  TorusGeometry, Vector3, type Material,
} from 'three';
import { createNoise, seededRandom } from '@delivered/core';

const noise = createNoise('islands');

/** Shared clock for the grass sway (World advances it). */
export const GRASS = { uTime: { value: 0 } };

let tuftGeo: BufferGeometry | null = null;
/** A tuft of three curved blades, dark at the root and gold at the tip. */
function grassTuft(): BufferGeometry {
  if (tuftGeo) return tuftGeo;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const root = new Color('#7f8a3c');
  const tip = new Color('#f4e092');
  const c = new Color();
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI * 2 + 0.4;
    const h = 0.22 + b * 0.05;
    const lean = 0.07 + b * 0.03;
    const base = pos.length / 3;
    for (let k = 0; k <= 3; k++) {
      const v = k / 3;
      const w = 0.04 * (1 - v * 0.92);
      const out = lean * v * v;
      const cx = Math.cos(a) * out;
      const cz = Math.sin(a) * out;
      const sx = -Math.sin(a) * w;
      const sz = Math.cos(a) * w;
      pos.push(cx - sx, h * v, cz - sz, cx + sx, h * v, cz + sz);
      c.copy(root).lerp(tip, Math.pow(v, 0.8));
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (k < 3) {
        const i = base + k * 2;
        idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      }
    }
  }
  tuftGeo = new BufferGeometry();
  tuftGeo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  tuftGeo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  tuftGeo.setIndex(idx);
  tuftGeo.computeVertexNormals();
  return tuftGeo;
}

let grassMat: MeshStandardMaterial | null = null;
function grassMaterial(): MeshStandardMaterial {
  if (grassMat) return grassMat;
  // Emissive warmth stands in for the light coming through backlit blades.
  grassMat = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: DoubleSide, emissive: new Color('#7a5c1c'), emissiveIntensity: 0.55 });
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GRASS);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
        float sway = sin(uTime * 1.6 + ph) * 0.7 + sin(uTime * 2.9 + ph * 1.7) * 0.3;
        transformed.x += sway * 0.07 * position.y * position.y / 0.12;
        transformed.z += sway * 0.035 * position.y * position.y / 0.12;
      #endif`,
    );
  };
  grassMat.customProgramCacheKey = () => 'underneath-grass';
  return grassMat;
}

export const MATERIALS = () => ({
  grass: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, vertexColors: true }),
  turf: new MeshStandardMaterial({ color: '#c2b874', roughness: 0.95 }),
  rock: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, vertexColors: true, flatShading: true }),
  gold: new MeshStandardMaterial({ color: '#f5c76b', metalness: 0.85, roughness: 0.28, emissive: new Color('#5a3a10'), emissiveIntensity: 0.25 }),
  stone: new MeshStandardMaterial({ color: '#d9cbb3', roughness: 0.8 }),
  bridge: new MeshStandardMaterial({ color: '#b7a184', roughness: 0.92 }),
  dark: new MeshStandardMaterial({ color: '#5b4a52', roughness: 0.8 }),
  cloth: new MeshStandardMaterial({ color: '#7a2e3a', roughness: 0.7 }),
});
export type Mats = ReturnType<typeof MATERIALS>;

/** The rocky underside: an inverted, noisy cone with warm strata. */
export function islandUnderside(radius: number, seed: number, mat: Material): Mesh {
  const depth = radius * (1.3 + (seed % 3) * 0.2);
  const geo = new ConeGeometry(radius, depth, 22, 8, true);
  geo.rotateX(Math.PI);
  geo.translate(0, -depth / 2 - 0.25, 0);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = noise.noise3(x * 0.6 + seed, y * 0.5, z * 0.6) * 0.35 + noise.noise3(x * 2 + seed, y * 2, z * 2) * 0.12;
    const k = 1 + n;
    pos.setXYZ(i, x * k, y + n * 0.4, z * k);
    const strata = 0.5 + 0.5 * Math.sin(y * 3.1 + n * 4);
    c.set('#e2d4bc').lerp(new Color('#a88f7a'), strata * 0.45 + Math.min(0.4, -y / depth) * 0.6);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/** The grassy top as one mesh (for islands that never crumble). */
export function islandTop(radius: number, seed: number, mat: Material): Mesh {
  const geo = new CylinderGeometry(radius, radius * 0.97, 0.5, 40, 2);
  geo.translate(0, -0.25, 0);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const n = noise.noise2(x * 0.4 + seed, z * 0.4);
    if (r > radius * 0.5) {
      const k = 1 + noise.noise2(Math.atan2(z, x) * 2 + seed, seed) * 0.06;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    const top = y > -0.01;
    c.set(top ? '#b9b66e' : '#c9b48f').lerp(new Color(top ? '#d8c27a' : '#a8937a'), 0.5 + n * 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const m = new Mesh(geo, mat);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

/** Tufts of grass and a few stones for life on a top. */
export function islandDetail(radius: number, seed: number, mats: Mats): Group {
  const g = new Group();
  const rng = seededRandom(seed);
  const n = Math.round(radius * radius * 8);
  const tufts = new InstancedMesh(grassTuft(), grassMaterial(), n);
  const o = new Object3D();
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius * 0.92;
    o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    o.rotation.set((rng() - 0.5) * 0.3, rng() * 6, (rng() - 0.5) * 0.3);
    o.scale.setScalar(0.55 + rng() * 0.8);
    o.updateMatrix();
    tufts.setMatrixAt(i, o.matrix);
  }
  tufts.receiveShadow = true;
  g.add(tufts);
  for (let i = 0; i < Math.round(radius); i++) {
    const s = new Mesh(new IcosahedronGeometry(0.15 + rng() * 0.25, 0), mats.stone);
    const a = rng() * Math.PI * 2;
    const r = radius * (0.6 + rng() * 0.35);
    s.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    s.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    s.castShadow = true;
    g.add(s);
  }
  return g;
}

export function makeIsland(radius: number, seed: number, mats: Mats): Group {
  const g = new Group();
  g.add(islandTop(radius, seed, mats.grass), islandUnderside(radius * 0.96, seed, mats.rock), islandDetail(radius, seed, mats));
  return g;
}

// ---------------------------------------------------------------------------------------------
// The six things people lean on. Each one holds for a moment, then fails in its own way.

export type SculptureKind = 'coins' | 'crown' | 'mirror' | 'books' | 'throne' | 'idol';
export const SCULPTURES: SculptureKind[] = ['coins', 'crown', 'mirror', 'books', 'throne', 'idol'];

interface Bit {
  o: Object3D;
  v: Vector3;
  spin: Vector3;
}

export class Sculpture {
  readonly group = new Group();
  /** Seconds since it began to fail; < 0 while intact. */
  failing = -1;
  done = false;
  private bits: Bit[] = [];
  private sand: Points | null = null;
  private sandVel: Float32Array | null = null;
  /** The island it stands on (tilts or sinks for some). */
  island: Group | null = null;

  constructor(
    readonly kind: SculptureKind,
    private readonly mats: Mats,
  ) {
    const m = mats;
    const add = (mesh: Mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    const rng = seededRandom(kind);
    if (kind === 'coins') {
      const coin = new CylinderGeometry(0.42, 0.42, 0.07, 24);
      for (let i = 0; i < 46; i++) {
        const c = add(new Mesh(coin, m.gold));
        c.position.set((rng() - 0.5) * 0.08, 0.04 + i * 0.075, (rng() - 0.5) * 0.08);
        c.rotation.y = rng() * 3;
      }
    } else if (kind === 'crown') {
      add(new Mesh(new BoxGeometry(1.0, 1.4, 1.0), m.stone)).position.y = 0.7;
      add(new Mesh(new BoxGeometry(1.25, 0.14, 1.25), m.stone)).position.y = 1.45;
      const crown = new Group();
      crown.add(new Mesh(new TorusGeometry(0.42, 0.09, 10, 32), m.gold));
      crown.children[0]!.rotation.x = Math.PI / 2;
      for (let i = 0; i < 8; i++) {
        const sp = new Mesh(new ConeGeometry(0.08, 0.38, 6), m.gold);
        const a = (i / 8) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.42, 0.2, Math.sin(a) * 0.42);
        sp.castShadow = true;
        crown.add(sp);
      }
      crown.position.y = 1.62;
      this.group.add(crown);
    } else if (kind === 'mirror') {
      const frame = add(new Mesh(new BoxGeometry(1.7, 3.2, 0.18), m.gold));
      frame.position.y = 1.75;
      const glass = new ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }`,
        fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
          void main(){ vec3 v = normalize(vW - cameraPosition); vec3 r = reflect(v, normalize(vN));
            vec3 sky = mix(vec3(0.95,0.72,0.45), vec3(0.42,0.58,0.8), smoothstep(-0.1, 0.6, r.y));
            float streak = smoothstep(0.02, 0.0, abs(vUv.x - vUv.y * 0.4 - 0.3)) * 0.4;
            gl_FragColor = vec4(sky * 1.05 + streak, 1.0); }`,
      });
      const g = add(new Mesh(new PlaneGeometry(1.45, 2.95), glass));
      g.position.set(0, 1.75, 0.1);
    } else if (kind === 'books') {
      const colors = ['#6b4a3a', '#3a4a6b', '#7a2e3a', '#4a5a3a', '#8a7a5a', '#2e3a4a'];
      let y = 0;
      for (let i = 0; i < 22; i++) {
        const h = 0.12 + rng() * 0.1;
        const b = add(new Mesh(new BoxGeometry(0.9 + rng() * 0.3, h, 0.65 + rng() * 0.2), new MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8 })));
        b.position.set((rng() - 0.5) * 0.1, y + h / 2, (rng() - 0.5) * 0.1);
        b.rotation.y = (rng() - 0.5) * 0.4;
        y += h;
        if (i % 6 === 5) {
          const scroll = add(new Mesh(new CylinderGeometry(0.06, 0.06, 0.8, 10), m.stone));
          scroll.rotation.z = Math.PI / 2;
          scroll.position.set(0, y + 0.06, 0.1);
          y += 0.12;
        }
      }
    } else if (kind === 'throne') {
      add(new Mesh(new BoxGeometry(1.3, 0.25, 1.2), m.gold)).position.y = 0.55;
      add(new Mesh(new BoxGeometry(1.3, 0.42, 1.2), m.cloth)).position.y = 0.21;
      const back = add(new Mesh(new BoxGeometry(1.3, 2.2, 0.2), m.gold));
      back.position.set(0, 1.6, -0.5);
      for (const s of [-1, 1]) add(new Mesh(new BoxGeometry(0.16, 0.5, 1.1), m.gold)).position.set(s * 0.6, 0.9, 0);
      add(new Mesh(new BoxGeometry(1.0, 0.25, 0.9), m.cloth)).position.set(0, 0.8, 0);
      add(new Mesh(new SphereGeometry(0.16, 12, 8), m.gold)).position.set(0, 2.78, -0.5);
    } else {
      add(new Mesh(new CylinderGeometry(0.55, 0.75, 0.5, 8), m.stone)).position.y = 0.25;
      add(new Mesh(new CylinderGeometry(0.32, 0.5, 2.0, 10), m.stone)).position.y = 1.5;
      const head = add(new Mesh(new SphereGeometry(0.42, 18, 14), m.stone));
      head.position.y = 2.85;
      head.name = 'head';
      // The hollow: a dark disc where a face would be.
      const hollow = add(new Mesh(new SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), m.dark));
      hollow.rotation.x = Math.PI / 2;
      hollow.position.set(0, 2.85, 0.2);
      hollow.scale.set(1, 0.55, 1);
      hollow.name = 'hollow';
      (hollow.material as MeshStandardMaterial).side = DoubleSide;
    }
  }

  /** The point a visitor leans against (local). */
  get leanHeight(): number {
    return { coins: 1.4, crown: 1.2, mirror: 1.4, books: 1.4, throne: 1.0, idol: 1.4 }[this.kind];
  }

  /** Start failing. `dir` is the direction the visitor leaned (world, horizontal). */
  fail(dir: Vector3): void {
    if (this.failing >= 0) return;
    this.failing = 0;
    const rng = seededRandom(this.kind + 'fail');
    const scatter = (o: Object3D, speed: number) => {
      const v = new Vector3(dir.x * speed + (rng() - 0.5) * speed, rng() * speed * 0.6, dir.z * speed + (rng() - 0.5) * speed);
      this.bits.push({ o, v, spin: new Vector3(rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3) });
    };
    if (this.kind === 'coins') {
      this.group.children.forEach((c, i) => setTimeout(() => scatter(c, 1.5 + (i / 46) * 3), i * 25));
    } else if (this.kind === 'mirror') {
      // The glass becomes falling sand.
      const n = 2600;
      const pos = new Float32Array(n * 3);
      this.sandVel = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos.set([(rng() - 0.5) * 1.45, 0.3 + rng() * 2.95, 0.1], i * 3);
        this.sandVel.set([(rng() - 0.5) * 0.6 + dir.x * 0.5, rng() * 0.3, (rng() - 0.5) * 0.6 + dir.z * 0.5], i * 3);
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(pos, 3));
      this.sand = new Points(geo, new PointsMaterial({ color: '#e8d2a8', size: 0.05, sizeAttenuation: true, transparent: true, opacity: 1 }));
      this.group.add(this.sand);
      const glass = this.group.children[1]!;
      glass.visible = false;
      scatter(this.group.children[0]!, 0.8);
    } else if (this.kind === 'books') {
      this.group.children.forEach((c, i) => setTimeout(() => scatter(c, 2.5 + rng() * 2), i * 70));
    } else if (this.kind === 'idol') {
      const head = this.group.getObjectByName('head')!;
      const hollow = this.group.getObjectByName('hollow')!;
      // Fragments collapse inward, then fall.
      const frag = new IcosahedronGeometry(0.09, 0);
      for (let i = 0; i < 40; i++) {
        const f = new Mesh(frag, this.mats.stone);
        const a = rng() * Math.PI * 2;
        const b = Math.acos(rng() * 2 - 1);
        f.position.set(Math.sin(b) * Math.cos(a) * 0.4, 2.85 + Math.cos(b) * 0.4, Math.sin(b) * Math.sin(a) * 0.4);
        f.castShadow = true;
        this.group.add(f);
        const v = new Vector3(-f.position.x * 2, 2.85 - f.position.y, -f.position.z * 2).multiplyScalar(1.4);
        this.bits.push({ o: f, v, spin: new Vector3(rng() * 4, rng() * 4, rng() * 4) });
      }
      head.visible = false;
      hollow.visible = false;
    }
  }

  /** Returns true while still animating. */
  update(dt: number): boolean {
    if (this.failing < 0) return false;
    this.failing += dt;
    const t = this.failing;
    const g = 9.8;
    for (const b of this.bits) {
      if (this.kind === 'idol' && t < 0.5) b.v.multiplyScalar(0.94);
      else b.v.y -= g * dt * (this.kind === 'books' ? 0.12 : 1);
      if (this.kind === 'books') {
        b.v.x += Math.sin(t * 3 + b.spin.x) * dt * 3;
        b.v.y += dt * 1.2;
      }
      b.o.position.addScaledVector(b.v, dt);
      b.o.rotation.x += b.spin.x * dt;
      b.o.rotation.z += b.spin.z * dt;
      if (this.kind === 'books') b.o.scale.multiplyScalar(1 - dt * 0.25);
    }
    if (this.sand && this.sandVel) {
      const p = this.sand.geometry.attributes.position as BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        this.sandVel[i * 3 + 1] = this.sandVel[i * 3 + 1]! - g * dt * 0.5;
        p.setXYZ(i, p.getX(i) + this.sandVel[i * 3]! * dt, p.getY(i) + this.sandVel[i * 3 + 1]! * dt, p.getZ(i) + this.sandVel[i * 3 + 2]! * dt);
      }
      p.needsUpdate = true;
      (this.sand.material as PointsMaterial).opacity = Math.max(0, 1 - t / 6);
    }
    if (this.kind === 'crown' && this.island) {
      this.island.rotation.z = -(Math.min(1, t / 2.5) ** 2) * 0.42;
      const crown = this.group.children[this.group.children.length - 1]!;
      if (t > 1.2) {
        crown.position.x += dt * (t - 1.2) * 4;
        crown.position.y -= dt * Math.max(0, t - 1.6) * 9;
        crown.rotation.z -= dt * 2;
      }
    }
    if (this.kind === 'throne' && this.island) {
      this.island.position.y -= dt * Math.min(3, t * 0.8);
    }
    const end = { coins: 6, crown: 6, mirror: 6, books: 6, throne: 8, idol: 5 }[this.kind];
    if (t > end) this.done = true;
    return !this.done;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh || (o as Points).isPoints) {
        m.geometry.dispose();
        const mat = m.material as Material;
        if (!Object.values(this.mats).includes(mat as MeshStandardMaterial)) mat.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------
// CH2's crumbling slabs: the core cuts them into Voronoi chunks; each chunk is redrawn here as a
// piece of a round island (clipped to the circle), with a grassy bevelled top and earthy sides.

type P2 = [number, number];

function clipHalf(poly: P2[], nx: number, nz: number, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = a[0] * nx + a[1] * nz - d;
    const db = b[0] * nx + b[1] * nz - d;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Clip a convex polygon to a circle (centre `cx, cz`, radius `r`), approximated by 28 tangents. */
export function clipToCircle(poly: P2[], cx: number, cz: number, r: number): P2[] {
  let p = poly;
  for (let k = 0; k < 28 && p.length >= 3; k++) {
    const a = (k / 28) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    p = clipHalf(p, nx, nz, r + cx * nx + cz * nz);
  }
  return p;
}

/** A bevelled, grass-topped chunk from a convex polygon (local XZ, centred), `thickness` tall. */
export function chunkGeometry(poly: P2[], thickness: number, seed: number): BufferGeometry {
  const h = thickness / 2;
  const bevel = Math.min(0.09, thickness * 0.2);
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p[0] / poly.length;
    cz += p[1] / poly.length;
  }
  const inset = poly.map(([x, z]) => {
    const dx = x - cx;
    const dz = z - cz;
    const l = Math.hypot(dx, dz) || 1;
    const k = Math.max(0, l - bevel) / l;
    return [cx + dx * k, cz + dz * k] as P2;
  });
  const pos: number[] = [];
  const col: number[] = [];
  const c = new Color();
  const grassA = new Color('#b3b36a');
  const grassB = new Color('#d9c47c');
  const soilTop = new Color('#a48a66');
  const soilLow = new Color('#7a6150');
  const up = new Vector3();
  const tri = (a: number[], b: number[], cc: number[], ca: Color, cb: Color, ccol: Color, want: Vector3) => {
    const e1 = new Vector3(b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!);
    const e2 = new Vector3(cc[0]! - a[0]!, cc[1]! - a[1]!, cc[2]! - a[2]!);
    const flip = e1.cross(e2).dot(want) < 0;
    const vs = flip ? [a, cc, b] : [a, b, cc];
    const cs = flip ? [ca, ccol, cb] : [ca, cb, ccol];
    vs.forEach((v, i) => {
      pos.push(v[0]!, v[1]!, v[2]!);
      col.push(cs[i]!.r, cs[i]!.g, cs[i]!.b);
    });
  };
  const grassAt = (x: number, z: number) => c.copy(grassA).lerp(grassB, 0.5 + 0.5 * noise.noise2(x * 0.5 + seed, z * 0.5)).clone();
  // Top.
  for (let i = 1; i < inset.length - 1; i++) {
    const a = inset[0]!;
    const b = inset[i]!;
    const d = inset[i + 1]!;
    tri([a[0], h, a[1]], [b[0], h, b[1]], [d[0], h, d[1]], grassAt(a[0], a[1]), grassAt(b[0], b[1]), grassAt(d[0], d[1]), up.set(0, 1, 0));
  }
  // Bevel and sides.
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const ia = inset[i]!;
    const ib = inset[(i + 1) % n]!;
    const out = new Vector3(b[1] - a[1], 0, -(b[0] - a[0])).normalize();
    if (out.x * (a[0] - cx) + out.z * (a[1] - cz) < 0) out.negate();
    const yb = h - bevel;
    const g1 = grassAt(ia[0], ia[1]);
    const g2 = grassAt(ib[0], ib[1]);
    const edge = c.copy(grassA).lerp(soilTop, 0.55).clone();
    const want = out.clone().add(new Vector3(0, 1, 0)).normalize();
    tri([ia[0], h, ia[1]], [a[0], yb, a[1]], [b[0], yb, b[1]], g1, edge, edge, want);
    tri([ia[0], h, ia[1]], [b[0], yb, b[1]], [ib[0], h, ib[1]], g1, edge, g2, want);
    tri([a[0], yb, a[1]], [a[0], -h, a[1]], [b[0], -h, b[1]], soilTop, soilLow, soilLow, out);
    tri([a[0], yb, a[1]], [b[0], -h, b[1]], [b[0], yb, b[1]], soilTop, soilLow, soilTop, out);
  }
  // Bottom.
  for (let i = 1; i < n - 1; i++) {
    const a = poly[0]!;
    const b = poly[i]!;
    const d = poly[i + 1]!;
    tri([a[0], -h, a[1]], [b[0], -h, b[1]], [d[0], -h, d[1]], soilLow, soilLow, soilLow, up.set(0, -1, 0));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  return g;
}
