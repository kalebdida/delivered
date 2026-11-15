import {
  Color,
  CylinderGeometry,
  DataTexture,
  FloatType,
  Mesh,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
} from 'three';

export interface VerletOptions {
  /** Constraint relaxation passes per step (default 6). More is stiffer. */
  iterations?: number;
  gravity?: [number, number, number];
  /** Velocity kept per step, 0..1 (default 0.985). */
  damping?: number;
}

export interface Constraint {
  a: number;
  b: number;
  rest: number;
  /** 0..1 (default 1). */
  stiffness: number;
}

/**
 * Generic Verlet integrator for ropes and cloth: points, distance constraints, pins, wind.
 *
 * ```ts
 * const rope = createRope([0, 3, 0], [2, 3, 0], 24);
 * rope.pin(0);
 * rope.wind = (x, y, z, t) => [Math.sin(t) * 2, 0, 0];
 * loop.onFixed((dt) => rope.step(dt));
 * const tex = rope.toTexture();     // sample in a vertex shader to drive a tube or ribbon
 * loop.onFrame(() => rope.updateTexture());
 * ```
 */
export class Verlet {
  /** xyz per point. */
  readonly positions: Float32Array;
  readonly previous: Float32Array;
  /** 0 = pinned, 1 = free. */
  readonly invMass: Float32Array;
  readonly constraints: Constraint[] = [];
  readonly count: number;
  iterations: number;
  gravity: [number, number, number];
  damping: number;
  /** Optional wind acceleration field. */
  wind: ((x: number, y: number, z: number, time: number) => [number, number, number]) | null = null;
  /** Optional floor height; points are kept above it. */
  floorY: number | null = null;
  private time = 0;
  private texture: DataTexture | null = null;

  constructor(count: number, opts: VerletOptions = {}) {
    this.count = count;
    this.positions = new Float32Array(count * 3);
    this.previous = new Float32Array(count * 3);
    this.invMass = new Float32Array(count).fill(1);
    this.iterations = opts.iterations ?? 6;
    this.gravity = opts.gravity ?? [0, -9.81, 0];
    this.damping = opts.damping ?? 0.985;
  }

  setPoint(i: number, x: number, y: number, z: number): void {
    const o = i * 3;
    this.positions[o] = this.previous[o] = x;
    this.positions[o + 1] = this.previous[o + 1] = y;
    this.positions[o + 2] = this.previous[o + 2] = z;
  }
  getPoint(i: number): [number, number, number] {
    const o = i * 3;
    return [this.positions[o]!, this.positions[o + 1]!, this.positions[o + 2]!];
  }

  /** Pin a point in place (optionally moving it first). A pinned point ignores forces. */
  pin(i: number, at?: [number, number, number]): void {
    this.invMass[i] = 0;
    if (at) this.setPoint(i, at[0], at[1], at[2]);
  }
  unpin(i: number): void {
    this.invMass[i] = 1;
  }
  /** Move a pinned point (for example to follow a hand). */
  movePin(i: number, x: number, y: number, z: number): void {
    const o = i * 3;
    this.positions[o] = x;
    this.positions[o + 1] = y;
    this.positions[o + 2] = z;
  }

  /** Add a distance constraint. `rest` defaults to the current distance. */
  constrain(a: number, b: number, rest?: number, stiffness = 1): Constraint {
    const c: Constraint = { a, b, rest: rest ?? this.distance(a, b), stiffness };
    this.constraints.push(c);
    return c;
  }
  /** Remove a constraint (cut the rope, tear the cloth). */
  release(c: Constraint): void {
    const i = this.constraints.indexOf(c);
    if (i >= 0) this.constraints.splice(i, 1);
  }

  distance(a: number, b: number): number {
    const p = this.positions;
    return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
  }

  step(dt: number): void {
    this.time += dt;
    const p = this.positions;
    const q = this.previous;
    const dt2 = dt * dt;
    for (let i = 0; i < this.count; i++) {
      if (this.invMass[i] === 0) continue;
      const o = i * 3;
      let ax = this.gravity[0];
      let ay = this.gravity[1];
      let az = this.gravity[2];
      if (this.wind) {
        const w = this.wind(p[o]!, p[o + 1]!, p[o + 2]!, this.time);
        ax += w[0];
        ay += w[1];
        az += w[2];
      }
      for (let k = 0; k < 3; k++) {
        const cur = p[o + k]!;
        const acc = k === 0 ? ax : k === 1 ? ay : az;
        p[o + k] = cur + (cur - q[o + k]!) * this.damping + acc * dt2;
        q[o + k] = cur;
      }
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const c of this.constraints) {
        const a = c.a * 3;
        const b = c.b * 3;
        const dx = p[b]! - p[a]!;
        const dy = p[b + 1]! - p[a + 1]!;
        const dz = p[b + 2]! - p[a + 2]!;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const wa = this.invMass[c.a]!;
        const wb = this.invMass[c.b]!;
        const w = wa + wb;
        if (w === 0) continue;
        const diff = ((d - c.rest) / d) * c.stiffness;
        const ka = (wa / w) * diff;
        const kb = (wb / w) * diff;
        p[a] = p[a]! + dx * ka;
        p[a + 1] = p[a + 1]! + dy * ka;
        p[a + 2] = p[a + 2]! + dz * ka;
        p[b] = p[b]! - dx * kb;
        p[b + 1] = p[b + 1]! - dy * kb;
        p[b + 2] = p[b + 2]! - dz * kb;
      }
      if (this.floorY !== null) {
        for (let i = 0; i < this.count; i++) {
          if (p[i * 3 + 1]! < this.floorY) p[i * 3 + 1] = this.floorY;
        }
      }
    }
  }

  /**
   * A float DataTexture of the points (RGBA, `width` x `count/width`), for shader-driven tubes and
   * ribbons. For a rope leave `width` at `count` (a 1-pixel-high strip); for cloth pass the column
   * count so the texture matches the grid.
   */
  toTexture(width = this.count): DataTexture {
    const height = Math.ceil(this.count / width);
    const data = new Float32Array(width * height * 4);
    this.texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
    // Nearest: float textures cannot be linearly filtered on every phone.
    this.texture.minFilter = this.texture.magFilter = NearestFilter;
    this.updateTexture();
    return this.texture;
  }
  /** Copy current positions into the texture from `toTexture()`. Call once per frame. */
  updateTexture(): void {
    if (!this.texture) return;
    const data = this.texture.image.data as Float32Array;
    for (let i = 0; i < this.count; i++) {
      data[i * 4] = this.positions[i * 3]!;
      data[i * 4 + 1] = this.positions[i * 3 + 1]!;
      data[i * 4 + 2] = this.positions[i * 3 + 2]!;
      data[i * 4 + 3] = 1;
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
  }
}

