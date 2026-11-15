import { seededRandom } from './random';

/** CPU simplex noise (2D and 3D) with a seeded permutation, plus fbm. Output is roughly -1..1. */
export interface Noise {
  noise2(x: number, y: number): number;
  noise3(x: number, y: number, z: number): number;
  fbm2(x: number, y: number, octaves?: number, lacunarity?: number, gain?: number): number;
  fbm3(x: number, y: number, z: number, octaves?: number, lacunarity?: number, gain?: number): number;
}

const G3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
] as const;

export function createNoise(seed: number | string = 1): Noise {
  const rng = seededRandom(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]!;
    p[i] = p[j]!;
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]!;
  const g = (i: number) => G3[perm[i]! % 12]!;

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const noise2 = (x: number, y: number): number => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const gr = g(ii + perm[jj]!);
      t0 *= t0;
      n += t0 * t0 * (gr[0] * x0 + gr[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const gr = g(ii + i1 + perm[jj + j1]!);
      t1 *= t1;
      n += t1 * t1 * (gr[0] * x1 + gr[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const gr = g(ii + 1 + perm[jj + 1]!);
      t2 *= t2;
      n += t2 * t2 * (gr[0] * x2 + gr[1] * y2);
    }
    return 70 * n;
  };

  const noise3 = (x: number, y: number, z: number): number => {
    const s = (x + y + z) / 3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) / 6;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }
    const c = 1 / 6;
    const corners = [
      [x0, y0, z0, 0, 0, 0],
      [x0 - i1 + c, y0 - j1 + c, z0 - k1 + c, i1, j1, k1],
      [x0 - i2 + 2 * c, y0 - j2 + 2 * c, z0 - k2 + 2 * c, i2, j2, k2],
      [x0 - 1 + 0.5, y0 - 1 + 0.5, z0 - 1 + 0.5, 1, 1, 1],
    ] as const;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;
    for (const [cx, cy, cz, oi, oj, ok] of corners) {
      let tt = 0.6 - cx * cx - cy * cy - cz * cz;
      if (tt > 0) {
        const gr = g(ii + oi + perm[jj + oj + perm[kk + ok]!]!);
        tt *= tt;
        n += tt * tt * (gr[0] * cx + gr[1] * cy + gr[2] * cz);
      }
    }
    return 32 * n;
  };

  const fbm2: Noise['fbm2'] = (x, y, octaves = 5, lac = 2, gain = 0.5) => {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * noise2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return sum / norm;
  };
  const fbm3: Noise['fbm3'] = (x, y, z, octaves = 5, lac = 2, gain = 0.5) => {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += a * noise3(x * f, y * f, z * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return sum / norm;
  };
  return { noise2, noise3, fbm2, fbm3 };
}
