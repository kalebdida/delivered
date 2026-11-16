// Procedural surface textures for the cell: rough-hewn masonry and worn flagstones. Generated
// once at load into small tileable DataTextures (albedo, normal, roughness). No image files.
import {
  DataTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';
import { createNoise, seededRandom } from '@delivered/core';

export interface SurfaceMaps {
  map: DataTexture;
  normalMap: DataTexture;
  roughnessMap: DataTexture;
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function tex(data: Uint8Array, size: number, srgb: boolean): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 4;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Height field + per-texel tint + roughness → three maps. */
function bake(size: number, height: Float32Array, albedo: Float32Array, rough: Float32Array, strength: number): SurfaceMaps {
  const col = new Uint8Array(size * size * 4);
  const nor = new Uint8Array(size * size * 4);
  const rou = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      nor[i * 4] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      nor[i * 4 + 1] = Math.round((dy * inv * 0.5 + 0.5) * 255);
      nor[i * 4 + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      nor[i * 4 + 3] = 255;
      for (let k = 0; k < 3; k++) col[i * 4 + k] = Math.max(0, Math.min(255, Math.round(albedo[i * 3 + k]!)));
      col[i * 4 + 3] = 255;
      const r = Math.max(0, Math.min(255, Math.round(rough[i]! * 255)));
      rou[i * 4] = rou[i * 4 + 1] = rou[i * 4 + 2] = r;
      rou[i * 4 + 3] = 255;
    }
  }
  return { map: tex(col, size, true), normalMap: tex(nor, size, false), roughnessMap: tex(rou, size, false) };
}

/**
 * Rough-hewn ashlar masonry, tileable. One tile covers `TILE` metres of wall. Courses of uneven
 * height, stones of uneven width, chisel marks, chipped arrises, dark recessed mortar.
 */
export function masonry(size = 512, seed = 'masonry', baseColor = '#3A3530'): SurfaceMaps {
  const rng = seededRandom(seed);
  const noise = createNoise(seed);
  // Courses: uneven heights that sum to the tile.
  const rows: number[] = [];
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    const h = rng.range(0.6, 1.5);
    rows.push(h);
    sum += h;
  }
  const rowEdges = [0];
  for (const h of rows) rowEdges.push(rowEdges[rowEdges.length - 1]! + (h / sum) * size);
  // Stones per course: uneven widths that sum to the tile, rotated by a random offset (wraps).
  const courses = rows.map(() => {
    const widths: number[] = [];
    let s = 0;
    while (s < 0.999) {
      const w = Math.min(1 - s, rng.range(0.13, 0.42));
      widths.push(w);
      s += w;
    }
    const edges = [0];
    for (const w of widths) edges.push(edges[edges.length - 1]! + w * size);
    return { edges, offset: rng.range(0, size), tints: widths.map(() => [rng.range(-1, 1), rng.range(-1, 1), rng.range(0, 1)] as const) };
  });
  const H = new Float32Array(size * size);
  const A = new Float32Array(size * size * 3);
  const R = new Float32Array(size * size);
  const base = hex(baseColor);
  const mortar = base.map((c) => c * 0.4) as [number, number, number];
  const pale = base.map((c) => Math.min(255, c * 1.75)) as [number, number, number];
  for (let y = 0; y < size; y++) {
    let row = 0;
    while (row < rows.length - 1 && y >= rowEdges[row + 1]!) row++;
    const y0 = rowEdges[row]!;
    const y1 = rowEdges[row + 1]!;
    const course = courses[row]!;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      // Tileable noise: sample on a torus.
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const nx = Math.cos(a) * 1.6;
      const ny = Math.sin(a) * 1.6;
      const nz = Math.cos(b) * 1.6;
      const nw = Math.sin(b) * 1.6;
      const n1 = noise.fbm3(nx * 2 + nw, ny * 2, nz * 2, 4);
      const n2 = noise.fbm3(nx * 7, ny * 7 + nz, nw * 7, 3);
      const xs = (x + course.offset) % size;
      let k = 0;
      while (k < course.edges.length - 2 && xs >= course.edges[k + 1]!) k++;
      const x0 = course.edges[k]!;
      const x1 = course.edges[k + 1]!;
      const t = course.tints[k]!;
      // Distance to the stone's edges, wobbled so the arrises look chipped.
      const wob = n1 * 9 + n2 * 3.5;
      const d = Math.min(xs - x0, x1 - xs, y - y0, y1 - y) + wob;
      const bevel = Math.max(0, Math.min(1, (d - 2.5) / 9));
      const face = bevel * bevel * (3 - 2 * bevel);
      // Pillowed stone face with chisel marks.
      const chisel = Math.sin((xs + y * 0.6 + n1 * 30) * 0.9) * 0.04 * face;
      const h = face * (0.75 + 0.18 * n1 + 0.08 * n2) + chisel;
      H[i] = h;
      const m = 1 - Math.min(1, face * 1.6);
      const warm = t[0] * 7;
      const lum = 1 + t[1] * 0.22 + n1 * 0.2 + n2 * 0.12;
      // Pale efflorescence near the bottom of some stones.
      const bloom = Math.max(0, (y - y0) / (y1 - y0) - 0.55) * t[2] * 1.4 * Math.max(0, n2 + 0.2);
      for (let c = 0; c < 3; c++) {
        const s = base[c]! * lum + (c === 0 ? warm : c === 2 ? -warm * 0.6 : 0);
        const withPale = s + (pale[c]! - s) * Math.min(0.5, bloom);
        A[i * 3 + c] = withPale * (1 - m) + mortar[c]! * m;
      }
      R[i] = 0.78 + 0.18 * n2 + m * 0.1;
    }
  }
  return bake(size, H, A, R, 2.2);
}

