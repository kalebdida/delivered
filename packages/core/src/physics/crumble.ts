import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three';
import { seededRandom } from '../math/random';
import type { Physics, RigidBody, Vec3 } from './physics';

export type Polygon = [number, number][];

/**
 * Voronoi cells of seeded sites clipped to a rectangle centred on the origin.
 * Pure geometry (half-plane clipping), exported for tests and for pre-baking.
 */
export function voronoiCells(width: number, depth: number, count: number, seed: number | string = 1): { site: [number, number]; polygon: Polygon }[] {
  const rng = seededRandom(seed);
  const sites: [number, number][] = [];
  // Jittered grid gives evenly sized, natural-looking chunks.
  const cols = Math.max(1, Math.round(Math.sqrt((count * width) / depth)));
  const rows = Math.max(1, Math.ceil(count / cols));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols && sites.length < count; c++) {
      sites.push([
        (-0.5 + (c + 0.15 + rng() * 0.7) / cols) * width,
        (-0.5 + (r + 0.15 + rng() * 0.7) / rows) * depth,
      ]);
    }
  }
  const rect: Polygon = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
  return sites.map((site, i) => {
    let poly = rect;
    for (let j = 0; j < sites.length && poly.length; j++) {
      if (i === j) continue;
      const o = sites[j]!;
      // Keep the half-plane closer to `site` than to `o`.
      const mx = (site[0] + o[0]) / 2;
      const my = (site[1] + o[1]) / 2;
      const nx = o[0] - site[0];
      const ny = o[1] - site[1];
      poly = clip(poly, (p) => (p[0] - mx) * nx + (p[1] - my) * ny);
    }
    return { site, polygon: poly };
  }).filter((c) => c.polygon.length >= 3);
}

function clip(poly: Polygon, side: (p: [number, number]) => number): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = side(a);
    const db = side(b);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function polygonArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Extrude a convex polygon (XZ plane, centred on its centroid) into a flat-shaded prism. */
