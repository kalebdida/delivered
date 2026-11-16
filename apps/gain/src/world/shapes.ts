// Shaped, soft silhouettes shared by the outdoor scenes: the palace guard (CH2), gable roofs for
// Rome and Philippi, plastered houses with arched doors (CH3's house, CH5's courtyard) and an olive
// tree. Everything is built from lathes, open cylinders and bevelled extrusions, so edges round
// off and catch a rim light instead of reading as boxes.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '@delivered/core';

const UP = new Vector3(0, 1, 0);

/** Give a geometry one vertex colour and keep only position, normal, uv and color (mergeable). */
function tint(g: BufferGeometry, hex: string): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
  const n = geo.attributes.position!.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new BufferAttribute(new Float32Array(n * 2), 2));
  const c = new Color(hex);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(col, 3));
  return geo;
}

const lathe = (pts: [number, number][], seg: number, phiStart = 0, phiLength = Math.PI * 2) =>
  new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg, phiStart, phiLength);

/** A capsule from a to b. */
function limb(a: Vector3, b: Vector3, r: number): BufferGeometry {
  const g = new CapsuleGeometry(r, Math.max(0.01, a.distanceTo(b)), 3, 7);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  const mid = a.clone().lerp(b, 0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

/**
 * One soldier of the palace guard, facing +z: tunic and legs, a cloak falling from the shoulders,
 * a curved shield on the left arm, a spear in the right hand, a crested helmet. Returned as two
 * merged geometries with vertex colours: `cloth` (matte) and `metal` (helmet, armour, spear head).
 */
export function guardGeometry(): { cloth: BufferGeometry; metal: BufferGeometry } {
  const cloth: BufferGeometry[] = [];
  const metal: BufferGeometry[] = [];
  // Legs and sandals.
  for (const s of [-1, 1]) {
    cloth.push(tint(limb(new Vector3(s * 0.085, 0.06, 0), new Vector3(s * 0.08, 0.6, 0), 0.055), '#3a2a22'));
  }
  // Tunic skirt, flaring a little, then the waist.
  cloth.push(tint(lathe([[0.0, 0.5], [0.2, 0.5], [0.22, 0.56], [0.19, 0.78], [0.165, 0.95], [0.0, 0.95]], 14), '#7a2a22'));
  // Armour (lorica): chest and rounded shoulders up to the neck.
  metal.push(tint(lathe([[0.0, 0.92], [0.17, 0.92], [0.195, 1.12], [0.215, 1.32], [0.19, 1.4], [0.11, 1.45], [0.06, 1.48], [0.0, 1.49]], 14), '#6f6658'));
  // Cloak (sagum): an open drape from the shoulders down the back, wider at the hem.
  cloth.push(tint(lathe([[0.12, 1.47], [0.225, 1.4], [0.25, 1.2], [0.27, 0.9], [0.3, 0.6], [0.31, 0.42]], 14, Math.PI * 0.62, Math.PI * 0.76), '#5e1f1a'));
  // Neck and head (seen only from behind and the side under the helmet).
  cloth.push(tint(new SphereGeometry(0.095, 10, 8).scale(0.95, 1.08, 1).translate(0, 1.6, 0.01), '#5a3c2c'));
  // Helmet: a bowl, a brim and neck guard, cheek pieces, and a transverse crest.
  metal.push(tint(new SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.62, 0), '#8a7244'));
  metal.push(tint(new TorusGeometry(0.11, 0.018, 5, 14).rotateX(Math.PI / 2).scale(1, 1, 1.12).translate(0, 1.6, -0.01), '#8a7244'));
  for (const s of [-1, 1]) metal.push(tint(new SphereGeometry(0.05, 6, 6).scale(0.35, 1.2, 0.9).translate(s * 0.1, 1.55, 0.03), '#8a7244'));
  cloth.push(tint(new TorusGeometry(0.11, 0.032, 6, 12, Math.PI).rotateY(Math.PI / 2).scale(1, 0.9, 1).translate(0, 1.7, 0), '#8e2a1e'));
  // Arms: left holds the shield forward, right holds the spear upright.
  const shL = new Vector3(0.21, 1.36, 0);
  const elL = new Vector3(0.3, 1.08, 0.12);
  const hdL = new Vector3(0.28, 0.98, 0.32);
  cloth.push(tint(limb(shL, elL, 0.068), '#6e2620'), tint(limb(elL, hdL, 0.055), '#5a3c2c'));
  const shR = new Vector3(-0.21, 1.36, 0);
  const elR = new Vector3(-0.3, 1.08, 0.04);
  const hdR = new Vector3(-0.32, 1.12, 0.2);
  cloth.push(tint(limb(shR, elR, 0.068), '#6e2620'), tint(limb(elR, hdR, 0.055), '#5a3c2c'));
  // Shield (scutum): a curved, rounded rectangle on the left forearm, with a boss.
  const shield = new CylinderGeometry(0.55, 0.55, 0.92, 10, 1, true, -0.46, 0.92);
  shield.translate(0, 0, -0.55).rotateY(0.35).translate(0.3, 0.98, 0.36);
  cloth.push(tint(shield, '#7a2620'));
  metal.push(tint(new SphereGeometry(0.06, 8, 6).scale(1, 1, 0.6).translate(0.33, 0.98, 0.42), '#b08a4a'));
  // Spear: a shaft through the right hand and a leaf-shaped head.
  cloth.push(tint(new CylinderGeometry(0.016, 0.02, 2.35, 5).translate(-0.33, 1.05, 0.21), '#4a3828'));
  metal.push(tint(lathe([[0.0, 2.2], [0.028, 2.27], [0.022, 2.36], [0.0, 2.46]], 5).translate(-0.33, 0.0, 0.21), '#c8b48a'));
  return { cloth: mergeGeometries(cloth)!, metal: mergeGeometries(metal)! };
}

/** A unit gable roof: base 1 x 1 on y = 0, ridge along z at y = 1, eaves overhanging a little. */
export function gableGeometry(overhang = 0.08): BufferGeometry {
  const s = new Shape();
  const o = 0.5 + overhang;
  s.moveTo(-o, -overhang * 0.5);
  s.lineTo(o, -overhang * 0.5);
  s.lineTo(0, 1);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 1 + overhang * 2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  g.translate(0, 0, -0.5 - overhang);
  g.computeVertexNormals();
  return g;
}

/** Barrel roof tiles (terracotta), as a tiling colour map. */
export function tileTexture(seed = 'tiles'): CanvasTexture {
  const rng = seededRandom(seed);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cols = 8;
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i / cols) * S;
      const w = S / cols;
      const y = (j / rows) * S;
      const hgt = S / rows;
      const l = 40 + rng() * 14;
      const grad = g.createLinearGradient(x, 0, x + w, 0);
      grad.addColorStop(0, `hsl(16, 45%, ${l - 18}%)`);
      grad.addColorStop(0.5, `hsl(18, 50%, ${l}%)`);
      grad.addColorStop(1, `hsl(16, 45%, ${l - 20}%)`);
      g.fillStyle = grad;
      g.fillRect(x, y, w, hgt);
      g.fillStyle = 'rgba(20,10,6,0.35)';
      g.fillRect(x, y + hgt - 3, w, 3);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export interface HouseOptions {
  w: number;
  d: number;
  h: number;
  plaster: Material;
  roof: Material;
  /** Door in the front wall (+z): centre x and width. Height is 2.05 m with an arched top. */
  door?: { x: number; w: number };
  /** Window openings in the front wall: centre x, centre y, width, height. */
  windows?: { x: number; y: number; w: number; h: number }[];
  /** Roof pitch height. */
  pitch?: number;
}

/** A plastered house with soft, bevelled walls, openings cut in the front wall and a tiled gable roof. */
export function buildHouse(o: HouseOptions): Group {
  const group = new Group();
  const t = 0.24;
  const bevel = { bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 };
  const wall = (shape: Shape, depth: number) => {
    const g = new ExtrudeGeometry(shape, { depth, ...bevel });
    const m = new Mesh(g, o.plaster);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const rect = (w: number, h: number) => {
    const s = new Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(w / 2, h);
    s.lineTo(-w / 2, h);
    s.closePath();
    return s;
  };
  // Front wall with its openings.
  const front = rect(o.w, o.h);
  if (o.door) {
    const p = new Path();
    const r = o.door.w / 2;
    const top = 2.05 - r;
    p.moveTo(o.door.x - r, 0.001);
    p.lineTo(o.door.x + r, 0.001);
    p.lineTo(o.door.x + r, top);
    p.absarc(o.door.x, top, r, 0, Math.PI, false);
    p.lineTo(o.door.x - r, 0.001);
    front.holes.push(p);
  }
  for (const win of o.windows ?? []) {
    const p = new Path();
    p.moveTo(win.x - win.w / 2, win.y - win.h / 2);
    p.lineTo(win.x + win.w / 2, win.y - win.h / 2);
    p.lineTo(win.x + win.w / 2, win.y + win.h / 2);
    p.lineTo(win.x - win.w / 2, win.y + win.h / 2);
    p.closePath();
    front.holes.push(p);
  }
  const f = wall(front, t);
  f.position.z = o.d / 2 - t;
  const back = wall(rect(o.w, o.h), t);
  back.position.z = -o.d / 2;
  const sideShape = rect(o.d - 2 * t, o.h);
  const left = wall(sideShape, t);
  left.rotation.y = Math.PI / 2;
  left.position.x = -o.w / 2 + t;
  const right = wall(sideShape, t);
  right.rotation.y = Math.PI / 2;
  right.position.x = o.w / 2;
  group.add(f, back, left, right);
  // A plinth course along the base and a cornice under the roof soften the box.
  const band = new MeshStandardMaterial({ color: '#8a7c68', roughness: 1 });
  const plinth = new Mesh(new CylinderGeometry(0.5, 0.5, 1, 4, 1).rotateY(Math.PI / 4), band);
  plinth.scale.set((o.w + 0.1) * Math.SQRT2, 0.22, (o.d + 0.1) * Math.SQRT2);
  plinth.position.y = 0.11;
  group.add(plinth);
  // Roof.
  const roof = new Mesh(gableGeometry(0.1), o.roof);
  const pitch = o.pitch ?? Math.min(o.w, o.d) * 0.32;
  if (o.w >= o.d) {
    roof.rotation.y = Math.PI / 2;
    roof.scale.set(o.d + 0.2, pitch, o.w + 0.1);
  } else roof.scale.set(o.w + 0.2, pitch, o.d + 0.1);
  roof.position.y = o.h + 0.02;
  roof.castShadow = true;
  group.add(roof);
  return group;
}

/** An olive tree: a twisting trunk and a soft, lumpy crown of grey-green clumps. */
export function oliveTree(seed = 'olive', scale = 1): Group {
  const rng = seededRandom(seed);
  const g = new Group();
  const bark = new MeshStandardMaterial({ color: '#5a4a3a', roughness: 1 });
  const leaf = new MeshStandardMaterial({ color: '#66734e', roughness: 0.85, flatShading: false });
  const trunk = new Mesh(lathe([[0.26, 0], [0.2, 0.25], [0.14, 0.9], [0.16, 1.4], [0.11, 1.9], [0.05, 2.3]], 9), bark);
  trunk.rotation.z = 0.12;
  g.add(trunk);
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const r = 0.3 + rng() * 0.8;
    // Indexed, so the normals smooth across the clump instead of showing facets.
    const geo = mergeVertices(new IcosahedronGeometry(0.55 + rng() * 0.35, 3).deleteAttribute('normal').deleteAttribute('uv'));
    const pos = geo.attributes.position!;
    for (let k = 0; k < pos.count; k++) {
      const v = new Vector3().fromBufferAttribute(pos, k);
      v.multiplyScalar(0.88 + 0.16 * Math.sin(v.x * 5 + i) * Math.cos(v.z * 4 - i));
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new Mesh(geo, leaf);
    m.position.set(Math.cos(a) * r + 0.2, 2.2 + rng() * 0.8, Math.sin(a) * r);
    m.scale.set(1.2, 0.75, 1.1);
    m.castShadow = true;
    g.add(m);
  }
  g.scale.setScalar(scale);
  return g;
}

/** A cypress: a tall soft flame of dark green, for skylines. */
export function cypressGeometry(): BufferGeometry {
  return lathe([[0, 0], [0.35, 0.3], [0.55, 1.6], [0.5, 3.2], [0.32, 4.6], [0.12, 5.6], [0, 6]], 10);
}


/**
 * One city house for instancing (Rome's skyline), in a unit box centred on the origin so a
 * non-uniform scale gives every house its own proportions. Battered walls that lean in toward the
 * eaves, a plinth course, a cornice under the roof, and a lower wing with its own parapet, so the
 * silhouette steps and every edge catches the rim light.
 */
export function cityHouseGeometry(): BufferGeometry {
  const body = new BoxGeometry(1, 1, 1, 1, 1, 1);
  const bp = body.attributes.position!;
  for (let i = 0; i < bp.count; i++) if (bp.getY(i) > 0) bp.setXYZ(i, bp.getX(i) * 0.93, bp.getY(i), bp.getZ(i) * 0.93);
  const cornice = new BoxGeometry(1.0, 0.045, 1.0).translate(0, 0.478, 0);
  const plinth = new BoxGeometry(1.05, 0.09, 1.05).translate(0, -0.455, 0);
  const wing = new BoxGeometry(0.42, 0.52, 0.66);
  const wp = wing.attributes.position!;
  for (let i = 0; i < wp.count; i++) if (wp.getY(i) > 0) wp.setXYZ(i, wp.getX(i) * 0.94, wp.getY(i), wp.getZ(i) * 0.94);
  wing.translate(0.68, -0.24, 0.08);
  const parapet = new BoxGeometry(0.44, 0.04, 0.68).translate(0.68, 0.03, 0.08);
  const stair = new BoxGeometry(0.16, 0.2, 0.5).translate(-0.57, -0.4, -0.1);
  const g = mergeGeometries([body, cornice, plinth, wing, parapet, stair])!;
  g.computeVertexNormals();
  return g;
}
