// Philippi: the small house where the letter arrives (CH3, night) and the church's courtyard in
// the morning (CH5). People are simple seated figures (robe, hood, no faces); each can be dim or
// lit warmly. The courtyard has a garden at its centre that grows as people light up.
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  SphereGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { Sky, seededRandom } from '@delivered/core';
import { flagstones, masonry } from './textures';

const SKIN = ['#6a4a36', '#8a6448', '#4e3626', '#a07a5a'];
const ROBES = ['#6b5a46', '#4a5a6a', '#7a4a3a', '#5a6a4a', '#6a6058', '#3e4a5c', '#806a50'];

/** A simple seated (or standing) person: robe, shoulders, head with a head-covering. No face. */
export class Person {
  readonly group = new Group();
  /** 0 dim .. 1 lit with warmth. */
  lit = 0;
  target = 0;
  private mats: MeshStandardMaterial[] = [];
  private base: Color[] = [];
  private glow: PointLight | null = null;

  constructor(seed: number, opts: { seated?: boolean; light?: boolean } = {}) {
    const rng = seededRandom(`person-${seed}`);
    const seated = opts.seated ?? true;
    const robe = new MeshStandardMaterial({ color: ROBES[Math.floor(rng() * ROBES.length)]!, roughness: 0.95 });
    const skin = new MeshStandardMaterial({ color: SKIN[Math.floor(rng() * SKIN.length)]!, roughness: 0.7 });
    const cover = new MeshStandardMaterial({ color: rng() < 0.5 ? '#d8cbb0' : ROBES[Math.floor(rng() * ROBES.length)]!, roughness: 0.95 });
    this.mats.push(robe, skin, cover);
    this.base = this.mats.map((m) => m.color.clone());
    const h = seated ? 0.62 : 1.0;
    const body = new Mesh(new LatheGeometry([[0, 0], [0.26, 0], [0.24, h * 0.4], [0.19, h * 0.85], [0.12, h], [0, h + 0.02]].map(([x, y]) => new Vector2(x, y)), 14), robe);
    const head = new Mesh(new SphereGeometry(0.1, 12, 10), skin);
    head.position.y = h + 0.13;
    head.scale.set(0.95, 1.1, 1);
    const veil = new Mesh(new SphereGeometry(0.118, 12, 10, Math.PI * 0.65, Math.PI * 1.7, 0, Math.PI * 0.75), cover);
    veil.position.copy(head.position).add(new Vector3(0, 0.01, -0.01));
    // The face is never drawn: turn the opening of the head-covering away from the camera's usual view.
    const shawl = new Mesh(new ConeGeometry(0.2, 0.22, 14, 1, true), cover);
    shawl.position.y = h - 0.02;
    this.group.add(body, head, veil, shawl);
    if (seated) {
      for (const s of [-1, 1]) {
        const knee = new Mesh(new SphereGeometry(0.1, 10, 8), robe);
        knee.position.set(s * 0.1, 0.12, 0.25);
        knee.scale.set(1, 0.8, 1.6);
        this.group.add(knee);
      }
    }
    this.group.traverse((o) => ((o as Mesh).castShadow = true));
    this.group.rotation.y = rng() * Math.PI * 2;
    if (opts.light) {
      this.glow = new PointLight('#ffb25c', 0, 2.2, 1.6);
      this.glow.position.set(0, h + 0.2, 0.3);
      this.group.add(this.glow);
    }
    this.apply();
  }

  private apply(): void {
    const dim = new Color('#5a6070');
    this.mats.forEach((m, i) => {
      // Dim: cool and desaturated. Lit: their own colours, warmed, glowing a little from within.
      m.color.copy(this.base[i]!).lerp(dim, 0.55 * (1 - this.lit));
      m.emissive.set('#ff9a3c');
      m.emissiveIntensity = this.lit * 0.22;
    });
    if (this.glow) this.glow.intensity = this.lit * 2.2;
  }

  update(dt: number): void {
    if (Math.abs(this.target - this.lit) > 0.001) {
      this.lit += (this.target - this.lit) * (1 - Math.exp(-dt * 1.6));
      this.apply();
    }
  }
}

/** The house in Philippi at night: a lamp inside, a few people, a door and a window. */
export class House {
  readonly group = new Group();
  readonly window = new Vector3(0.9, 1.5, 2.02);
  readonly people: Person[] = [];
  readonly inside: PointLight;
  readonly sky: Sky;
  private glassMat: MeshStandardMaterial;
  private doorLight: MeshStandardMaterial;
  /** 0..1 the gold light filling the house. */
  fill = 0;