function prism(poly: Polygon, thickness: number): { geometry: BufferGeometry; centroid: [number, number]; hull: Float32Array } {
  let cx = 0;
  let cz = 0;
  for (const p of poly) {
    cx += p[0] / poly.length;
    cz += p[1] / poly.length;
  }
  const n = poly.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const h = thickness / 2;
  const local = poly.map((p) => [p[0] - cx, p[1] - cz] as [number, number]);
  const tri = (a: number[], b: number[], c: number[], nx: number, ny: number, nz: number) => {
    for (const v of [a, b, c]) {
      pos.push(v[0]!, v[1]!, v[2]!);
      nor.push(nx, ny, nz);
      uv.push(v[0]! + cx, v[2]! + cz);
    }
  };
  for (let i = 1; i < n - 1; i++) {
    const [a, b, c] = [local[0]!, local[i]!, local[i + 1]!];
    tri([a[0], h, a[1]], [c[0], h, c[1]], [b[0], h, b[1]], 0, 1, 0);
    tri([a[0], -h, a[1]], [b[0], -h, b[1]], [c[0], -h, c[1]], 0, -1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = local[i]!;
    const b = local[(i + 1) % n]!;
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const l = Math.hypot(ex, ez) || 1;
    const nx = ez / l;
    const nz = -ex / l;
    tri([a[0], h, a[1]], [b[0], h, b[1]], [b[0], -h, b[1]], nx, 0, nz);
    tri([a[0], h, a[1]], [b[0], -h, b[1]], [a[0], -h, a[1]], nx, 0, nz);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  const hull = new Float32Array(n * 6);
  local.forEach((p, i) => {
    hull.set([p[0], h, p[1], p[0], -h, p[1]], i * 6);
  });
  return { geometry, centroid: [cx, cz], hull };
}

export interface CrumbleOptions {
  /** Centre of the slab in world space. */
  position?: Vec3;
  width: number;
  depth: number;
  thickness: number;
  /** Number of chunks (default 24; keep within `quality.budget.maxBodies`). */
  chunks?: number;
  material: Material;
  seed?: number | string;
  density?: number;
  /** Give the intact slab a fixed collider so things can stand on it (default true). */
  solid?: boolean;
}

export interface CrumbleChunk {
  mesh: Mesh;
  /** XZ centre relative to the slab. */
  centre: [number, number];
  /** Null until released. */
  body: RigidBody | null;
  /** The fixed collider body holding this chunk in place while intact. */
  anchor: RigidBody | null;
}

export interface Crumble {
  /** All chunk meshes. Add to your scene. */
  group: Group;
  chunks: CrumbleChunk[];
  /** Turn one chunk into a falling rigid body. */
  release(index: number, impulse?: Vec3): void;
  /** Release every chunk within `radius` of a world XZ point. @returns how many were released. */
  releaseNear(x: number, z: number, radius: number): number;
  /** Release everything, spreading outward from a point over `seconds` (0 = at once). */
  collapse(from?: { x: number; z: number }, seconds?: number): void;
  /** Advance staged collapses. Call from `loop.onFixed`. */
  update(dt: number): void;
  /** Number of chunks still in place. */
  readonly intact: number;
  dispose(): void;
}

/**
 * Platform crumble: a slab pre-fractured into Voronoi chunks. Chunks sit perfectly still (no
 * rigid bodies, zero cost) until released, then fall as convex rigid bodies.
 */
export function createCrumble(physics: Physics, opts: CrumbleOptions): Crumble {
  const { R, world } = physics;
  const origin = opts.position ?? { x: 0, y: 0, z: 0 };
  const group = new Group();
  const cells = voronoiCells(opts.width, opts.depth, opts.chunks ?? 24, opts.seed ?? 'crumble');
  const pending: { index: number; at: number }[] = [];
  let clock = 0;

  const chunks: CrumbleChunk[] = cells.map((cell) => {
    const { geometry, centroid, hull } = prism(cell.polygon, opts.thickness);
    const mesh = new Mesh(geometry, opts.material);
    mesh.position.set(origin.x + centroid[0], origin.y, origin.z + centroid[1]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.hull = hull;
    group.add(mesh);
    let anchor: RigidBody | null = null;
    if (opts.solid ?? true) {
      anchor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z));
      const desc = R.ColliderDesc.convexHull(hull);
      if (desc) world.createCollider(desc.setFriction(0.9), anchor);
    }
    return { mesh, centre: centroid, body: null, anchor };
  });

  const release = (index: number, impulse?: Vec3) => {
    const c = chunks[index];
    if (!c || c.body) return;
    if (c.anchor) {
      physics.remove(c.anchor);
      c.anchor = null;
    }
    const body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z)
        .setLinearDamping(0.05)
        .setAngularDamping(0.2),
    );
    const desc = R.ColliderDesc.convexHull(c.mesh.userData.hull as Float32Array);
    if (desc) world.createCollider(desc.setDensity(opts.density ?? 2.2).setFriction(0.8).setRestitution(0.05), body);
    if (impulse) body.applyImpulse(impulse, true);
    body.applyTorqueImpulse({ x: (Math.sin(index * 12.9898) * 0.5) * 0.4, y: 0, z: (Math.cos(index * 78.233) * 0.5) * 0.4 }, true);
    c.body = body;
    physics.bind(c.mesh, body);
  };

  return {
    group,
    chunks,
    release,
    releaseNear(x, z, radius) {
      let n = 0;
      chunks.forEach((c, i) => {
        if (!c.body && Math.hypot(origin.x + c.centre[0] - x, origin.z + c.centre[1] - z) <= radius) {
          release(i);
          n++;
        }
      });
      return n;
    },
    collapse(from = { x: origin.x, z: origin.z }, seconds = 0) {
      const dist = chunks.map((c) => Math.hypot(origin.x + c.centre[0] - from.x, origin.z + c.centre[1] - from.z));
      const max = Math.max(...dist, 1e-6);
      chunks.forEach((c, i) => {
        if (c.body) return;
        if (seconds <= 0) release(i);
        else pending.push({ index: i, at: clock + (dist[i]! / max) * seconds });
      });
    },
    update(dt) {
      clock += dt;
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.at <= clock) {
          release(pending[i]!.index);
          pending.splice(i, 1);
        }
      }
    },
    get intact() {
      return chunks.filter((c) => !c.body).length;
    },
    dispose() {
      for (const c of chunks) {
        if (c.body) physics.remove(c.body);
        if (c.anchor) physics.remove(c.anchor);
        c.mesh.geometry.dispose();
      }
      group.removeFromParent();
    },
  };
}