/** A rope of `segments + 1` points from `from` to `to`, with slack (1 = taut, 1.2 = 20% extra). */
export function createRope(
  from: [number, number, number],
  to: [number, number, number],
  segments: number,
  opts: VerletOptions & { slack?: number } = {},
): Verlet {
  const v = new Verlet(segments + 1, opts);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    v.setPoint(i, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
  }
  const rest = (Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]) / segments) * (opts.slack ?? 1);
  for (let i = 0; i < segments; i++) v.constrain(i, i + 1, rest);
  return v;
}

/** A cloth grid in the XY plane hanging from `origin` (top-left). Index = row * (cols + 1) + col. */
export function createCloth(
  origin: [number, number, number],
  width: number,
  height: number,
  cols: number,
  rows: number,
  opts: VerletOptions = {},
): Verlet & { cols: number; rows: number } {
  const v = new Verlet((cols + 1) * (rows + 1), opts) as Verlet & { cols: number; rows: number };
  v.cols = cols;
  v.rows = rows;
  const idx = (r: number, c: number) => r * (cols + 1) + c;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      v.setPoint(idx(r, c), origin[0] + (c / cols) * width, origin[1] - (r / rows) * height, origin[2]);
    }
  }
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      if (c < cols) v.constrain(idx(r, c), idx(r, c + 1));
      if (r < rows) v.constrain(idx(r, c), idx(r + 1, c));
      if (c < cols && r < rows) {
        v.constrain(idx(r, c), idx(r + 1, c + 1), undefined, 0.5);
        v.constrain(idx(r, c + 1), idx(r + 1, c), undefined, 0.5);
      }
    }
  }
  return v;
}

export interface RopeMeshOptions {
  radius?: number;
  color?: string;
  /** Rim light color (default bone). */
  rimColor?: string;
  /** Direction TO the key light. */
  lightDirection?: Vector3;
  radialSegments?: number;
}

/**
 * A tube that follows a Verlet rope entirely on the GPU: the vertex shader reads point positions
 * from the rope's DataTexture, so the CPU only uploads one small texture per frame.
 *
 * ```ts
 * const rope = createRope([0, 3, 0], [2, 3, 0], 24);
 * const tube = new RopeMesh(rope, { radius: 0.02, color: '#8E8A93' });
 * scene.add(tube.mesh);
 * loop.onFrame(() => tube.update());
 * ```
 */
export class RopeMesh {
  readonly mesh: Mesh;
  private mat: ShaderMaterial;

  constructor(private readonly rope: Verlet, opts: RopeMeshOptions = {}) {
    const tex = rope.toTexture();
    this.mat = new ShaderMaterial({
      uniforms: {
        uPoints: { value: tex },
        uCount: { value: rope.count },
        uRadius: { value: opts.radius ?? 0.02 },
        uColor: { value: new Color(opts.color ?? '#8E8A93') },
        uRim: { value: new Color(opts.rimColor ?? '#F7F3EA') },
        uLight: { value: opts.lightDirection ?? new Vector3(0.4, 0.8, 0.4).normalize() },
      },
      vertexShader: /* glsl */ `
        uniform sampler2D uPoints; uniform float uCount, uRadius;
        varying vec3 vN; varying vec3 vV;
        vec3 P(float i){ return texture2D(uPoints, vec2((clamp(i, 0.0, uCount - 1.0) + 0.5) / uCount, 0.5)).xyz; }
        void main(){
          float i = floor(uv.y * (uCount - 1.0) + 0.5);
          vec3 c = P(i);
          vec3 tan = normalize(P(i + 1.0) - P(i - 1.0) + vec3(0.0, 1e-5, 0.0));
          vec3 ref = abs(tan.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
          vec3 n = normalize(cross(tan, ref));
          vec3 b = cross(tan, n);
          float a = uv.x * 6.2831853;
          vec3 dir = cos(a) * n + sin(a) * b;
          vec4 mv = modelViewMatrix * vec4(c + dir * uRadius, 1.0);
          vN = normalMatrix * dir; vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor, uRim, uLight; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(vV);
          vec3 l = normalize((viewMatrix * vec4(uLight, 0.0)).xyz);
          float d = max(dot(n, l), 0.0) * 0.85 + 0.15;
          float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          gl_FragColor = vec4(uColor * d + uRim * rim * 0.35, 1.0);
        }`,
    });
    const geo = new CylinderGeometry(1, 1, 1, opts.radialSegments ?? 8, rope.count - 1, true);
    this.mesh = new Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'RopeMesh';
  }

  /** Upload the rope's current points. Call once per frame. */
  update(): void {
    this.rope.updateTexture();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