  constructor() {
    this.sky = new Sky(300);
    this.sky.set({ zenith: '#04060f', horizon: '#141c36', ground: '#07070b', sun: '#CFE0FF', stars: 1, sunSize: 0.02, sunGlow: 0.3, sunIntensity: 2.6 });
    this.sky.setSun(34, 2.6);
    this.group.add(this.sky.mesh);
    const wall = masonry(512, 'philippi-house');
    const plaster = new MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, color: '#c8b8a0', roughness: 1 });
    const ground = flagstones(512, 'philippi-ground');
    for (const t of [ground.map, ground.normalMap]) t.repeat.set(10, 10);
    const floor = new Mesh(new PlaneGeometry(60, 60).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: ground.map, normalMap: ground.normalMap, color: '#8a7f72', roughness: 1 }));
    this.group.add(floor);
    // Walls (front wall with a door and a window), roof.
    const W = 4.4;
    const D = 4;
    const H = 2.8;
    const piece = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new Mesh(new BoxGeometry(w, h, d), plaster);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    piece(W, H, 0.25, 0, H / 2, -D / 2);
    piece(0.25, H, D, -W / 2, H / 2, 0);
    piece(0.25, H, D, W / 2, H / 2, 0);
    // Front: door gap at x -0.9..-0.1, window gap at x 0.6..1.2, y 1.25..1.75.
    piece(1.3, H, 0.25, -1.55, H / 2, D / 2);
    piece(0.7, H, 0.25, 0.25, H / 2, D / 2);
    piece(0.8, H, 0.25, 1.8, H / 2, D / 2);
    piece(0.6, 1.25, 0.25, 0.9, 0.625, D / 2);
    piece(0.6, H - 1.75, 0.25, 0.9, 1.75 + (H - 1.75) / 2, D / 2);
    piece(0.8, H - 2.05, 0.25, -0.5, 2.05 + (H - 2.05) / 2, D / 2);
    const roof = new Mesh(new ConeGeometry(3.6, 1.4, 4), new MeshStandardMaterial({ color: '#6a3a28', roughness: 0.9 }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.82);
    roof.position.y = H + 0.65;
    this.group.add(roof);
    this.glassMat = new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ffb25c'), emissiveIntensity: 0.6, transparent: true, opacity: 0.0 });
    this.doorLight = new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ffb25c'), emissiveIntensity: 0.4 });
    const doorGlow = new Mesh(new PlaneGeometry(0.8, 2.05), this.doorLight);
    doorGlow.position.set(-0.5, 1.025, D / 2 - 0.3);
    this.group.add(doorGlow);
    // Inside: a lamp on a low table and people around it.
    const table = new Mesh(new CylinderGeometry(0.4, 0.4, 0.35, 16), new MeshStandardMaterial({ color: '#4a3424', roughness: 0.8 }));
    table.position.set(0, 0.175, -0.2);
    this.group.add(table);
    this.inside = new PointLight('#ffb25c', 4, 9, 1.5);
    this.inside.position.set(0, 0.7, -0.2);
    this.group.add(this.inside);
    for (let i = 0; i < 5; i++) {
      const p = new Person(i + 20);
      const a = (i / 5) * Math.PI * 2 + 0.3;
      p.group.position.set(Math.cos(a) * 1.05, 0, -0.2 + Math.sin(a) * 1.05);
      p.group.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      p.target = p.lit = 0.25;
      this.people.push(p);
      this.group.add(p.group);
    }
    const moon = new DirectionalLight('#9fb3dd', 0.8);
    moon.position.set(-8, 12, 10);
    this.group.add(moon, new HemisphereLight('#26324e', '#0d0b0a', 0.5));
  }

  update(dt: number): void {
    this.sky.update(dt);
    this.inside.intensity = 4 + this.fill * 26;
    this.inside.color.set('#ffb25c').lerp(new Color('#ffe9b0'), this.fill);
    this.doorLight.emissiveIntensity = 0.4 + this.fill * 3.2;
    this.glassMat.emissiveIntensity = 0.6 + this.fill * 3;
    for (const p of this.people) {
      p.target = 0.25 + this.fill * 0.75;
      p.update(dt);
    }
  }

  dispose(): void {
    disposeTree(this.group);
    this.sky.dispose();
  }
}

