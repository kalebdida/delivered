// CH6 · κέρδος · THE SAME LIGHT (finale).
//
// The camera rises above Philippi and the sea until the whole journey is visible: the cell in
// Rome, the letter's road, the courtyard. Two lines of light appear: the path of LIVING (the
// letter's road through Philippi, onward) and the sealed path of DEPARTING (straight up from the
// cell). Both rise, curve, and meet in the same point of Light high above. Christ is the Light:
// no figure, no face. Then Philippians 1:21, word by word, and one line of our own.
import { AdditiveBlending, CatmullRomCurve3, Group, Mesh, PlaneGeometry, ShaderMaterial, TubeGeometry, Vector3 } from 'three';
import { clamp, easing, getUIRoot, h, smoothstep, verse } from '@delivered/core';
import { MapWorld, PHILIPPI, ROME, ROUTE } from '../world/map';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

const LINE_FRAG = /* glsl */ `
uniform float uDraw, uTime; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float head = smoothstep(uDraw, uDraw - 0.02, vUv.x);
  float pulse = 0.75 + 0.25 * sin(vUv.x * 60.0 - uTime * 3.0);
  float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
  gl_FragColor = vec4(uColor * head * pulse * (0.4 + edge * 1.2) * 1.8, 1.0);
}`;

export class Light extends GChapter {
  readonly id = 'light';
  override keyMomentAt = 16;
  override transitionIn = 'light' as const;

  private map!: MapWorld;
  private lines: ShaderMaterial[] = [];
  private orb!: Mesh;
  private orbMat!: ShaderMaterial;
  private el: HTMLElement | null = null;
  private words: HTMLElement[] = [];
  private meet = new Vector3();

