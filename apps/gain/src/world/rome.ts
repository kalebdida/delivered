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
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
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
import { Dust, Sky, glsl, seededRandom } from '@delivered/core';
import { cityHouseGeometry, cypressGeometry, gableGeometry, guardGeometry, tileTexture } from './shapes';
import { flagstones, masonry } from './textures';

/**
 * Add a per-instance `aLit` (0..1). A lit figure is not painted gold: the light reaching it shows
 * as a warm rim along its silhouette and a soft warm wash, so the shape stays readable.
 */
function litMaterial(mat: MeshStandardMaterial, gold = '#F5C76B', strength = 1.4, key = 'lit'): MeshStandardMaterial {
  mat.emissive = new Color(gold);
  mat.emissiveIntensity = strength;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; varying float vLit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float gRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        totalEmissiveRadiance *= vLit * (0.06 + gRim * 0.9);`,
      );
  };
  mat.customProgramCacheKey = () => `gain-${key}`;
  return mat;
}

/**
 * Houses: plaster that differs from house to house and darkens toward the street, arched window
 * openings on every wall (dark recesses, or lamplit where aLit says so, with a little warm spill
 * on the plaster around them) and a doorway on the front.
 */
function houseMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: '#a38c6c', roughness: 0.95, emissive: new Color('#FFB25C'), emissiveIntensity: 2.6 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aLit; attribute float aSeed; varying float vLit; varying float vSeed; varying vec3 vP; varying vec3 vNo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLit = aLit; vSeed = aSeed; vP = position; vNo = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vLit; varying float vSeed; varying vec3 vP; varying vec3 vNo;\n${glsl.hash}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Openings: a sparse grid on the walls (unit box, so position is -0.5..0.5).
        vec2 wuv = abs(vNo.x) > 0.5 ? vP.zy : vP.xy;
        vec2 wg = (wuv + 0.5) * vec2(3.0, 2.0);
        vec2 wcell = floor(wg);
        vec2 wq = (fract(wg) - vec2(0.5, 0.44)) / vec2(0.14, 0.2);
        float wallMask = step(abs(vNo.y), 0.5) * step(abs(wuv.x), 0.5) * step(abs(wuv.y), 0.43);
        float archTop = step(length(vec2(wq.x, max(wq.y - 0.5, 0.0) / 0.5)), 1.0);
        float opening = step(abs(wq.x), 1.0) * step(-1.0, wq.y) * archTop * wallMask;
        float hasWin = step(0.42, hash12(wcell + vSeed * 31.0));
        float isLamp = step(0.45, hash12(wcell * 3.7 + vSeed * 17.0));
        // The doorway, on the front wall only.
        vec2 dq = vec2(vP.x + 0.12, vP.y + 0.5) / vec2(0.075, 0.3);
        float door = step(0.5, vNo.z) * step(abs(dq.x), 1.0) * step(dq.y, 1.0) * step(length(vec2(dq.x, max(dq.y - 0.7, 0.0) / 0.3)), 1.0);
        float hole = max(opening * hasWin, door);
        float tone = hash12(vec2(vSeed * 91.7, 3.1));
        diffuseColor.rgb *= mix(vec3(0.8, 0.72, 0.64), vec3(1.16, 1.04, 0.88), tone);
        diffuseColor.rgb *= 0.66 + 0.34 * smoothstep(-0.5, -0.05, vP.y);
        diffuseColor.rgb *= 1.0 - 0.86 * hole;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float lamp = hasWin * isLamp * vLit * (0.65 + 0.7 * hash12(wcell * 7.0 + vSeed));
        float pane = opening * (1.0 - 0.55 * step(abs(wq.x), 0.1)) * (1.15 - 0.4 * wq.y);
        float spill = exp(-dot(wq, wq) * 0.55) * (1.0 - opening) * wallMask * 0.1;
        totalEmissiveRadiance *= (pane + spill) * lamp + door * vLit * 0.35 * (1.0 - dq.y * 0.6);`,
      );
  };
  mat.customProgramCacheKey = () => 'gain-house-2';
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
    float band = exp(-pow((d - r.x) / (0.22 + r.x * 0.006), 2.0)) * 0.32;
    float trail = smoothstep(r.x, r.x - 4.0, d) * step(d, r.x) * 0.035;
    c += vec3(1.0, 0.7, 0.32) * (band + trail) * r.y;
  }
  gl_FragColor = vec4(c * 1.2 + dither(gl_FragCoord.xy), 1.0);
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
  private embers: Dust;
  private time = 0;

  constructor(opts: { maxInstances: number; guards?: boolean }) {
    const rng = seededRandom('rome');
    this.sky = new Sky(600);
    this.sky.set({ zenith: '#04060f', horizon: '#2c2c44', ground: '#0a0a10', sun: '#CFE0FF', stars: 1, sunSize: 0.018, sunGlow: 0.1, sunIntensity: 1.6 });
    this.sky.setSun(38, 2.4);
    this.group.add(this.sky.mesh);

    // Ground: worn paving in the courtyard, packed earth beyond.
    const floor = flagstones(512, 'praetorium', '#857a6c', 0.78);
    // Seen from the air (the letter's flight) the streets are fine-grained, dark, moonlit stone.
    const aerial = opts.guards === false;
    for (const t of [floor.map, floor.normalMap, floor.roughnessMap]) t.repeat.set(aerial ? 150 : 70, aerial ? 150 : 70);
    const ground = new Mesh(new PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new MeshStandardMaterial({ map: floor.map, normalMap: floor.normalMap, roughnessMap: floor.roughnessMap, color: aerial ? '#b3a898' : '#c4b8aa', roughness: 1 }));
    if (aerial) (ground.material as MeshStandardMaterial).normalScale.set(0.5, 0.5);
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
    const guard = guardGeometry();
    const parts: [BufferGeometry, MeshStandardMaterial][] = [
      [guard.cloth, litMaterial(new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: DoubleSide }), '#FFB866', 0.7, 'guard-cloth')],
      [guard.metal, litMaterial(new MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.38 }), '#FFD58A', 0.75, 'guard-metal')],
    ];
    const o = new Object3D();
    const turns = this.guards.map(() => Math.PI + (rng() - 0.5) * 0.3);
    for (const [g, m] of parts) {
      const mesh = new InstancedMesh(g, m, count);
      const attr = new InstancedBufferAttribute(this.guardLit, 1);
      mesh.geometry.setAttribute('aLit', attr);
      this.guardAttrs.push(attr);
      this.guards.forEach((gd, i) => {
        o.position.copy(gd.position);
        o.rotation.set(0, turns[i]!, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.castShadow = false;
      this.group.add(mesh);
    }

    // The city around the courtyard: houses in a broad ring, hills beyond.
    const houseCount = Math.min(1100, Math.max(260, Math.round(opts.maxInstances * 0.5)));
    const hGeo = cityHouseGeometry();
    const roofGeo = gableGeometry(0.08);
    const tiles = tileTexture('rome-tiles');
    tiles.repeat.set(2.2, 2.2);
    const houses = new InstancedMesh(hGeo, houseMaterial(), houseCount);
    const roofs = new InstancedMesh(roofGeo, new MeshStandardMaterial({ map: tiles, color: '#927466', roughness: 0.85 }), houseCount);
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
      o.position.y = hgt;
      o.scale.set(w, Math.min(w, dd) * 0.3, dd);
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
      const hill = new Mesh(new SphereGeometry(60 + rng() * 40, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new MeshStandardMaterial({ color: '#1a1f2c', roughness: 1 }));
      hill.position.set(Math.cos(a) * 230, -10, Math.sin(a) * 230);
      hill.scale.y = 0.35 + rng() * 0.2;
      this.group.add(hill);
    }

    // Moonlight over everything, and a little cool fill.
    // Key: the moon, high on the left. Rim: a cool back light from beyond the cell block that
    // outlines every helmet, shoulder and roof edge against the dark. Fill: a little cool sky.
    const moon = new DirectionalLight('#b4c4e6', aerial ? 3.8 : 2.8);
    moon.position.set(-60, 90, -40);
    const rim = new DirectionalLight('#8ea8e0', 2.2);
    rim.position.set(-20, 18, -80);
    this.group.add(moon, rim, new HemisphereLight('#3e4e78', '#1a1410', aerial ? 1.7 : 1.0));
    // Cypresses on the skyline, between the city and the hills.
    const cyp = new InstancedMesh(cypressGeometry(), new MeshStandardMaterial({ color: '#1c2a24', roughness: 1 }), 60);
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2;
      const d = 60 + rng() * 110;
      o.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      o.rotation.set(0, rng() * 6, 0);
      o.scale.setScalar(0.9 + rng() * 0.9);
      o.updateMatrix();
      cyp.setMatrixAt(i, o.matrix);
    }
    this.group.add(cyp);
    // Embers rising from the braziers: the near layer of the frame.
    this.embers = new Dust({ count: 160, bounds: [16, 3, 11], color: '#ffb066', size: 2.2, speed: 0.6, opacity: 0.5, seed: 'embers' });
    this.embers.points.position.set(0, 3, 0);
    this.group.add(this.embers.points);

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
    this.embers.update(dt);
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
    this.embers.dispose();
    this.group.removeFromParent();
  }
}
