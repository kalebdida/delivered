import '@delivered/core/styles.css';
import './hub.css';
import './strings';
import {
  BackSide, Color, Mesh, PlaneGeometry, Raycaster, ShaderMaterial, SphereGeometry, Vector2, Vector3,
} from 'three';
import {
  Chapter, Dust, allComplete, button, createApp, formatRef, getLanguage, glsl, h, haptic, isComplete, markSvg, onLanguageChange,
  openDialog, passage, prefersReducedMotion, registerScripture, setArrivalColor, t, type CoreContext, type SoundHandle,
} from '@delivered/core';
import { ARCH, PORTALS, Portal } from './portals';

// The hub's intro line is a quotation from inside Romans 7:24, registered so it is verified.
registerScripture([
  { ref: 'Romans 7:24', lang: 'en', translation: 'WEB', text: 'Who will deliver me?', partial: true, verified: true, source: 'https://ebible.org/Scriptures/eng-web_usfm.zip' },
]);
const INTRO = { en: 'Who will deliver me?', am: 'ማን ያድነኛል?' } as const;

const AURORA_FRAG = /* glsl */ `
uniform float uTime; varying vec3 vDir;
${glsl.hash}
${glsl.simplex3D}
${glsl.dither}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // Slow curtains of light far behind everything.
  float n1 = snoise(vec3(d.x * 1.6, h * 0.9 - uTime * 0.012, uTime * 0.018));
  float n2 = snoise(vec3(d.x * 3.4 + 4.0, h * 2.2, uTime * 0.03 + 7.0));
  float band = smoothstep(-0.25, 0.75, n1 + 0.35 * n2);
  float mask = smoothstep(-0.15, 0.3, h) * smoothstep(0.95, 0.35, h) * smoothstep(0.2, -0.9, d.z);
  vec3 violet = vec3(0.10, 0.09, 0.26), teal = vec3(0.03, 0.14, 0.17), gold = vec3(0.30, 0.20, 0.07);
  vec3 c = mix(violet, teal, smoothstep(-0.6, 0.6, n2));
  c = mix(c, gold, smoothstep(0.35, 1.0, n1) * 0.55);
  vec3 base = mix(vec3(0.0018, 0.0018, 0.0035), vec3(0.006, 0.006, 0.014), smoothstep(-0.4, 0.5, h));
  // Sparse, faint stars.
  vec3 p = d * 180.0; float r = hash13(floor(p));
  float star = step(0.9975, r) * smoothstep(0.35, 0.0, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (0.6 + r * 2.0) + r * 40.0));
  gl_FragColor = vec4(base + c * band * mask * 1.5 + vec3(0.9, 0.88, 0.8) * star * 0.5 + dither(gl_FragCoord.xy), 1.0);
}`;

class Hub extends Chapter {
  readonly id = 'hub';
  override keyMomentAt = 4.5;
  private portals: Portal[] = [];
  private dust!: Dust;
  private dustFar!: Dust;
  private aurora!: ShaderMaterial;
  private ray = new Raycaster();
  private pointer = new Vector2(0, 0);
  private ndc = new Vector2(9, 9);
  private active: Portal | null = null;
  private preview: SoundHandle[] = [];
  private leaving = false;
  private labels: HTMLElement[] = [];
  private frame = 0;
  private readonly _v = new Vector3();
  private dom!: HTMLElement;