/** The Philippian church's courtyard in the morning. */
export class Courtyard {
  readonly group = new Group();
  readonly sky: Sky;
  readonly people: Person[] = [];
  /** World positions where the visitor sits beside each person. */
  readonly seats: Vector3[] = [];
  private flowers: InstancedMesh;
  private vines: InstancedMesh;
  private bloomAttr: InstancedBufferAttribute;
  private bloom: Float32Array;
  private flowerGrow: Float32Array;
  readonly sun: DirectionalLight;
  /** 0..1 how much of the garden has grown. */
  growth = 0;
  private growthNow = 0;
  private sunTarget = 1;

  constructor(opts: { maxInstances: number; shadows: boolean; shadowMapSize: number }) {
    const rng = seededRandom('courtyard');
    this.sky = new Sky(400);
    this.sky.setTime(9.2);
    this.group.add(this.sky.mesh);
    const ground = flagstones(512, 'courtyard');
    for (const t of [ground.map, ground.normalMap, ground.roughnessMap]) t.repeat.set(8, 8);
    const floor = new Mesh(new PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: ground.map, normalMap: ground.normalMap, roughnessMap: ground.roughnessMap, color: '#d6c6ae', roughness: 1 }));
    floor.receiveShadow = true;
    this.group.add(floor);
    // Low houses around the courtyard, plastered and warm in the morning.
    const wall = masonry(512, 'courtyard-wall');
    const plaster = new MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, color: '#e2d2b8', roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 15.5 + rng() * 2;
      const w = 4 + rng() * 3;
      const h = 3 + rng() * 2.5;
      const m = new Mesh(new BoxGeometry(w, h, 3.5), plaster);
      m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
      m.lookAt(0, h / 2, 0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      const roof = new Mesh(new ConeGeometry(Math.max(w, 3.5) * 0.75, 1.1, 4), new MeshStandardMaterial({ color: '#9a5a3a', roughness: 0.9 }));
      roof.position.set(m.position.x, h + 0.5, m.position.z);
      roof.rotation.y = Math.PI / 4 + a;
      roof.scale.set(1, 1, 0.7);
      this.group.add(roof);
    }
    // A low stone ring for the garden at the centre, an olive tree.
    const ring = new Mesh(new CylinderGeometry(2.2, 2.3, 0.35, 32, 1, true), new MeshStandardMaterial({ color: '#b9a888', roughness: 1, side: 2 }));
    ring.position.y = 0.175;
    this.group.add(ring);
    const soil = new Mesh(new CylinderGeometry(2.15, 2.15, 0.3, 32), new MeshStandardMaterial({ color: '#4a3a2a', roughness: 1 }));
    soil.position.y = 0.15;
    this.group.add(soil);
    const trunk = new Mesh(new CylinderGeometry(0.12, 0.2, 2.2, 8), new MeshStandardMaterial({ color: '#5a4636', roughness: 1 }));
    trunk.position.set(0.3, 1.25, -0.2);
    trunk.rotation.z = 0.15;
    const crown = new Mesh(new SphereGeometry(1.3, 12, 10), new MeshStandardMaterial({ color: '#5f6e48', roughness: 0.9 }));
    crown.position.set(0.5, 2.7, -0.2);
    crown.scale.set(1.2, 0.75, 1.1);
    this.group.add(trunk, crown);
    for (const m of [trunk, crown]) m.castShadow = true;

    // Flowers and vines (instanced), each with its own bloom amount.
    const n = Math.min(900, Math.round(opts.maxInstances * 0.4));
    this.bloom = new Float32Array(n);
    this.flowerGrow = new Float32Array(n);
    const petal = new ConeGeometry(0.06, 0.08, 6);
    petal.translate(0, 0.3, 0);
    const fMat = new MeshStandardMaterial({ roughness: 0.6, emissive: new Color('#ffcf7a'), emissiveIntensity: 0.25 });
    this.flowers = new InstancedMesh(petal, fMat, n);
    const stem = new CylinderGeometry(0.008, 0.012, 0.3, 4);
    stem.translate(0, 0.15, 0);
    this.vines = new InstancedMesh(stem, new MeshStandardMaterial({ color: '#4f6a36', roughness: 0.9 }), n);
    const o = new Object3D();
    const colors = ['#f2c14e', '#e8735a', '#f7efe0', '#b65fa0', '#f5c76b', '#d9e0f0'];
    const pts: Vector3[] = [];
    for (let i = 0; i < n; i++) {
      // Most in the garden ring, some climbing the house walls, some between the groups.
      const k = rng();
      let p: Vector3;
      if (k < 0.6) {
        const r = Math.sqrt(rng()) * 2.05;
        const a = rng() * Math.PI * 2;
        p = new Vector3(Math.cos(a) * r, 0.3, Math.sin(a) * r);
      } else {
        const a = rng() * Math.PI * 2;
        const r = 3 + rng() * 6.5;
        p = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      }
      pts.push(p);
      this.flowers.setColorAt(i, new Color(colors[Math.floor(rng() * colors.length)]!));
      this.flowerGrow[i] = k < 0.6 ? rng() * 0.6 : 0.3 + rng() * 0.7;
    }
    this.flowers.userData.points = pts;
    this.bloomAttr = new InstancedBufferAttribute(this.bloom, 1);
    for (const m of [this.flowers, this.vines]) {
      m.count = n;
      m.frustumCulled = false;
      this.group.add(m);
    }
    void o;
    this.writeGarden();

    // People in groups: some small, some on the edges. A few are already lit.
    const groups: [number, number, number][] = [[4.2, 1.4, 3], [-3.6, 3.2, 2], [-4.4, -2.6, 4], [1.8, -5.2, 1], [6.8, -3.4, 2], [-1.2, 6.4, 1], [7.4, 4.6, 1], [-7.6, 0.8, 1]];
    let id = 0;
    for (const [gx, gz, count] of groups) {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rng();
        const p = new Person(id++, { light: true });
        const r = count > 1 ? 0.8 : 0;
        p.group.position.set(gx + Math.cos(a) * r, 0, gz + Math.sin(a) * r);
        // Face the middle of their group (or the garden when alone).
        const look = count > 1 ? new Vector3(gx, 0, gz) : new Vector3(0, 0, 0);
        p.group.rotation.y = Math.atan2(look.x - p.group.position.x, look.z - p.group.position.z);
        p.target = p.lit = id % 4 === 1 ? 1 : 0;
        this.people.push(p);
        this.group.add(p.group);
        // The visitor's seat: beside them, a little outside the group.
        const out = p.group.position.clone().sub(new Vector3(gx, 0, gz));
        if (out.lengthSq() < 0.01) out.set(Math.cos(a), 0, Math.sin(a));
        out.normalize();
        this.seats.push(p.group.position.clone().addScaledVector(out, 0.75).add(new Vector3(out.z, 0, -out.x).multiplyScalar(0.25)));
      }
    }

    this.sun = new DirectionalLight('#ffe2b8', 2.6);
    this.sun.position.copy(this.sky.sunDirection).multiplyScalar(30);
    if (opts.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(opts.shadowMapSize, opts.shadowMapSize);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -16;
      c.right = c.top = 16;
      c.near = 1;
      c.far = 80;
      this.sun.shadow.bias = -0.0005;
    }
    this.group.add(this.sun, new HemisphereLight('#c8d8f0', '#9a8466', 1.7));
  }

  private writeGarden(): void {
    const pts = this.flowers.userData.points as Vector3[];
    const o = new Object3D();
    for (let i = 0; i < pts.length; i++) {
      const g = Math.max(0, Math.min(1, (this.growthNow - this.flowerGrow[i]! * 0.85) / 0.25));
      const s = 0.001 + g * (0.7 + (i % 7) * 0.08);
      o.position.copy(pts[i]!);
      o.rotation.set(0, i * 2.39, 0);
      o.scale.setScalar(s);
      o.updateMatrix();
      this.vines.setMatrixAt(i, o.matrix);
      this.flowers.setMatrixAt(i, o.matrix);
      this.bloom[i] = g;
    }
    this.flowers.instanceMatrix.needsUpdate = true;
    this.vines.instanceMatrix.needsUpdate = true;
    this.bloomAttr.needsUpdate = true;
  }

  /** How many are lit. */
  get litCount(): number {
    return this.people.filter((p) => p.target >= 1).length;
  }

  update(dt: number): void {
    this.sky.update(dt);
    for (const p of this.people) p.update(dt);
    const lit = this.people.reduce((a, p) => a + p.lit, 0) / this.people.length;
    this.growth = Math.max(this.growth, lit);
    if (Math.abs(this.growth - this.growthNow) > 0.002) {
      this.growthNow += (this.growth - this.growthNow) * (1 - Math.exp(-dt * 0.8));
      this.writeGarden();
    }
    // The courtyard warms as people light up.
    this.sun.intensity += (2.2 + lit * 1.4 * this.sunTarget - this.sun.intensity) * (1 - Math.exp(-dt));
    this.sun.color.set('#ffe2b8').lerp(new Color('#ffd28a'), lit * 0.5);
  }

  dispose(): void {
    disposeTree(this.group);
    this.sky.dispose();
  }
}

function disposeTree(root: Group): void {
  root.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
    const mat = m.material as Material | Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  root.removeFromParent();
}
