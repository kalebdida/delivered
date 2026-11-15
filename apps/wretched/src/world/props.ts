// The light on the hill, the temptation attractors, the law monoliths and a small particle pool
// (sparks, gold dust, ash, footprint glow).
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group,
  IcosahedronGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Points, ShaderMaterial, SRGBColorSpace, TorusKnotGeometry, Vector3,
} from 'three';
import { LightShaft, glsl, seededRandom } from '@delivered/core';
import { ATTRACTORS, MONOLITHS, PATH } from './layout';
import { heightAt } from './terrain';

// -------------------------------------------------------------------------------------------------
// The light on the hill
// -------------------------------------------------------------------------------------------------
const GLOW_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Beacon {
  readonly group = new Group();
  readonly shaft: LightShaft;
  private readonly core: Mesh;
  private readonly halo: Mesh;
  private readonly haloMat: ShaderMaterial;
  private readonly coreMat: ShaderMaterial;
  /** 1 normal, grows in CH5 and at the summit. */
  level = 1;
  readonly top: Vector3;

  constructor() {
    const y = heightAt(0, PATH.light);
    this.top = new Vector3(0, y, PATH.light);
    this.group.position.copy(this.top);
    this.coreMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color('#FFD9A0') }, uLevel: { value: 1 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uLevel, uTime; varying vec3 vN; varying vec3 vV; varying float vY;
        ${glsl.dither}
        void main(){ float f = pow(abs(dot(vN, vV)), 1.6); float fade = smoothstep(220.0, 30.0, vY) * smoothstep(-1.0, 2.0, vY);
          float pulse = 0.92 + 0.08 * sin(uTime * 0.8 - vY * 0.05);
          gl_FragColor = vec4(uColor * (2.2 + 4.0 * f) * uLevel * pulse * fade + dither(gl_FragCoord.xy), f * fade); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.core = new Mesh(new CylinderGeometry(0.9, 1.2, 240, 24, 1, true), this.coreMat);
    this.core.position.y = 120;
    this.haloMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color('#FFD9A0') }, uLevel: { value: 1 } },
      vertexShader: GLOW_VERT,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uLevel; varying vec2 vUv; ${glsl.dither}
        void main(){ float r = length(vUv - 0.5) * 2.0; float g = exp(-r * r * 5.0) * 0.9 + exp(-r * 2.6) * 0.25;
          gl_FragColor = vec4(uColor * g * uLevel * 1.4 + dither(gl_FragCoord.xy), g); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    this.halo = new Mesh(new PlaneGeometry(46, 46), this.haloMat);
    this.halo.position.y = 6;
    this.shaft = new LightShaft({ color: '#FFD9A0', length: 60, radiusTop: 3, radiusBottom: 9, intensity: 0.42, motes: 200, seed: 'beacon' });
    this.shaft.group.position.y = 60;
    this.group.add(this.core, this.halo, this.shaft.group);
  }

  update(dt: number, time: number, camera: { position: Vector3 }): void {
    this.coreMat.uniforms.uTime!.value = time;
    this.coreMat.uniforms.uLevel!.value = this.level;
    this.haloMat.uniforms.uLevel!.value = this.level;
    this.halo.lookAt(camera.position.x, this.halo.getWorldPosition(TMP).y, camera.position.z);
    // Up close the halo would fill the frame: shrink it as the visitor arrives.
    const near = Math.min(1, Math.max(0.22, TMP.distanceTo(camera.position) / 70));
    this.halo.scale.setScalar(near);
    this.shaft.intensity = 0.36 * this.level;
    this.shaft.update(dt);
  }

  dispose(): void {
    this.core.geometry.dispose();
    this.coreMat.dispose();
    this.halo.geometry.dispose();
    this.haloMat.dispose();
    this.shaft.dispose();
  }
}
const TMP = new Vector3();