  enter(ctx: CoreContext): void {
    const { engine, rig, postfx } = ctx;
    postfx.setPreset('cinematic');
    postfx.params.bloom = 0.75;
    postfx.params.bloomThreshold = 0.9;
    postfx.params.vignette = 0.62;
    rig.parallax = 1.6;

    this.aurora = new ShaderMaterial({
      side: BackSide, depthWrite: false, uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: AURORA_FRAG,
    });
    const sky = new Mesh(new SphereGeometry(500, 32, 20), this.aurora);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.root.add(sky);

    // A faint reflection plane grounds the portals without a hard horizon.
    const floor = new Mesh(
      new PlaneGeometry(60, 30),
      new ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uColor: { value: new Color('#F5C76B') } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 uColor; varying vec2 vUv; ${glsl.dither}
          void main(){ vec2 q = (vUv - vec2(0.5, 0.62)) * vec2(1.0, 2.6); float a = smoothstep(0.34, 0.0, length(q)); a *= a * 0.085;
          gl_FragColor = vec4(uColor * a + dither(gl_FragCoord.xy) * a, a); }`,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.02, 2);
    this.root.add(floor);

    const n = ctx.quality.budget.maxParticles;
    this.dust = this.own(new Dust({ count: Math.min(700, n / 8), bounds: [9, 4.5, 6], color: '#F5C76B', size: 3.6, opacity: 0.75, speed: 0.8 }));
    this.dust.points.position.set(0, 2.4, 4);
    this.dustFar = this.own(new Dust({ count: Math.min(900, n / 6), bounds: [22, 9, 10], color: '#FFE9B0', size: 2, opacity: 0.32, speed: 0.5, seed: 'far' }));
    this.dustFar.points.position.set(0, 4, -12);
    this.root.add(this.dust.points, this.dustFar.points);

    PORTALS.forEach((def, i) => {
      const p = new Portal(def, i, ctx.quality.tier);
      p.setSealed(isComplete(def.id));
      this.portals.push(p);
      this.root.add(p.group);
      this.own(p);
    });
    this.layout();
    this.own(engine.onResize(() => this.layout()));

    this.buildDom(ctx);
    const canvas = engine.renderer.domElement;
    const move = (e: PointerEvent) => {
      this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      this.ndc.set(this.pointer.x, -this.pointer.y);
      if (e.pointerType === 'mouse') this.setActive(this.pick());
    };
    const click = (e: PointerEvent) => {
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      const hit = this.pick();
      // Touch: the first tap opens a portal, the second enters it.
      if (e.pointerType !== 'mouse' && hit !== this.active) {
        this.setActive(hit);
        if (hit) haptic(10);
        return;
      }
      if (hit) this.enterPortal(hit);
      else this.setActive(null);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', click);
    this.own(() => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', click);
      this.dom.remove();
      this.stopPreview();
    });
  }

  /** Place portals and camera for the current aspect ratio (portrait first). */
  private layout(): void {
    const { engine, rig } = this.ctx;
    const aspect = engine.size.width / engine.size.height;
    const portrait = aspect < 0.9;
    const spacing = portrait ? 1.9 : Math.min(3.1, 2.3 + aspect * 0.35);
    this.portals.forEach((p, i) => p.home.set((i - 1) * spacing, 0, i === 1 ? 0 : 0.5));
    const fov = 36;
    const halfW = spacing + ARCH.width / 2 + (portrait ? 0.3 : 1.6);
    const tan = Math.tan((fov * Math.PI) / 360);
    // Portals take about a third of the height on desktop and sit between the wordmark and
    // their labels, clear of the footer.
    const dist = Math.max(halfW / (tan * aspect), ARCH.height / 0.34 / (2 * tan));
    const lookY = ARCH.height * 0.5 + 2 * dist * tan * (portrait ? 0.07 : 0.035);
    rig.setFov(fov);
    if (!this.leaving) rig.snapTo(new Vector3(0, lookY - 0.1, dist), new Vector3(0, lookY, 0));
  }

  private pick(): Portal | null {
    this.ray.setFromCamera(this.ndc, this.ctx.engine.camera);
    for (const p of this.portals) if (this.ray.intersectObject(p.windowMesh).length) return p;
    return null;
  }

  private setActive(p: Portal | null): void {
    if (this.leaving || p === this.active) return;
    this.active = p;
    this.portals.forEach((x) => (x.hovered = x === p));
    this.labels.forEach((l, i) => l.classList.toggle('is-active', this.portals[i] === p));
    this.ctx.ui.cursor.setLabel(p ? t('hub.enter') : null);
    this.stopPreview();
    if (p) this.startPreview(p);
  }

  /** A soft audio preview of the room behind the hovered portal. */
  private startPreview(p: Portal): void {
    const a = this.ctx.audio;
    if (p.def.id === 'wretched') this.preview = [a.drone(55, 'dark', { level: 0.32 }), a.wind(0.35, { level: 0.22 })];
    else if (p.def.id === 'underneath') this.preview = [a.wind(0.55, { level: 0.3 }), a.drone(146.83, 'choir', { level: 0.2 })];
    else {
      this.preview = [a.drone(73.42, 'hollow', { level: 0.3 }), a.fire({ level: 0.12, crackle: 0.5 })];
      a.pluck(293.66, { level: 0.25, when: 0.5 });
      a.pluck(440, { level: 0.2, when: 1.1 });
    }
  }
  private stopPreview(): void {
    this.preview.forEach((s) => s.stop(1.2));
    this.preview = [];
  }

  /** Fly through the portal; its light fills the screen and the room loads behind that light. */
  private enterPortal(p: Portal): void {
    if (this.leaving) return;
    this.leaving = true;
    const { rig, postfx, audio, ui } = this.ctx;
    ui.cursor.setLabel(null);
    this.dom.classList.add('is-leaving');
    haptic(18);
    audio.ui.confirm();
    audio.chord([146.83, 220, 293.66, 369.99], { duration: 3, level: 0.35 });
    const target = p.group.position.clone();
    const centre = new Vector3(target.x, ARCH.height * 0.48, target.z);
    const reduced = prefersReducedMotion();
    setArrivalColor(p.def.light);
    rig.parallax = 0;
    rig.playPath([new Vector3(target.x * 0.9, centre.y + 0.1, target.z + 4.2), new Vector3(target.x, centre.y, target.z + 0.4)], {
      duration: reduced ? 0.9 : 2.1, lookAt: new Vector3(target.x, centre.y, target.z - 6), ease: 'power2.in', fov: 52,
    });
    p.hovered = true;
    setTimeout(() => postfx.fadeTo(p.def.light, 1, reduced ? 0.7 : 1.05), reduced ? 100 : 950);
    setTimeout(() => {
      this.stopPreview();
      window.location.href = `./${p.def.id}/`;
    }, reduced ? 950 : 2150);
    // If the visitor comes back with the back button, the hub must be alive again.
    window.addEventListener('pageshow', (e) => e.persisted && window.location.reload(), { once: true });
  }

  private buildDom(ctx: CoreContext): void {
    const dom = (this.dom = h('div', { class: 'hub' }));
    document.body.appendChild(dom);
    const render = () => {
      const lang = getLanguage();
      const letters = [...'DELIVERED'].map((ch, i) => h('span', { style: `--i:${i}` }, ch));
      const wordmark = h('h1', { class: 'hub__wordmark', 'aria-label': 'Delivered' }, ...letters);
      const mark = h('div', { class: 'hub__mark dl-rise', style: '--i:0', html: markSvg(26) });
      const intro = h('p', { class: 'hub__intro dl-verse dl-rise', style: '--i:14', lang }, INTRO[lang]);
      const ref = h('div', { class: 'dl-ref dl-rise', style: '--i:17' }, formatRef('Romans 7:24', lang));
      const head = h('header', { class: 'hub__head' }, mark, wordmark, intro, ref);
      if (allComplete()) {
        head.append(
          h('p', { class: 'hub__done dl-rise', style: '--i:22' }, t('hub.delivered')),
          h('p', { class: 'hub__done-verse dl-rise', style: '--i:24', lang }, passage('Romans 8:1', lang).split(',')[0] + '.'),
          h('div', { class: 'dl-ref dl-rise', style: '--i:26' }, formatRef('Romans 8:1', lang)),
        );
      }
      // One real link per portal: keyboard and screen-reader users get the same three doors.
      const nav = h('nav', { class: 'hub__portals', 'aria-label': 'Rooms' });
      this.labels = PORTALS.map((def, i) => {
        const sealed = isComplete(def.id);
        const a = h(
          'a',
          { class: 'hub__label', href: `./${def.id}/`, 'data-cursor': t('hub.enter') },
          h('span', { class: 'hub__label-title' }, def.title),
          h('span', { class: 'hub__label-theme' }, t(`hub.room.${def.id}`)),
          h('span', { class: 'dl-ref' }, formatRef(def.ref === 'Romans 7:24' ? 'Romans 7:15' : def.ref, lang)),
          sealed ? h('span', { class: 'dl-sr-only' }, t('hub.sealed')) : null,
        );
        a.addEventListener('focus', () => this.setActive(this.portals[i]!));
        a.addEventListener('blur', () => this.setActive(null));
        a.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.setActive(this.portals[i]!));
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.enterPortal(this.portals[i]!);
        });
        nav.appendChild(a);
        return a;
      });
      const credits = () =>
        openDialog(t('hub.credits.title'), [
          h('p', { class: 'dl-body' }, t('core.credit.made')),
          h('p', { class: 'dl-body' }, t('core.credit.web')),
          h('p', { class: 'dl-body' }, t('core.credit.amharic')),
          h('p', { class: 'dl-body' }, t('hub.credits.fonts')),
          h('p', { class: 'dl-body' }, t('hub.credits.code')),
        ], { wide: true, audio: ctx.audio });
      const about = () =>
        openDialog(t('hub.about.title'), [
          h('p', { class: 'dl-body' }, t('hub.about.p1')),
          h('p', { class: 'dl-body' }, t('hub.about.p2')),
          h('p', { class: 'dl-body' }, t('hub.about.p3')),
          h('p', { class: 'dl-body' }, t('core.support') + ' ', h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener noreferrer' }, t('hub.support.link'))),
        ], { wide: true, audio: ctx.audio });
      const footer = h(
        'footer',
        { class: 'hub__footer dl-rise', style: '--i:30' },
        h('div', { class: 'hub__footer-row' },
          button({ label: t('hub.about'), variant: 'text', onClick: about }),
          button({ label: t('hub.credits'), variant: 'text', onClick: credits }),
          h('span', { class: 'hub__made' }, t('core.credit.made')),
        ),
        h('p', { class: 'hub__fine' }, t('core.credit.web') + ' · ' + t('core.credit.amharic')),
        h('p', { class: 'hub__fine' }, t('core.support') + ' ', h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener noreferrer' }, t('hub.support.link'))),
      );
      dom.replaceChildren(head, nav, footer);
      requestAnimationFrame(() => requestAnimationFrame(() => dom.classList.add('is-in')));
    };
    render();
    this.own(onLanguageChange(render));
    if (new URLSearchParams(location.search).has('og')) document.documentElement.classList.add('is-og');
  }

  update(dt: number): void {
    const { engine } = this.ctx;
    const reduced = prefersReducedMotion();
    this.aurora.uniforms.uTime!.value += dt;
    this.dust.update(dt);
    this.dustFar.update(dt);
    this.frame++;
    this.portals.forEach((p, i) => {
      p.update(this.time, dt, reduced);
      // The hovered portal renders every frame; the others alternate to halve the cost.
      if (p.hovered || (this.frame + i) % 2 === 0) p.render(engine.renderer, this.time, p.hovered ? dt : dt * 2, this.pointer);
      // Pin each label under its portal.
      this._v.set(p.group.position.x, -0.2, p.group.position.z).project(engine.camera);
      const el = this.labels[i];
      if (el) el.style.transform = `translate(-50%, 0) translate(${((this._v.x + 1) / 2) * engine.size.width}px, ${((1 - this._v.y) / 2) * engine.size.height}px)`;
    });
  }
}

await createApp({ appId: 'hub', title: 'DELIVERED', chapters: [new Hub()], begin: false, home: null, virtualControls: false, reverb: 'stoneHall', transition: 'dissolve' });
