import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, ShaderMaterial, Vector3 } from 'three';
import { seededRandom } from '../math/random';

export interface DustOptions {
  count?: number;
  /** Half-size of the volume the dust fills, centred on the object. */
  bounds?: [number, number, number];
  color?: string;
  /** Point size in pixels at 1 m. */
  size?: number;
  /** Drift speed. */
  speed?: number;
  opacity?: number;
  seed?: number | string;
}

/**
 * Drifting dust: the foreground depth layer DESIGN.md asks every scene to have. One draw call,
 * animated entirely in the vertex shader, wraps endlessly inside its bounds.
 *
 * ```ts
 * const dust = new Dust({ count: 800, bounds: [12, 6, 12], color: '#F5C76B' });
 * scene.add(dust.points);
 * loop.onFrame((dt) => dust.update(dt));
 * ```
 */
export class Dust {
  readonly points: Points;
  private mat: ShaderMaterial;

  constructor(opts: DustOptions = {}) {
    const count = opts.count ?? 600;
    const b = opts.bounds ?? [10, 6, 10];
    const rng = seededRandom(opts.seed ?? 'dust');
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rng.range(-b[0], b[0]);
      pos[i * 3 + 1] = rng.range(-b[1], b[1]);
      pos[i * 3 + 2] = rng.range(-b[2], b[2]);
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new BufferAttribute(seed, 4));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uColor: { value: new Color(opts.color ?? '#F5C76B') }, uSize: { value: opts.size ?? 10 },
        uSpeed: { value: opts.speed ?? 1 }, uOpacity: { value: opts.opacity ?? 0.7 },
        uBounds: { value: new Vector3(b[0], b[1], b[2]) },
        uPixelRatio: { value: Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime, uSize, uSpeed, uPixelRatio; uniform vec3 uBounds;
        attribute vec4 aSeed; varying float vAlpha;
        void main(){
          float t = uTime * uSpeed;
          vec3 p = position;
          p.x += sin(t * 0.11 + aSeed.x * 40.0) * 0.6 + t * 0.05 * (aSeed.y - 0.5);
          p.y += t * 0.04 * (0.3 + aSeed.z) + sin(t * 0.17 + aSeed.w * 30.0) * 0.25;
          p.z += cos(t * 0.09 + aSeed.y * 50.0) * 0.6;
          p = mod(p + uBounds, uBounds * 2.0) - uBounds;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 0.2);
          gl_PointSize = uSize * (0.35 + aSeed.z) * uPixelRatio / d;
          vec3 e = abs(p) / uBounds;
          float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, max(e.y, e.z)));
          float tw = 0.45 + 0.55 * sin(t * (0.5 + aSeed.x) + aSeed.w * 80.0);
          vAlpha = edge * tw * smoothstep(0.3, 1.5, d);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a = a * a * vAlpha * uOpacity;
          gl_FragColor = vec4(uColor * a, a); }`,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'Dust';
  }

  set opacity(v: number) {
    this.mat.uniforms.uOpacity!.value = v;
  }
  set color(hex: string) {
    (this.mat.uniforms.uColor!.value as Color).set(hex);
  }

  update(dt: number): void {
    this.mat.uniforms.uTime!.value += dt;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.mat.dispose();
    this.points.removeFromParent();
  }
}