// -------------------------------------------------------------------------------------------------
// Temptation attractors: oily, iridescent, humming. Abstract shapes only.
// -------------------------------------------------------------------------------------------------
export function iridescentMaterial(): MeshStandardMaterial & { userData: { time: { value: number } } } {
  const time = { value: 0 };
  const m = new MeshStandardMaterial({ color: '#1b1820', roughness: 0.12, metalness: 0.85, emissive: new Color('#000000') });
  m.userData.time = time;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Thin-film sheen: hue shifts with view angle and slow time, like oil on water.
        float fr = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float ph = fr * 6.0 + uTime * 0.35 + vViewPosition.y * 0.4;
        vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + ph));
        totalEmissiveRadiance += film * (0.08 + pow(fr, 2.0) * 1.4);`,
      );
  };
  m.customProgramCacheKey = () => 'wretched-iridescent';
  return m as MeshStandardMaterial & { userData: { time: { value: number } } };
}

export class Attractors {
  readonly group = new Group();
  readonly material = iridescentMaterial();
  readonly items: { mesh: Mesh; base: Vector3; kind: number }[] = [];

  constructor() {
    const geos = [new IcosahedronGeometry(0.75, 12), new TorusKnotGeometry(0.42, 0.13, 160, 18, 2, 5), new PlaneGeometry(1.3, 2.4, 1, 1)];
    for (const [x, z, kind] of ATTRACTORS) {
      const mesh = new Mesh(geos[kind]!, this.material);
      if (kind === 1) mesh.scale.set(1, 3.2, 1);
      if (kind === 2) (mesh.material as MeshStandardMaterial).side = DoubleSide;
      const base = new Vector3(x, heightAt(x, z) + (kind === 1 ? 2 : 1.5), z);
      mesh.position.copy(base);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.items.push({ mesh, base, kind });
    }
  }

  /** Nearest attractor to a point (xz), with its distance. */
  nearest(p: Vector3): { pos: Vector3; dist: number } | null {
    let best: Vector3 | null = null;
    let bd = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(it.base.x - p.x, it.base.z - p.z);
      if (d < bd) {
        bd = d;
        best = it.base;
      }
    }
    return best ? { pos: best, dist: bd } : null;
  }

  update(time: number): void {
    this.material.userData.time.value = time;
    this.items.forEach((it, i) => {
      it.mesh.position.y = it.base.y + Math.sin(time * 0.6 + i) * 0.18;
      it.mesh.rotation.y = time * (it.kind === 2 ? 0.15 : 0.25) + i;
      if (it.kind === 1) it.mesh.rotation.x = Math.sin(time * 0.3 + i) * 0.1;
    });
  }

  dispose(): void {
    const seen = new Set<BufferGeometry>();
    for (const it of this.items) seen.add(it.mesh.geometry);
    seen.forEach((g) => g.dispose());
    this.material.dispose();
  }
}

// -------------------------------------------------------------------------------------------------
// The law: tall pale monoliths, carved with luminous abstract marks. Holy, cold, beautiful.
// -------------------------------------------------------------------------------------------------
function carvingTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const rng = seededRandom('law');
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  // Columns of abstract marks: no letters, only rhythm.
  for (let col = 0; col < 3; col++) {
    const x0 = 46 + col * 82;
    for (let y = 70; y < 960; y += 26 + rng() * 10) {
      g.lineWidth = 2 + rng() * 2.2;
      g.globalAlpha = 0.55 + rng() * 0.45;
      g.beginPath();
      const w = 14 + rng() * 26;
      const kind = rng.int(0, 4);
      if (kind === 0) {
        g.moveTo(x0 - w / 2, y);
        g.lineTo(x0 + w / 2, y);
      } else if (kind === 1) {
        g.moveTo(x0 - w / 2, y + 6);
        g.lineTo(x0, y - 6);
        g.lineTo(x0 + w / 2, y + 6);
      } else if (kind === 2) {
        g.arc(x0, y, w / 3, Math.PI * 0.1, Math.PI * 1.1);
      } else if (kind === 3) {
        g.moveTo(x0, y - 8);
        g.lineTo(x0, y + 8);
        g.moveTo(x0 - w / 3, y);
        g.lineTo(x0 + w / 3, y);
      } else {
        g.moveTo(x0 - w / 2, y - 5);
        g.lineTo(x0 + w / 2, y - 5);
        g.moveTo(x0 - w / 3, y + 5);
        g.lineTo(x0 + w / 3, y + 5);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.strokeRect(18, 30, 220, 964);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class Monoliths {
  readonly group = new Group();
  readonly material: MeshStandardMaterial;
  private readonly carving: CanvasTexture;
  readonly shafts: LightShaft[] = [];
  readonly items: { mesh: Mesh; pool: Vector3 }[] = [];
  private readonly cold = new Color('#E8F1FF');
  private readonly warm = new Color('#F5C76B');
  /** 0 cold holy light .. 1 warmed to gold (fulfilled). */
  warmth = 0;
  /** 0..1 how far they have risen out of the ground. */
  rise = 1;

  constructor(shafts: boolean) {
    this.carving = carvingTexture();
    this.material = new MeshStandardMaterial({
      color: '#c9c4ba', roughness: 0.78, metalness: 0.02, emissive: this.cold.clone(), emissiveMap: this.carving, emissiveIntensity: 2.4,
    });
    const geo = new BoxGeometry(1.5, 1, 0.8, 1, 1, 1);
    geo.translate(0, 0.5, 0);
    for (const [x, z, h] of MONOLITHS) {
      const mesh = new Mesh(geo, this.material);
      mesh.scale.set(1, h, 1);
      const y = heightAt(x, z) - 0.4;
      mesh.position.set(x, y, z);
      mesh.rotation.y = (x > 0 ? -1 : 1) * 0.35;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.base = y;
      mesh.userData.h = h;
      this.group.add(mesh);
      // The pool of light lies across the path in front of the stone.
      const pool = new Vector3(x * 0.25, 0, z);
      this.items.push({ mesh, pool });
      if (shafts) {
        const s = new LightShaft({ color: '#E8F1FF', length: h + 6, radiusTop: 0.6, radiusBottom: 3.4, intensity: 0.32, motes: 90, seed: `law${z}` });
        s.group.position.set(x * 0.6, heightAt(x, z) + h + 6, z);
        s.group.rotation.z = (x > 0 ? 1 : -1) * 0.18;
        this.group.add(s.group);
        this.shafts.push(s);
      }
    }
  }

  /** Light pool strength at a point: 0 dark .. 1 in the light. */
  exposureAt(p: Vector3): number {
    let e = 0;
    for (const it of this.items) {
      const d = Math.hypot(p.x - it.pool.x, p.z - it.pool.z);
      e = Math.max(e, 1 - Math.min(1, Math.max(0, (d - 2) / 2.8)));
    }
    return e * this.rise;
  }

  update(dt: number): void {
    this.material.emissive.copy(this.cold).lerp(this.warm, this.warmth);
    this.items.forEach(({ mesh }) => {
      const h = mesh.userData.h as number;
      mesh.position.y = (mesh.userData.base as number) - (1 - this.rise) * (h + 0.6);
    });
    for (const s of this.shafts) {
      s.intensity = 0.32 * this.rise;
      s.update(dt);
    }
  }

  dispose(): void {
    this.items[0]?.mesh.geometry.dispose();
    this.material.dispose();
    this.carving.dispose();
    this.shafts.forEach((s) => s.dispose());
  }
}

// -------------------------------------------------------------------------------------------------
// Particle pool: sparks, gold dust, ash, glow. One draw call, CPU-simulated, additive.
// -------------------------------------------------------------------------------------------------
export class Sparks {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly col: Float32Array;
  private readonly life: Float32Array;
  private readonly max: number;
  private readonly lifeMax: Float32Array;
  private next = 0;
  private readonly material: ShaderMaterial;

  constructor(max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.life = new Float32Array(max);
    this.lifeMax = new Float32Array(max).fill(1);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(this.col, 4));
    this.material = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec4 aColor; varying vec4 vColor; uniform float uPixelRatio;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vColor = aColor;
          gl_PointSize = aColor.a > 0.0 ? (3.0 * uPixelRatio * (8.0 / -mv.z) + 1.0) : 0.0; }`,
      fragmentShader: /* glsl */ `varying vec4 vColor; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vColor.rgb * vColor.a * smoothstep(0.5, 0.0, r), 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  emit(p: Vector3, count: number, color: Color, opts: { speed?: number; up?: number; life?: number; spread?: number; wind?: Vector3 } = {}): void {
    const sp = opts.speed ?? 2;
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const s = opts.spread ?? 0.05;
      this.pos[i * 3] = p.x + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * s;
      this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * s;
      const th = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const r = Math.sqrt(1 - u * u) * sp * (0.3 + Math.random() * 0.7);
      this.vel[i * 3] = Math.cos(th) * r + (opts.wind?.x ?? 0);
      this.vel[i * 3 + 1] = Math.abs(u) * sp * 0.6 + (opts.up ?? 1) + (opts.wind?.y ?? 0);
      this.vel[i * 3 + 2] = Math.sin(th) * r + (opts.wind?.z ?? 0);
      this.col[i * 4] = color.r;
      this.col[i * 4 + 1] = color.g;
      this.col[i * 4 + 2] = color.b;
      this.life[i] = this.lifeMax[i] = (opts.life ?? 1.2) * (0.6 + Math.random() * 0.8);
    }
  }

  update(dt: number, pixelRatio: number, gravity = -3): void {
    this.material.uniforms.uPixelRatio!.value = pixelRatio;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) {
        this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i]! -= dt;
      const l = Math.max(0, this.life[i]! / this.lifeMax[i]!);
      this.vel[i * 3 + 1]! += gravity * dt * 0.3;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k]! *= 1 - dt * 1.2;
        this.pos[i * 3 + k]! += this.vel[i * 3 + k]! * dt;
      }
      this.col[i * 4 + 3] = l * l;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.aColor!.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
