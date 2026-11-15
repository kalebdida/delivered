// Rome at night, for CH2 and the start of CH3: the praetorium courtyard with the palace guard
// (about 300 instanced figures), the cell block with its one small gold window, braziers, and the
// city around it with houses whose windows can light up one by one. Everything is instanced and
// lit by a per-instance attribute, so 300 guards and a thousand houses are a handful of draws.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  Vector4,
  type Material,
} from 'three';
import { Sky, glsl, seededRandom } from '@delivered/core';
import { flagstones, masonry } from './textures';

/** Add a per-instance `aLit` (0..1) that pushes a warm gold emissive into a standard material. */
function litMaterial(mat: MeshStandardMaterial, gold = '#F5C76B', strength = 1.4, key = 'lit'): MeshStandardMaterial {
  mat.emissive = new Color(gold);
  mat.emissiveIntensity = strength;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit; varying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit; vLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit; varying vec3 vLocal;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vLit;');
  };
  mat.customProgramCacheKey = () => `gain-${key}`;
  return mat;
}

/** Houses: lit windows drawn procedurally on the walls (only where aLit says so). */
function houseMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: '#4a4038', roughness: 0.95, emissive: new Color('#FFB25C'), emissiveIntensity: 2.2 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; attribute float aSeed; varying float vLit; varying float vSeed; varying vec3 vP; varying vec3 vNo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit; vSeed = aSeed; vP = position; vNo = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vLit; varying float vSeed; varying vec3 vP; varying vec3 vNo;\n${glsl.hash}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Windows: a sparse grid on the side walls (unit box, so position is -0.5..0.5).
        vec2 wuv = abs(vNo.x) > 0.5 ? vP.zy : vP.xy;
        vec2 cell = floor((wuv + 0.5) * vec2(3.0, 2.0));
        vec2 f = fract((wuv + 0.5) * vec2(3.0, 2.0));
        float win = step(0.35, f.x) * step(f.x, 0.65) * step(0.3, f.y) * step(f.y, 0.7) * step(0.5, hash12(cell + vSeed * 31.0)) * step(abs(vNo.y), 0.5);
        totalEmissiveRadiance *= win * vLit * (0.7 + 0.6 * hash12(cell * 7.0 + vSeed));`,
      );
  };
  mat.customProgramCacheKey = () => 'gain-house';
  return mat;
}

export interface Placed {
  position: Vector3;
  /** Distance from the cell window (for the waves). */
  dist: number;
}

const RING_FRAG = /* glsl */ `
uniform vec4 uRings[4]; uniform vec2 uOrigin; varying vec3 vWorld;
${glsl.dither}
void main(){
  float d = length(vWorld.xz - uOrigin);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 4; i++){
    vec4 r = uRings[i];
    float band = exp(-pow((d - r.x) / (0.45 + r.x * 0.012), 2.0)) * 0.55;
    float trail = smoothstep(r.x, r.x - 5.0, d) * step(d, r.x) * 0.05;
    c += vec3(1.0, 0.78, 0.4) * (band + trail) * r.y;
  }
  gl_FragColor = vec4(c * 1.4 + dither(gl_FragCoord.xy), 1.0);
}`;

export class Rome {
  readonly group = new Group();
  readonly sky: Sky;
  /** The cell window (where the waves start). */
  readonly origin = new Vector3(0, 3.2, -20.2);
  readonly guards: Placed[] = [];
  readonly houses: Placed[] = [];
  readonly guardLit: Float32Array;
  readonly houseLit: Float32Array;
  private guardAttrs: InstancedBufferAttribute[] = [];
  private houseAttr: InstancedBufferAttribute;
  private rings = [0, 1, 2, 3].map(() => new Vector3());
  private ringMat: ShaderMaterial;
  private cellWindow: MeshStandardMaterial;
  private fires: PointLight[] = [];
  private time = 0;

  constructor(opts: { maxInstances: number; guards?: boolean }) {
    const rng = seededRandom('rome');
    this.sky = new Sky(600);
    this.sky.set({ zenith: '#04060f', horizon: '#121a33', ground: '#06070b', sun: '#CFE0FF', stars: 1, sunSize: 0.022, sunGlow: 0.35, sunIntensity: 3 });
    this.sky.setSun(38, 2.4);
    this.group.add(this.sky.mesh);

    // Ground: worn paving in the courtyard, packed earth beyond.
    const floor = flagstones(512, 'praetorium', '#857a6c', 0.6);
    for (const t of [floor.map, floor.normalMap, floor.roughnessMap]) t.repeat.set(70, 70);
    const ground = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: floor.map, normalMap: floor.normalMap, roughnessMap: floor.roughnessMap, color: '#c4b8aa', roughness: 1 }));
    ground.receiveShadow = true;
    this.group.add(ground);

    // The courtyard: a colonnade around it, the cell block at the north end.
    const wall = masonry(512, 'praetorium-wall', '#8a8074');
    const stone = new MeshStandardMaterial({ map: wall.map, normalMap: wall.normalMap, color: '#9a9088', roughness: 1 });
    wall.map.repeat.set(3, 1);
    const colGeo = new CylinderGeometry(0.32, 0.38, 6, 12);
    const cols: Vector3[] = [];
    for (let x = -24; x <= 24; x += 4) cols.push(new Vector3(x, 3, -18), new Vector3(x, 3, 18));
    for (let z = -14; z <= 14; z += 4) cols.push(new Vector3(-24, 3, z), new Vector3(24, 3, z));
    const colMesh = new InstancedMesh(colGeo, new MeshStandardMaterial({ color: '#8d8378', roughness: 0.9 }), cols.length);
    cols.forEach((p, i) => colMesh.setMatrixAt(i, new Matrix4().makeTranslation(p.x, p.y, p.z)));
    this.group.add(colMesh);
    for (const [w, d, x, z] of [[50, 1.2, 0, -18], [50, 1.2, 0, 18], [1.2, 37, -24, 0], [1.2, 37, 24, 0]] as const) {
      const beam = new Mesh(new BoxGeometry(w, 0.8, d), stone);
      beam.position.set(x, 6.4, z);
      this.group.add(beam);
    }
    const block = new Mesh(new BoxGeometry(14, 7, 6), stone);
    block.position.set(0, 3.5, -22);
    this.group.add(block);
    this.cellWindow = new MeshStandardMaterial({ color: '#1a1410', emissive: new Color('#F5C76B'), emissiveIntensity: 2.5 });
    const win = new Mesh(new PlaneGeometry(0.6, 0.45), this.cellWindow);
    win.position.copy(this.origin).setZ(-18.98);
    this.group.add(win);
    for (let i = 0; i < 3; i++) {
      const bar = new Mesh(new BoxGeometry(0.04, 0.5, 0.04), new MeshStandardMaterial({ color: '#141210' }));
      bar.position.set(-0.15 + i * 0.15, this.origin.y, -18.95);
      this.group.add(bar);
    }

    // Braziers in the courtyard (the only warm light out here).
    for (const [x, z] of [[-14, -8], [14, -8], [-14, 9], [14, 9]] as const) {
      const bowl = new Mesh(new CylinderGeometry(0.5, 0.25, 0.45, 12), new MeshStandardMaterial({ color: '#2b2520', metalness: 0.6, roughness: 0.5 }));
      bowl.position.set(x, 1.1, z);
      const leg = new Mesh(new CylinderGeometry(0.05, 0.08, 0.9, 6), bowl.material);
      leg.position.set(x, 0.45, z);
      const flame = new Mesh(new ConeGeometry(0.35, 0.9, 10), new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ff8a3a'), emissiveIntensity: 3 }));
      flame.position.set(x, 1.7, z);
      const light = new PointLight('#ff9a4a', 26, 22, 1.7);
      light.position.set(x, 2.2, z);
      this.fires.push(light);
      this.group.add(bowl, leg, flame, light);
    }

    // The palace guard: rows in front of the cell block, ~300 figures.
    const count = opts.guards === false ? 0 : Math.min(300, Math.max(120, opts.maxInstances - 100));
    const cols0 = 20;
    const rows = Math.ceil(count / cols0);
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols0);
      const c = i % cols0;
      const x = (c - (cols0 - 1) / 2) * 1.9 + (rng() - 0.5) * 0.3;
      const z = -11 + r * (26 / rows) + (rng() - 0.5) * 0.3;
      const p = new Vector3(x, 0, z);
      this.guards.push({ position: p, dist: Math.hypot(p.x - this.origin.x, p.z - this.origin.z) });
    }
    this.guardLit = new Float32Array(count);
    const cloak = new LatheGeometry([[0, 0], [0.32, 0], [0.28, 0.6], [0.22, 1.25], [0.2, 1.42], [0, 1.45]].map(([a, b]) => new Vector2(a, b)), 10);
    const helm = new SphereGeometry(0.15, 10, 8);
    helm.translate(0, 1.6, 0);
    const crest = new BoxGeometry(0.04, 0.14, 0.3);
    crest.translate(0, 1.76, 0);
    const spear = new CylinderGeometry(0.018, 0.018, 2.6, 5);
    spear.translate(0.32, 1.3, 0.05);
    const parts: [BufferGeometry, MeshStandardMaterial][] = [
      [cloak, litMaterial(new MeshStandardMaterial({ color: '#6a2a24', roughness: 0.9 }), '#F5C76B', 0.17, 'guard-cloak')],
      [helm, litMaterial(new MeshStandardMaterial({ color: '#8a6c3a', metalness: 0.6, roughness: 0.35 }), '#FFE9B0', 0.65, 'guard-helm')],
      [crest, litMaterial(new MeshStandardMaterial({ color: '#8a2020', roughness: 0.8 }), '#F5C76B', 0.4, 'guard-crest')],
      [spear, litMaterial(new MeshStandardMaterial({ color: '#4a3e30', roughness: 0.6 }), '#F5C76B', 0.5, 'guard-spear')],
    ];
    const o = new Object3D();
    for (const [g, m] of parts) {
      const mesh = new InstancedMesh(g, m, count);
      const attr = new InstancedBufferAttribute(this.guardLit, 1);
      mesh.geometry.setAttribute('aLit', attr);
      this.guardAttrs.push(attr);
      this.guards.forEach((gd, i) => {
        o.position.copy(gd.position);
        o.rotation.set(0, Math.PI + (rng() - 0.5) * 0.3, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.castShadow = false;
      this.group.add(mesh);
    }

    // The city around the courtyard: houses in a broad ring, hills beyond.
    const houseCount = Math.min(1100, Math.max(260, Math.round(opts.maxInstances * 0.5)));
    const hGeo = new BoxGeometry(1, 1, 1);
    const roofGeo = new ConeGeometry(0.75, 0.5, 4);
    roofGeo.rotateY(Math.PI / 4);
    const houses = new InstancedMesh(hGeo, houseMaterial(), houseCount);
    const roofs = new InstancedMesh(roofGeo, new MeshStandardMaterial({ color: '#5a3426', roughness: 0.9 }), houseCount);
    this.houseLit = new Float32Array(houseCount);
    const seeds = new Float32Array(houseCount);
    let placed = 0;
    while (placed < houseCount) {
      const a = rng() * Math.PI * 2;
      const d = 32 + Math.pow(rng(), 0.7) * 120;
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < 28 && Math.abs(z) < 24) continue;
      const w = 3 + rng() * 5;
      const dd = 3 + rng() * 5;
      const hgt = 3 + rng() * 6;
      o.position.set(x, hgt / 2, z);
      o.rotation.set(0, Math.round(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.2, 0);
      o.scale.set(w, hgt, dd);
      o.updateMatrix();
      houses.setMatrixAt(placed, o.matrix);
      o.position.y = hgt + 0.25 * Math.max(w, dd) * 0.5;
      o.scale.set(w * 1.05, Math.max(w, dd) * 0.5, dd * 1.05);
      o.updateMatrix();
      roofs.setMatrixAt(placed, o.matrix);
      seeds[placed] = rng();
      this.houses.push({ position: new Vector3(x, hgt * 0.6, z), dist: Math.hypot(x - this.origin.x, z - this.origin.z) });
      placed++;
    }
    this.houseAttr = new InstancedBufferAttribute(this.houseLit, 1);
    houses.geometry.setAttribute('aLit', this.houseAttr);
    houses.geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1));
    this.group.add(houses, roofs);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng();
      const hill = new Mesh(new SphereGeometry(60 + rng() * 40, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: '#0d0f16', roughness: 1 }));
      hill.position.set(Math.cos(a) * 230, -10, Math.sin(a) * 230);
      hill.scale.y = 0.35 + rng() * 0.2;
      this.group.add(hill);
    }

    // Moonlight over everything, and a little cool fill.
    const moon = new DirectionalLight('#aebfe0', 2.4);
    moon.position.set(-60, 90, -40);
    this.group.add(moon, new HemisphereLight('#3a4a70', '#1a1410', 0.9));

    // The waves, drawn on the ground.
    this.ringMat = new ShaderMaterial({
      uniforms: { uRings: { value: [0, 1, 2, 3].map(() => new Vector4()) }, uOrigin: { value: new Vector2(this.origin.x, this.origin.z) } },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const ringPlane = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), this.ringMat);
    ringPlane.position.y = 0.05;
    ringPlane.renderOrder = 6;
    this.group.add(ringPlane);
  }

  /** Light a share of the city's windows at once (a city at night has lamps burning). */
  lightWindows(fraction: number): void {
    const rng = seededRandom('windows');
    for (let k = 0; k < this.houseLit.length; k++) if (rng() < fraction) this.houseLit[k] = 0.4 + rng() * 0.6;
    this.houseAttr.needsUpdate = true;
  }

  /** Start a wave from the cell. `reach` is how far it travels (metres). */
  wave(reach: number): void {
    const slot = this.rings.reduce((best, r, i, arr) => (r.y < arr[best]!.y ? i : best), 0);
    this.rings[slot]!.set(0, 1, reach);
    this.cellWindow.emissiveIntensity = 6;
  }

  /** Radius of the furthest active wave front. */
  update(dt: number, onGuard: (i: number) => void, onHouse: (i: number) => void): void {
    this.time += dt;
    this.sky.update(dt);
    const uR = this.ringMat.uniforms.uRings!.value as Vector4[];
    this.rings.forEach((r, i) => {
      if (r.y > 0) {
        const prev = r.x;
        r.x += dt * (9 + r.x * 0.12);
        if (r.x > r.z) r.y = Math.max(0, r.y - dt * 1.4);
        const reach = Math.min(r.x, r.z);
        this.guards.forEach((g, k) => {
          if (this.guardLit[k]! === 0 && g.dist > prev - 0.5 && g.dist <= reach) {
            this.guardLit[k] = 0.001;
            onGuard(k);
          }
        });
        this.houses.forEach((hs, k) => {
          if (this.houseLit[k]! === 0 && hs.dist > prev - 0.5 && hs.dist <= reach) {
            this.houseLit[k] = 0.001;
            onHouse(k);
          }
        });
      }
      uR[i]!.x = r.x;
      uR[i]!.y = r.y * (r.x > 0 ? 1 : 0);
    });
    // Lit things warm up gently rather than snapping on.
    for (let k = 0; k < this.guardLit.length; k++) if (this.guardLit[k]! > 0 && this.guardLit[k]! < 1) this.guardLit[k] = Math.min(1, this.guardLit[k]! + dt * 1.6);
    for (let k = 0; k < this.houseLit.length; k++) if (this.houseLit[k]! > 0 && this.houseLit[k]! < 1) this.houseLit[k] = Math.min(1, this.houseLit[k]! + dt * 1.2);
    for (const a of this.guardAttrs) a.needsUpdate = true;
    this.houseAttr.needsUpdate = true;
    this.cellWindow.emissiveIntensity += (2.5 - this.cellWindow.emissiveIntensity) * (1 - Math.exp(-dt * 2));
    this.fires.forEach((f, i) => (f.intensity = 26 * (0.85 + 0.15 * Math.sin(this.time * 9 + i * 2) * Math.sin(this.time * 5.3 + i))));
  }

  get litGuards(): number {
    let n = 0;
    for (const v of this.guardLit) if (v > 0) n++;
    return n;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.sky.dispose();
    this.group.removeFromParent();
  }
}