/** Worn flagstones (jittered Voronoi), tileable, with grit and dark joints full of dirt. */
export function flagstones(size = 512, seed = 'floor', baseColor = '#36302a', joint = 0.34): SurfaceMaps {
  const rng = seededRandom(seed);
  const noise = createNoise(seed);
  const N = 5;
  const pts: [number, number, number][] = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([(i + rng.range(0.15, 0.85)) / N, (j + rng.range(0.15, 0.85)) / N, rng.range(-1, 1)]);
  const H = new Float32Array(size * size);
  const A = new Float32Array(size * size * 3);
  const R = new Float32Array(size * size);
  const stone = hex(baseColor);
  const dirt = stone.map((c) => c * joint) as [number, number, number];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const u = x / size;
      const v = y / size;
      const a = u * Math.PI * 2;
      const b = v * Math.PI * 2;
      const n1 = noise.fbm3(Math.cos(a) * 3, Math.sin(a) * 3, Math.cos(b) * 3 + Math.sin(b), 4);
      const n2 = noise.fbm3(Math.cos(a) * 11, Math.sin(b) * 11, Math.sin(a) * 11 + Math.cos(b), 2);
      let f1 = 9;
      let f2 = 9;
      let id = 0;
      for (let p = 0; p < pts.length; p++) {
        const [px, py] = pts[p]!;
        let dx = Math.abs(u - px);
        let dy = Math.abs(v - py);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const d = Math.hypot(dx, dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = p;
        } else if (d < f2) f2 = d;
      }
      const edge = (f2 - f1) * size + n1 * 4;
      const e = Math.max(0, Math.min(1, (edge - 2) / 10));
      const face = e * e * (3 - 2 * e);
      H[i] = face * (0.7 + 0.2 * n1) + n2 * 0.05;
      const tint = pts[id]![2];
      const lum = 1 + tint * 0.12 + n1 * 0.18 + n2 * 0.12;
      for (let c = 0; c < 3; c++) A[i * 3 + c] = stone[c]! * lum * face + dirt[c]! * (1 - face);
      R[i] = 0.7 + 0.25 * n1 + (1 - face) * 0.05;
    }
  }
  return bake(size, H, A, R, 1.6);
}

/** World metres covered by one texture tile. */
export const TILE = 2.2;

/** Coarse wool: vertical folds, a slubby weave, worn patches. Tileable; for robes and cloaks. */
export function clothMaps(size = 256, seed = 'wool'): SurfaceMaps {
  const noise = createNoise(seed);
  const H = new Float32Array(size * size);
  const A = new Float32Array(size * size * 3);
  const R = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const a = (x / size) * Math.PI * 2;
      const b = (y / size) * Math.PI * 2;
      const fold = noise.fbm3(Math.cos(a) * 1.2, Math.sin(a) * 1.2, Math.cos(b) * 0.25 + Math.sin(b) * 0.25, 3);
      const slub = noise.fbm3(Math.cos(a) * 9, Math.sin(a) * 9, Math.cos(b) * 2 + Math.sin(b) * 2, 2);
      const weave = Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.06;
      H[i] = fold * 0.9 + slub * 0.18 + weave;
      const lum = 0.92 + slub * 0.18 + fold * 0.1;
      A[i * 3] = 205 * lum;
      A[i * 3 + 1] = 198 * lum;
      A[i * 3 + 2] = 190 * lum;
      R[i] = 0.9 + slub * 0.08;
    }
  }
  return bake(size, H, A, R, 3.2);
}
