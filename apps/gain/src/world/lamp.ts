// The oil lamp (the only warm light), the papyrus sheet and the reed pen beside it.
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { createNoise, glsl } from '@delivered/core';

const LAMP_COLOR = '#FFB25C';

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  // Billboard: keep the flame facing the camera, upright.
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 s = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  c.xy += position.xy * s;
  gl_Position = projectionMatrix * c;
}`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime, uLevel, uSway; varying vec2 vUv;
${glsl.hash}
${glsl.dither}
void main(){
  vec2 p = vUv - vec2(0.5, 0.18);
  float h = clamp(p.y / 0.7, 0.0, 1.0);
  p.x -= sin(uTime * 7.0 + h * 3.0) * 0.02 * h + uSway * h * h * 0.12;
  // Teardrop: wide at the base, a point at the top.
  float w = mix(0.16, 0.0, pow(h, 0.8)) * (1.0 - smoothstep(0.9, 1.0, h));
  float d = abs(p.x) / max(w, 1e-3);
  float body = (1.0 - smoothstep(0.55, 1.0, d)) * step(-0.05, p.y) * smoothstep(-0.06, 0.02, p.y) * (1.0 - h);
  float core = (1.0 - smoothstep(0.0, 0.6, d)) * smoothstep(0.65, 0.0, h);
  vec3 col = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.78, 0.42), h * 0.5) * body * 3.2 + vec3(1.0, 0.93, 0.8) * core * 4.5;
  // A small blue root at the wick.
  col += vec3(0.25, 0.4, 1.0) * smoothstep(0.09, 0.0, length(p - vec2(0.0, 0.02))) * 0.8;
  float halo = exp(-length((vUv - vec2(0.5, 0.32)) * vec2(1.0, 0.7)) * 9.0) * 0.5;
  col += vec3(1.0, 0.6, 0.25) * halo;
  gl_FragColor = vec4(col * uLevel + dither(gl_FragCoord.xy), 1.0);
}`;


export class Lamp {
  readonly group = new Group();
  readonly light: PointLight;
  /** 0 out, 1 normal, up to ~2.2 bright (a life at its height). */
  level = 1;
  /** Target the level eases toward. */
  target = 1;
  private flameMat: ShaderMaterial;
  private flame: Mesh;
  private noise = createNoise('lamp');
  private time = 0;
  private readonly base = 3.0;

  constructor(position: Vector3) {
    this.group.position.copy(position);
    const clay = new MeshStandardMaterial({ color: '#5a3b26', roughness: 0.78 });
    // Body: a low rounded clay lamp with a filling hole, drawn as a lathe.
    const prof = [
      [0.0, 0.0], [0.05, 0.0], [0.075, 0.012], [0.085, 0.03], [0.078, 0.048], [0.05, 0.058], [0.022, 0.06], [0.016, 0.05], [0.0, 0.05],
    ].map(([x, y]) => new Vector2(x, y));
    const body = new Mesh(new LatheGeometry(prof, 28), clay);
    body.castShadow = true;
    this.group.add(body);
    const nozzle = new Mesh(new CylinderGeometry(0.018, 0.026, 0.09, 12), clay);
    nozzle.rotation.z = Math.PI / 2 - 0.12;
    nozzle.position.set(0.1, 0.035, 0);
    this.group.add(nozzle);
    const handle = new Mesh(new TorusGeometry(0.025, 0.008, 8, 16, Math.PI * 1.2), clay);
    handle.position.set(-0.09, 0.045, 0);
    handle.rotation.set(0, 0, Math.PI * 0.4);
    this.group.add(handle);

    this.flameMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uLevel: { value: 1 }, uSway: { value: 0 } },
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.flame = new Mesh(new PlaneGeometry(1, 1), this.flameMat);
    this.flame.position.set(0.15, 0.055, 0);
    this.flame.scale.set(0.09, 0.16, 1);
    this.flame.renderOrder = 15;
    this.flame.frustumCulled = false;
    this.group.add(this.flame);