  enter(ctx: GainCtx): void {
    this.begin(ctx);
    const w = ctx.world;
    w.inCell = false;
    this.map = new MapWorld();
    this.root.add(this.map.group);
    ctx.engine.exposure = 1.15;
    ctx.input.enabled = false;
    ctx.postfx.fadeTo('white', 0, 2.4);

    // Where the two paths meet: high above the middle of the journey.
    this.meet.copy(ROME).lerp(PHILIPPI, 0.5).add(new Vector3(0, 9, -2));
    const living = new CatmullRomCurve3([
      ...ROUTE.getSpacedPoints(24).map((p) => p.clone().setY(Math.max(0.35, p.y * 0.6))),
      PHILIPPI.clone().add(new Vector3(1.2, 1.5, -0.6)),
      PHILIPPI.clone().lerp(this.meet, 0.5).add(new Vector3(2.5, 0, 0)),
      this.meet.clone(),
    ]);
    const departing = new CatmullRomCurve3([ROME.clone().setY(0.35), ROME.clone().add(new Vector3(0.2, 3.5, -0.4)), ROME.clone().lerp(this.meet, 0.55).add(new Vector3(-2.5, 2, -1)), this.meet.clone()]);
    const group = new Group();
    for (const [curve, color, r] of [[living, [1.0, 0.82, 0.5], 0.06], [departing, [1.0, 0.95, 0.88], 0.05]] as const) {
      const mat = new ShaderMaterial({
        uniforms: { uDraw: { value: 0 }, uTime: { value: 0 }, uColor: { value: new Vector3(...color) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: LINE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const tube = new Mesh(new TubeGeometry(curve, 240, r, 8, false), mat);
      tube.renderOrder = 20;
      group.add(tube);
      this.lines.push(mat);
    }
    // The Light: a radiant point, rays and a wide soft glow. No form, no face.
    this.orbMat = new ShaderMaterial({
      uniforms: { uOn: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); gl_Position = projectionMatrix * c; }',
      fragmentShader: `uniform float uOn, uTime; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float d = length(p); float a = atan(p.y, p.x);
          float rays = pow(0.5 + 0.5 * cos(a * 12.0 + uTime * 0.2), 8.0) * exp(-d * 5.0) * 0.6;
          float c = exp(-d * 40.0) * 4.0 + exp(-d * 12.0) * 1.2 + exp(-d * 4.0) * 0.35 + rays;
          c *= smoothstep(0.5, 0.32, d);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * c * uOn, 1.0); }`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.orb = new Mesh(new PlaneGeometry(1, 1), this.orbMat);
    this.orb.position.copy(this.meet);
    this.orb.scale.setScalar(9);
    this.orb.renderOrder = 30;
    group.add(this.orb);
    this.root.add(group);

    // Rise from the courtyard in Philippi until the whole journey is in view.
    const start = PHILIPPI.clone().add(new Vector3(0.6, 0.35, 1.2));
    ctx.rig.snapTo(start, PHILIPPI.clone().add(new Vector3(0, 0.3, 0)));
    ctx.rig.setFov(50);
    ctx.rig.playPath([start, PHILIPPI.clone().add(new Vector3(1.5, 3, 5)), this.meet.clone().add(new Vector3(4, -2, 22)), this.meet.clone().add(new Vector3(0, -1.5, 30))], {
      duration: 14,
      lookAt: [PHILIPPI.clone(), PHILIPPI.clone().lerp(ROME, 0.3), this.meet.clone().add(new Vector3(0, -4, 0)), this.meet.clone().add(new Vector3(0, -3.5, 0))],
      fov: 52,
    });
    this.card({ word: 'κέρδος', lang: 'grc', translit: 'kerdos', english: 'gain', ref: 'Philippians 1:21', number: 6 });
    this.own(ctx.audio.drone(146.8, 'choir', { level: 0.16 }));
    this.at(9.5, () => ctx.audio.chord([146.8, 220, 293.7, 370, 440, 587.3], { level: 0.24, duration: 10, timbre: 'choir' }));

    // Philippians 1:21, word by word; then our one line.
    this.at(14.5, () => {
      const p = h('p', { class: 'dl-verse', lang: 'en' });
      for (const word of verse('Philippians 1:21').split(' ')) {
        const s = h('span', { class: 'gn-word' }, word);
        this.words.push(s);
        p.append(s, ' ');
      }
      const line = h('p', { class: 'dl-body gn-final__line' }, ctx.t('gain.finale'));
      this.el = h('div', { class: 'gn-final dl-scrim', 'aria-live': 'polite' }, p, line);
      getUIRoot().appendChild(this.el);
    });
    this.at(28, () => this.el?.classList.add('is-out'));
    this.at(29.5, () => this.complete());
    this.own(() => {
      this.el?.remove();
      this.el = null;
      this.words = [];
    });
  }

  update(dt: number): void {
    this.runEvents();
    this.map.update(dt);
    const t = this.time;
    // The two lines draw themselves up toward the same point, then the Light opens.
    this.lines[0]!.uniforms.uDraw!.value = easing.inOutCubic(clamp((t - 2) / 9)) * 1.03;
    this.lines[1]!.uniforms.uDraw!.value = easing.inOutCubic(clamp((t - 4) / 7)) * 1.03;
    for (const m of this.lines) m.uniforms.uTime!.value = t;
    this.orbMat.uniforms.uOn!.value = smoothstep(10.2, 13, t);
    this.orbMat.uniforms.uTime!.value = t;
    this.ctx.postfx.params.bloom = 0.55 + smoothstep(10, 13, t) * 0.4;
    if (this.words.length) {
      const n = Math.floor((t - 14.8) / 0.42);
      this.words.forEach((w, i) => w.classList.toggle('is-in', i < n));
      if (n > this.words.length + 2) this.el?.querySelector('.gn-final__line')?.classList.add('is-in');
    }
  }

  override exit(): void {
    const { ctx } = this;
    ctx.postfx.params.bloom = 0.55;
    ctx.input.enabled = true;
    ctx.engine.exposure = 1.25;
    this.map.dispose();
    this.lines = [];
  }
}
