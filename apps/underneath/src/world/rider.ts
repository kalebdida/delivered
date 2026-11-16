// The rider of the heavens: a moving storm of white-gold light tearing down through the clouds.
// No face, no body: a blazing core, a spiralling comet of light, and a wake.
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, PlaneGeometry, Points, ShaderMaterial } from 'three';
import { seededRandom } from '@delivered/core';

export class Rider {
  readonly group = new Group();
  readonly uniforms = { uTime: { value: 0 }, uLevel: { value: 0 }, uLen: { value: 140 }, uPixel: { value: 1 }, uColor: { value: new Color('#fff4da') }, uGold: { value: new Color('#f5c76b') } };
  private readonly trail: Points;
  private readonly core: Mesh;
  private readonly streaks = new Group();
  private readonly streakMat: ShaderMaterial;

  constructor(count: number) {
    const rng = seededRandom('rider');
    const data = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) data.set([Math.pow(rng(), 1.6), rng() * Math.PI * 2, rng(), rng()], i * 4);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aData', new BufferAttribute(data, 4));
    const mat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aData; uniform float uTime; uniform float uLen; uniform float uPixel;
        varying float vA; varying float vT;
        void main(){
          float t = aData.x; float ang = aData.y + uTime * (2.0 + aData.z * 3.0) - t * 9.0;
          float r = (1.2 + t * 16.0) * (0.4 + aData.w * 0.6);
          float flow = fract(t + uTime * 0.35 * (0.5 + aData.z));
          float y = flow * uLen;
          vec3 p = vec3(cos(ang) * r * flow, y, sin(ang) * r * flow);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((2.0 + aData.w * 5.0) * (1.0 - flow * 0.6) * uPixel * 160.0 / -mv.z, 1.0, 26.0);
          vA = (1.0 - flow) * (0.5 + aData.z * 0.5); vT = flow;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform vec3 uGold; uniform float uLevel; varying float vA; varying float vT;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d); a *= a * vA * uLevel;
          gl_FragColor = vec4(mix(uColor * 2.6, uGold * 1.6, vT) * a, a);
        }`,
    });
    this.trail = new Points(geo, mat);
    this.trail.frustumCulled = false;
    const coreMat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0); mv.xy += position.xy * vec2(44.0, 80.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uLevel; uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * vec2(1.0, 2.0);
          float d = length(p);
          float a = (exp(-d * 9.0) * 3.0 + exp(-d * 3.0) * 0.6) * smoothstep(1.0, 0.55, d) * uLevel * (0.9 + 0.1 * sin(uTime * 13.0));
          gl_FragColor = vec4(uColor * a * 2.2, min(1.0, a));
        }`,
    });
    this.core = new Mesh(new PlaneGeometry(1, 1), coreMat);
    this.core.frustumCulled = false;
    // Long streaks of light fanned around the line of flight: the comet's structure and its wake.
    this.streakMat = new ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uLevel; uniform float uTime; uniform vec3 uColor; uniform vec3 uGold; varying vec2 vUv;
        void main(){
          float x = abs(vUv.x - 0.5) * 2.0;
          float along = vUv.y;
          float body = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.03, along);
          float edge = exp(-x * x * 9.0);
          float pulse = 0.75 + 0.25 * sin(along * 30.0 - uTime * 14.0);
          float a = body * edge * pulse * uLevel * 0.55;
          gl_FragColor = vec4(mix(uColor * 2.2, uGold * 1.4, along) * a, a);
        }`,
    });
    const rng2 = seededRandom('streaks');
    for (let i = 0; i < 7; i++) {
      const len = 160 + rng2() * 120;
      const geo = new PlaneGeometry(10 + rng2() * 14, len);
      geo.translate(0, len / 2, 0);
      const m = new Mesh(geo, this.streakMat);
      m.rotation.y = (i / 7) * Math.PI;
      m.rotation.z = (rng2() - 0.5) * 0.12;
      m.frustumCulled = false;
      this.streaks.add(m);
    }
    this.group.add(this.streaks, this.trail, this.core);
  }

  set level(v: number) {
    this.uniforms.uLevel.value = v;
    this.group.visible = v > 0.001;
  }
  get level(): number {
    return this.uniforms.uLevel.value;
  }

  update(dt: number, pixelRatio: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uPixel.value = pixelRatio;
    this.streaks.rotation.y += dt * 0.8;
  }

  dispose(): void {
    this.trail.geometry.dispose();
    (this.trail.material as ShaderMaterial).dispose();
    this.core.geometry.dispose();
    (this.core.material as ShaderMaterial).dispose();
    this.streaks.children.forEach((m) => (m as Mesh).geometry.dispose());
    this.streakMat.dispose();
    this.group.removeFromParent();
  }
}