    this.light = new PointLight(LAMP_COLOR, this.base, 7.5, 2);
    this.light.position.set(0.15, 0.16, 0);
    this.group.add(this.light);
  }

  /** World position of the flame (for things that orbit or glow in its light). */
  get flamePosition(): Vector3 {
    return this.flame.getWorldPosition(new Vector3());
  }

  update(dt: number): void {
    this.time += dt;
    this.level += (this.target - this.level) * (1 - Math.exp(-dt * 3.5));
    const f = this.noise.fbm2(this.time * 2.2, 0.3, 3) * 0.16 + this.noise.noise2(this.time * 9, 4.1) * 0.05;
    const lv = Math.max(0, this.level);
    this.light.intensity = this.base * lv * (1 + f);
    this.light.color.set(LAMP_COLOR).lerp(new Color('#ffd9a6'), Math.max(0, lv - 1) * 0.4);
    this.flameMat.uniforms.uTime!.value = this.time;
    this.flameMat.uniforms.uLevel!.value = Math.min(1.6, lv) * (1 + f * 0.6);
    this.flameMat.uniforms.uSway!.value = this.noise.noise2(this.time * 0.7, 9.3) * 0.6;
    const s = 0.55 + 0.45 * Math.min(1.8, lv);
    this.flame.scale.set(0.09 * s, 0.16 * s * (1 + f * 0.4), 1);
    this.flame.visible = lv > 0.01;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as MeshStandardMaterial | undefined)?.dispose?.();
    });
    this.light.dispose();
    this.group.removeFromParent();
  }
}

/** The sheet of papyrus by the lamp. `age` 0..1 yellows, darkens and curls it. */
export class Papyrus {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;

  constructor(position: Vector3, rotation = 0.3) {
    const g = new PlaneGeometry(0.34, 0.24, 16, 10).rotateX(-Math.PI / 2);
    this.mat = new ShaderMaterial({
      side: DoubleSide,
      uniforms: { uAge: { value: 0 }, uLight: { value: 1 } },
      vertexShader: /* glsl */ `
        uniform float uAge; varying vec2 vUv; varying vec3 vWorld;
        void main(){
          vUv = uv; vec3 p = position;
          // Edges lift a little; curl more with age.
          float e = abs(uv.x - 0.5) * 2.0;
          p.y += pow(e, 3.0) * (0.012 + uAge * 0.05) + sin(uv.y * 6.0) * 0.002;
          vec4 w = modelMatrix * vec4(p, 1.0); vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAge, uLight; varying vec2 vUv; varying vec3 vWorld;
        ${glsl.hash}
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
        void main(){
          // Woven fibres: horizontal and vertical strips.
          float fib = 0.82 + 0.1 * vn(vec2(vUv.x * 4.0, vUv.y * 160.0)) + 0.08 * vn(vec2(vUv.x * 150.0, vUv.y * 3.0));
          vec3 fresh = vec3(0.82, 0.71, 0.5);
          vec3 old = vec3(0.42, 0.3, 0.17);
          float stain = smoothstep(0.35, 0.9, vn(vUv * 5.0 + 3.0)) * uAge;
          vec3 c = mix(fresh, old, clamp(uAge * 0.7 + stain * 0.5, 0.0, 1.0)) * fib;
          float edge = smoothstep(0.0, 0.05, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)) + vn(vUv * 40.0) * 0.03 - uAge * 0.04);
          if (edge < 0.05) discard;
          // Lit by the lamp beside it (a cheap warm falloff) and very faintly by the room.
          float lamp = uLight * 0.7;
          gl_FragColor = vec4(c * (0.05 + lamp * vec3(1.0, 0.72, 0.45)) * edge, 1.0);
        }`,
    });
    this.mesh = new Mesh(g, this.mat);
    this.mesh.position.copy(position);
    this.mesh.rotation.y = rotation;
  }

  set age(v: number) {
    this.mat.uniforms.uAge!.value = v;
  }
  get age(): number {
    return this.mat.uniforms.uAge!.value as number;
  }
  /** Follow the lamp's brightness. */
  set light(v: number) {
    this.mat.uniforms.uLight!.value = v;
  }
}

/** The reed pen (calamus). */
export function reedPen(): Mesh {
  const g = new CylinderGeometry(0.004, 0.0055, 0.2, 8);
  g.rotateZ(Math.PI / 2);
  const m = new Mesh(g, new MeshStandardMaterial({ color: '#8a6d42', roughness: 0.6 }));
  return m;
}
