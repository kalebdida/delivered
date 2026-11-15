// The Roman cell: procedural masonry walls with a damp sheen, flagstones under straw, a stone
// ledge, a heavy plank door, a deep high window with iron bars, and the night sky beyond it.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  TorusGeometry,
  Vector3,
  type IUniform,
} from 'three';
import { glsl, seededRandom } from '@delivered/core';
import { BEAM_DIR, BENCH, CELL, DOOR, RINGS, WINDOW, WINDOW_INNER } from './layout';
import { TILE, flagstones, masonry, type SurfaceMaps } from './textures';

/** Box-map UVs from world positions so stones line up across every wall piece. */
export function worldUV(geo: BufferGeometry, tile = TILE): BufferGeometry {
  const p = geo.attributes.position!;
  const n = geo.attributes.normal!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ax >= ay && ax >= az) [u, v] = [p.getZ(i), p.getY(i)];
    else if (ay >= az) [u, v] = [p.getX(i), p.getZ(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

/** A world-space box (min/max corners) with world-mapped UVs. */
function slab(min: [number, number, number], max: [number, number, number]): BoxGeometry {
  const g = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  worldUV(g);
  return g;
}

const DAMP_GLSL = /* glsl */ `
varying vec3 vGainWorld;
float gainH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gainN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gainH(i), gainH(i+vec2(1,0)), f.x), mix(gainH(i+vec2(0,1)), gainH(i+vec2(1,1)), f.x), f.y); }
`;

/**
 * Stone that is damp low down and in streaks under the window: darker and glossier there, so the
 * moonlight catches a wet sheen.
 */
export function dampStone(maps: SurfaceMaps, opts: { tint?: string; dampHeight?: number; normalScale?: number } = {}): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    metalness: 0,
    color: new Color(opts.tint ?? '#ffffff'),
  });
  mat.normalScale.set(opts.normalScale ?? 0.75, opts.normalScale ?? 0.75);
  const dampHeight = (opts.dampHeight ?? 1.3).toFixed(2);
  const wx = WINDOW.x.toFixed(2);
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGainWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DAMP_GLSL}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float gLow = smoothstep(${dampHeight}, 0.0, vGainWorld.y) * (0.55 + 0.45 * gainN(vGainWorld.xz * 2.3 + vGainWorld.y));
        float gStreak = smoothstep(0.62, 0.92, gainN(vec2((vGainWorld.x + vGainWorld.z) * 7.0, vGainWorld.y * 0.35)))
          * smoothstep(3.3, 0.6, vGainWorld.y) * smoothstep(1.6, 0.2, abs(vGainWorld.x - ${wx}));
        float gDamp = clamp(max(gLow, gStreak * 0.9), 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.22, gDamp);
        diffuseColor.rgb *= mix(1.0, 0.62, gDamp);`,
      );
  };
  mat.customProgramCacheKey = () => `gain-damp-${dampHeight}`;
  return mat;
}

const SKY_FRAG = /* glsl */ `
uniform float uTime; varying vec2 vUv;
${glsl.hash}
${glsl.dither}
void main(){
  vec2 p = vUv - vec2(0.62, 0.78);
  float d = length(p * vec2(1.0, 1.2));
  vec3 night = mix(vec3(0.012, 0.02, 0.05), vec3(0.05, 0.08, 0.16), smoothstep(1.2, 0.0, d));
  float moon = smoothstep(0.105, 0.095, d);
  float halo = exp(-d * 6.0) * 1.4 + exp(-d * 18.0) * 2.0;
  vec3 c = night + vec3(0.81, 0.88, 1.0) * (moon * 6.0 + halo);
  float star = step(0.9975, hash12(floor(vUv * 220.0))) * (0.6 + 0.4 * sin(uTime * 2.0 + vUv.x * 90.0));
  c += vec3(0.8, 0.86, 1.0) * star * smoothstep(0.15, 0.4, d);
  gl_FragColor = vec4(c + dither(gl_FragCoord.xy), 1.0);
}`;

export class Cell {
  readonly group = new Group();
  /** Meshes that cast and receive the moon's shadow (walls, bars, ledge, door). */
  readonly solids: Object3D[] = [];
  readonly stone: MeshStandardMaterial;
  readonly floorMat: MeshStandardMaterial;
  readonly door: Group;
  readonly skyUniforms: Record<string, IUniform> = { uTime: { value: 0 } };
  private straw: InstancedMesh;

  constructor(opts: { strawCount: number }) {
    const wallMaps = masonry();
    const floorMaps = flagstones();
    this.stone = dampStone(wallMaps, { dampHeight: 1.25 });
    this.floorMat = dampStone(floorMaps, { tint: '#d8d0c4', dampHeight: 0.4, normalScale: 0.7 });
    this.floorMat.roughness = 0.95;
    const { x0, x1, z0, z1, height: h, wall: t } = CELL;

    // Floor and ceiling.
    const floor = new Mesh(worldUV(new PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2)), this.floorMat);
    floor.receiveShadow = true;
    floor.name = 'floor';
    this.group.add(floor);
    const ceilMat = new MeshStandardMaterial({ color: '#2a2622', roughness: 1, map: wallMaps.map, normalMap: wallMaps.normalMap });
    const ceil = new Mesh(slab([x0 - t, h, z0 - t], [x1 + t, h + t, z1 + t]), ceilMat);
    this.group.add(ceil);
    const timber = new MeshStandardMaterial({ color: '#2b2119', roughness: 0.9 });
    for (const z of [-1.4, 0.2, 1.8]) {
      const beam = new Mesh(new BoxGeometry(x1 - x0, 0.26, 0.24), timber);
      beam.position.set(0, h - 0.13, z);
      this.group.add(beam);
      this.solids.push(beam);
    }

    // Walls. The back wall is built around a slanted chute that runs along the moonlight from
    // the small barred outer window (B) to the inner opening (A), so the light can get through.
    const ax0 = WINDOW_INNER.x - WINDOW.w / 2;
    const ax1 = WINDOW_INNER.x + WINDOW.w / 2;
    const ay0 = WINDOW_INNER.y - WINDOW.h / 2;
    const ay1 = WINDOW_INNER.y + WINDOW.h / 2;
    const bx0 = WINDOW.x - WINDOW.w / 2;
    const bx1 = WINDOW.x + WINDOW.w / 2;
    const by0 = WINDOW.y - WINDOW.h / 2;
    const by1 = WINDOW.y + WINDOW.h / 2;
    const ux0 = Math.min(ax0, bx0);
    const ux1 = Math.max(ax1, bx1);
    const uy0 = Math.min(ay0, by0);
    const uy1 = Math.max(ay1, by1);
    const cap = 0.06;
    const pieces: Array<[[number, number, number], [number, number, number]]> = [
      // back wall (z0), around the chute's bounding rectangle
      [[x0 - t, 0, z0 - t], [ux0, h, z0]],
      [[ux1, 0, z0 - t], [x1 + t, h, z0]],
      [[ux0, 0, z0 - t], [ux1, uy0, z0]],
      [[ux0, uy1, z0 - t], [ux1, h, z0]],
      // inner face of the chute rectangle, leaving only the inner opening A
      [[ux0, uy0, z0 - cap], [ax0, uy1, z0]],
      [[ax1, uy0, z0 - cap], [ux1, uy1, z0]],
      [[ax0, ay1, z0 - cap], [ax1, uy1, z0]],
      [[ax0, uy0, z0 - cap], [ax1, ay0, z0]],
      // outer face, leaving only the barred window B
      [[ux0, uy0, z0 - t], [bx0, uy1, z0 - t + cap]],
      [[bx1, uy0, z0 - t], [ux1, uy1, z0 - t + cap]],
      [[bx0, by1, z0 - t], [bx1, uy1, z0 - t + cap]],
      [[bx0, uy0, z0 - t], [bx1, by0, z0 - t + cap]],
      // left and front walls
      [[x0 - t, 0, z0], [x0, h, z1]],
      [[x0 - t, 0, z1], [x1 + t, h, z1 + t]],
      // right wall, around the door
      [[x1, 0, z0], [x1 + t, h, DOOR.z - DOOR.w / 2 - 0.12]],
      [[x1, 0, DOOR.z + DOOR.w / 2 + 0.12], [x1 + t, h, z1]],
      [[x1, DOOR.h + 0.12, DOOR.z - DOOR.w / 2 - 0.12], [x1 + t, h, DOOR.z + DOOR.w / 2 + 0.12]],
    ];
    for (const [a, b] of pieces) {
      const m = new Mesh(slab(a, b), this.stone);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.solids.push(m);
    }
    // The chute's four sides: parallelograms from the outer window to the inner opening. The sill
    // catches the moon and glows pale.
    const zi = z0 - cap * 0.5;
    const zo = z0 - t + cap * 0.5;
    const chuteMat = this.stone.clone();
    chuteMat.side = DoubleSide;
    const quad = (a: Vector3, b: Vector3, c: Vector3, d: Vector3) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray()]), 3));
      g.computeVertexNormals();
      worldUV(g, TILE * 0.6);
      const m = new Mesh(g, chuteMat);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
    quad(V(bx0, by0, zo), V(bx1, by0, zo), V(ax1, ay0, zi), V(ax0, ay0, zi));
    quad(V(bx0, by1, zo), V(ax0, ay1, zi), V(ax1, ay1, zi), V(bx1, by1, zo));
    quad(V(bx0, by0, zo), V(ax0, ay0, zi), V(ax0, ay1, zi), V(bx0, by1, zo));
    quad(V(bx1, by0, zo), V(bx1, by1, zo), V(ax1, ay1, zi), V(ax1, ay0, zi));

    // Bars, across the outer window.
    const iron = new MeshStandardMaterial({ color: '#2c2a28', roughness: 0.5, metalness: 0.6 });
    const barZ = z0 - t + 0.09;
    for (let i = 0; i < WINDOW.bars; i++) {
      const bar = new Mesh(new CylinderGeometry(0.018, 0.018, WINDOW.h + 0.08, 8), iron);
      bar.position.set(bx0 + ((i + 1) / (WINDOW.bars + 1)) * WINDOW.w, WINDOW.y, barZ);
      bar.castShadow = true;
      this.group.add(bar);
      this.solids.push(bar);
    }
    const cross = new Mesh(new BoxGeometry(WINDOW.w + 0.06, 0.03, 0.03), iron);
    cross.position.set(WINDOW.x, WINDOW.y + 0.02, barZ);
    cross.castShadow = true;
    this.group.add(cross);
    this.solids.push(cross);

    // Night sky seen through the window (HDR moon so the bloom catches it).
    const sky = new Mesh(
      new PlaneGeometry(3.2, 2.4),
      new ShaderMaterial({ uniforms: this.skyUniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: SKY_FRAG, fog: false }),
    );
    // Up the chute, behind the outer window, facing back down the beam.
    sky.position.set(WINDOW.x, WINDOW.y, z0 - t).addScaledVector(BEAM_DIR, -1.4);
    sky.lookAt(new Vector3(WINDOW.x, WINDOW.y, z0 - t));
    this.group.add(sky);

    // Stone ledge along the back wall.
    const bench = new Mesh(slab([BENCH.x0, 0, BENCH.z0], [BENCH.x1, BENCH.height, BENCH.z1]), this.stone);
    bench.castShadow = bench.receiveShadow = true;
    this.group.add(bench);
    this.solids.push(bench);

    // Rings for the chains.
    for (const r of RINGS) {
      const ring = new Mesh(new TorusGeometry(0.06, 0.012, 8, 20), iron);
      ring.position.copy(r);
      ring.rotation.x = 0.4;
      this.group.add(ring);
      const plate = new Mesh(new BoxGeometry(0.08, 0.1, 0.02), iron);
      plate.position.set(r.x, r.y + 0.06, CELL.z0 + 0.01);
      this.group.add(plate);
    }

    // The door: heavy planks, iron straps, a small grille.
    this.door = new Group();
    this.door.position.set(x1 - 0.02, 0, DOOR.z);
    const wood = new MeshStandardMaterial({ color: '#3b2c1f', roughness: 0.82 });
    const rng = seededRandom('door');
    const planks = 6;
    for (let i = 0; i < planks; i++) {
      const w = DOOR.w / planks;
      const p = new Mesh(new BoxGeometry(0.1, DOOR.h, w - 0.008), wood.clone());
      (p.material as MeshStandardMaterial).color.offsetHSL(0, 0, rng.range(-0.03, 0.03));
      p.position.set(0, DOOR.h / 2, -DOOR.w / 2 + w * (i + 0.5));
      p.castShadow = p.receiveShadow = true;
      this.door.add(p);
    }
    for (const y of [0.35, DOOR.h - 0.35]) {
      const strap = new Mesh(new BoxGeometry(0.03, 0.08, DOOR.w * 0.94), iron);
      strap.position.set(-0.06, y, 0);
      this.door.add(strap);
    }
    const handle = new Mesh(new TorusGeometry(0.07, 0.012, 8, 20), iron);
    handle.position.set(-0.09, 1.05, -DOOR.w * 0.32);
    handle.rotation.y = Math.PI / 2;
    this.door.add(handle);
    this.group.add(this.door);
    // Stone jambs and lintel so the door sits in a frame.
    for (const s of [-1, 1]) {
      const jamb = new Mesh(slab([x1 - 0.1, 0, DOOR.z + s * (DOOR.w / 2) - 0.12 * (s < 0 ? 1 : 0)], [x1 + 0.02, DOOR.h + 0.12, DOOR.z + s * (DOOR.w / 2) + 0.12 * (s > 0 ? 1 : 0)]), this.stone);
      this.group.add(jamb);
    }
    const lintel = new Mesh(slab([x1 - 0.1, DOOR.h, DOOR.z - DOOR.w / 2 - 0.12], [x1 + 0.02, DOOR.h + 0.18, DOOR.z + DOOR.w / 2 + 0.12]), this.stone);
    this.group.add(lintel);

    // Straw: thin bent strands, heaped under the ledge and in the corners, sparse elsewhere.
    this.straw = this.buildStraw(opts.strawCount);
    this.group.add(this.straw);
  }

  private buildStraw(count: number): InstancedMesh {
    const g = new PlaneGeometry(0.0035, 0.13, 1, 3);
    // Bend each strand a little along its length.
    const pos = g.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setZ(i, (y + 0.065) * (y + 0.065) * 1.8);
    }
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: 2 });
    const mesh = new InstancedMesh(g, mat, count);
    const rng = seededRandom('straw');
    const m = new Matrix4();
    const o = new Object3D();
    const c = new Color();
    for (let i = 0; i < count; i++) {
      // Three heaps (under the ledge, front-left corner, by the door) plus scattered strands.
      const r = rng();
      let x: number;
      let z: number;
      if (r < 0.42) {
        x = rng.range(BENCH.x0 + 0.1, BENCH.x1 + 0.5);
        z = BENCH.z1 + Math.abs(rng.gauss()) * 0.45;
      } else if (r < 0.58) {
        x = CELL.x0 + Math.abs(rng.gauss()) * 0.5;
        z = rng.range(0.2, CELL.z1 - 0.2);
      } else if (r < 0.7) {
        x = CELL.x1 - Math.abs(rng.gauss()) * 0.6;
        z = rng.range(-2, -0.4);
      } else {
        x = rng.range(CELL.x0 + 0.1, CELL.x1 - 0.1);
        z = rng.range(CELL.z0 + 0.6, CELL.z1 - 0.1);
      }
      o.position.set(x, 0.004 + rng() * 0.03, z);
      o.rotation.set(rng.range(-0.25, 0.25), rng() * Math.PI * 2, rng.range(-0.15, 0.15));
      const s = rng.range(0.6, 1.4);
      o.scale.set(s, 1, s);
      o.updateMatrix();
      m.copy(o.matrix);
      mesh.setMatrixAt(i, m);
      c.set('#a8936a').offsetHSL(rng.range(-0.02, 0.02), rng.range(-0.1, 0.05), rng.range(-0.14, 0.04));
      mesh.setColorAt(i, c);
    }
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  update(dt: number): void {
    this.skyUniforms.uTime!.value += dt;
  }
}
