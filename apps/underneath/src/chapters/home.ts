// CH5 וּמִתַּחַת, underneath (the catch and the reveal) · CH6 מְעֹנָה, dwelling place
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, PointLight, Points, ShaderMaterial, SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { createCloth, damp, formatRef, partial, smoothstep, type HeartbeatHandle, type Verlet } from '@delivered/core';
import { UChapter, WordLine } from './base';
import { getFall } from './fall';
import { COLUMN } from '../world/layers';
import { islandDetail, islandTop, islandUnderside } from '../world/islands';
import type { UnderCtx } from '../world/world';

const glowMat = (color: string, strength: number) =>
  new ShaderMaterial({
    uniforms: { uC: { value: new Color(color).multiplyScalar(strength) }, uA: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uC; uniform float uA; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(1.0 - abs(dot(vN, vV)), 1.5); float a = (0.25 + edge) * uA * smoothstep(0.0, 0.15, vY) * smoothstep(1.0, 0.6, vY); gl_FragColor = vec4(uC * a, a); }`,
  });

export class Underneath extends UChapter {
  readonly id = 'underneath';
  override keyMomentAt = 9;
  override transitionIn = 'cut' as const;
  private y0 = 200;
  private v0 = 25;
  private x0 = 0;
  private z0 = 0;
  private real = 0;
  private line: WordLine | null = null;
  private heart: HeartbeatHandle | null = null;
  private ghost: Mesh | null = null;
  private ghostCount = 0;
  private beam: Mesh | null = null;
  private readonly camFrom = new Vector3();
  private readonly cradle = new Vector3();

  enter(ctx: UnderCtx): void {
    this.begin(ctx);
    const w = this.w;
    const fall = getFall(ctx);
    this.y0 = fall ? fall.y : 200;
    this.v0 = fall ? fall.speed : 25;
    this.x0 = fall ? fall.x : 0;
    this.z0 = fall ? fall.z : 0;
    this.real = 0;
    ctx.input.enabled = false;
    w.camMode = 'free';
    w.platforms = [];
    w.arms.group.visible = true;
    w.arms.group.position.set(0, 0, -70);
    w.arms.uniforms.uClose.value = 0;
    w.arms.uniforms.uRise.value = 0;
    w.arms.uniforms.uLevel.value = 1;
    w.arms.cradleWorld(this.cradle);
    this.cradle.y += 1.5;
    w.visitor.group.position.set(this.x0, this.y0, this.z0);
    w.visitor.settle();
    this.camFrom.set(this.x0, this.y0 + 6.5, this.z0 + 4.2);
    w.free(this.camFrom, new Vector3(this.x0, this.y0 - 26, this.z0 - 3));
    if (!fall) w.path.push(...Array.from({ length: 40 }, (_, i) => new Vector3(Math.sin(i * 0.3) * 8, COLUMN.fallStart - (i / 39) * (COLUMN.fallStart - 200), Math.cos(i * 0.2) * 6)));

    this.card({ word: 'וּמִתַּחַת', lang: 'he', translit: 'umitachat', english: 'and underneath', ref: 'Deuteronomy 33:27', number: 5 });
    const a = ctx.audio;
    this.heart = this.own(a.heartbeat(96, { level: 0.7 }));
    const wind = this.own(a.wind(0.5, { level: 0.5 }));
    wind.stop(5);
    this.at(4.5, () => {
      a.chord([130.81, 196, 261.63, 329.63, 392], { duration: 10, level: 0.32, timbre: 'warm' });
      a.chord([523.25, 659.25], { duration: 8, level: 0.08, timbre: 'glass', when: 0.6 });
    });
    this.at(7.2, () => {
      this.line = new WordLine(partial('Deuteronomy 33:27', 1), { huge: true });
      a.duck(0.4, 6);
    });
    this.at(11.2, () => this.line?.sub(formatRef('Deuteronomy 33:27')));
    this.at(15, () => {
      this.line?.remove();
      this.line = null;
      this.startReveal();
    });
    this.at(30, () => this.complete());
    this.own(() => {
      this.line?.remove();
      ctx.loop.timeScale = 1;
      w.sky.lookAltitude = null;
      w.sky.fogScale = 1;
      w.sky.wispScale = 1;
      w.arms.uniforms.uLevel.value = 1;
      w.arms.uniforms.uGlow.value = 0;
      this.ghost?.geometry.dispose();
      (this.ghost?.material as ShaderMaterial | undefined)?.dispose();
      this.beam?.geometry.dispose();
      (this.beam?.material as ShaderMaterial | undefined)?.dispose();
    });
  }

  private startReveal(): void {
    const w = this.w;
    const pts = [...w.path, this.cradle.clone()].filter((p, i, all) => i === 0 || p.distanceToSquared(all[i - 1]!) > 1);
    const curve = new CatmullRomCurve3(pts);
    const segs = Math.min(600, pts.length * 3);
    const geo = new TubeGeometry(curve, segs, 2.4, 6, false);
    this.ghostCount = geo.index!.count;
    geo.setDrawRange(0, 0);
    this.ghost = new Mesh(
      geo,
      new ShaderMaterial({
        uniforms: { uHead: { value: 0 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `varying float vT; void main(){ vT = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uHead; varying float vT; void main(){ float a = 0.3 + 0.7 * smoothstep(uHead - 0.2, uHead, vT); gl_FragColor = vec4(vec3(1.0, 0.82, 0.48) * 1.8 * a, a); }`,
      }),
    );
    this.ghost.renderOrder = 20;
    this.ghost.frustumCulled = false;
    this.root.add(this.ghost);
    // A faint column of warm light rising from the arms: they were beneath every layer.
    this.beam = new Mesh(new CylinderGeometry(26, 60, 2500, 32, 1, true), glowMat('#ffd79a', 0.5));
    this.beam.position.set(this.cradle.x, 1250, this.cradle.z);
    (this.beam.material as ShaderMaterial).uniforms.uA!.value = 0;
    this.root.add(this.beam);
  }

  update(dt: number): void {
    const { ctx } = this;
    const w = this.w;
    const real = ctx.loop.timeScale > 0 ? dt / ctx.loop.timeScale : dt;
    this.real += real;
    const t = this.real;
    this.time = t; // events run on real time here
    this.runEvents();

    // Time eases down to 0.15, then back up for the reveal.
    ctx.loop.timeScale = t < 15 ? damp(ctx.loop.timeScale, 0.15, 0.9, real) : damp(ctx.loop.timeScale, 1, 1.2, real);

    // The long soft curve: matching the fall speed, easing to rest in the cradle.
    const T = 7.5;
    const span = Math.max(1, this.y0 - this.cradle.y);
    const p = Math.max(1, (this.v0 * T) / span);
    const k = Math.min(1, t / T);
    const f = Math.pow(1 - k, p);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * k);
    const v = w.visitor;
    v.group.position.set(this.x0 + (this.cradle.x - this.x0) * e, this.cradle.y + span * f, this.z0 + (this.cradle.z - this.z0) * e);
    v.fallPose = 1 - smoothstep(3, 9, t) * 0.55;
    v.posture = -0.6;
    v.body.rotation.z = damp(v.body.rotation.z, 0, 2, real);
    v.glowLevel = 1.4 + smoothstep(4, 9, t);
    this.heart?.setBpm(Math.round(96 - smoothstep(2, 12, t) * 40));
    if (t > 13) this.heart?.setLevel(Math.max(0, 0.7 - (t - 13) * 0.2), 0.3);

    const arms = w.arms.uniforms;
    arms.uRise.value = smoothstep(0, 6, t);
    arms.uClose.value = smoothstep(3, 9, t);
    arms.uGlow.value = smoothstep(2, 8, t) * (1 - smoothstep(18, 26, t) * 0.5);
    w.sky.fogScale = 1 - smoothstep(0, 4, t) * 0.8;
    if (t < 15) w.sky.wispScale = 1 - smoothstep(1, 6, t);

    // Camera: from the fall view down to a low three-quarter view of the cradle, then the reveal.
    const vp = v.group.position;
    if (t < 15) {
      const c = smoothstep(0.5, 8, t);
      const orbit = t * 0.035;
      const close = new Vector3(vp.x + Math.sin(0.25 + orbit) * 72, vp.y + 24, vp.z + Math.cos(0.25 + orbit) * 72);
      const from = new Vector3(vp.x, vp.y + 6.5, vp.z + 4.2);
      w.freePos.copy(from.lerp(close, c));
      w.freeLook.set(vp.x, vp.y - 26 * (1 - c) + 8 * c, vp.z - 3 * (1 - c));
    } else {
      const r = smoothstep(15, 27, t);
      const re = r * r * (3 - 2 * r);
      w.sky.lookAltitude = 150 + re * 0; // keep the warm look of underneath
      w.sky.fogScale = 0.2 * (1 - re);
      w.sky.wispScale = 1 - re;
      arms.uLevel.value = 1 + re * 2.5;
      const far = new Vector3(2100, 1350, 2100);
      const near = new Vector3(vp.x + Math.sin(0.25 + 15 * 0.035) * 72, vp.y + 24, vp.z + Math.cos(0.25 + 15 * 0.035) * 72);
      w.freePos.copy(near.lerp(far, re));
      w.freeLook.set(vp.x, vp.y - 6 + (1150 - vp.y) * re, vp.z);
      if (this.ghost) {
        const g = smoothstep(17, 26, t);
        this.ghost.geometry.setDrawRange(0, Math.floor((g * this.ghostCount) / 3) * 3);
        (this.ghost.material as ShaderMaterial).uniforms.uHead!.value = g;
      }
      if (this.beam) (this.beam.material as ShaderMaterial).uniforms.uA!.value = smoothstep(19, 26, t) * 0.35;
    }
  }
}

// ---------------------------------------------------------------------------------------------

/** A curtain: core Verlet cloth pinned along the top, moving in a soft breeze. */
class Curtain {
  readonly mesh: Mesh;
  readonly cloth: Verlet & { cols: number; rows: number };
  private readonly geo = new BufferGeometry();
  constructor(origin: [number, number, number], width: number, height: number, color: string) {
    const cols = 6;
    const rows = 12;
    this.cloth = createCloth(origin, width, height, cols, rows, { iterations: 5, damping: 0.97 });
    for (let c = 0; c <= cols; c++) this.cloth.pin(c);
    const t0 = Math.random() * 10;
    this.cloth.wind = (x, y, _z, t) => [Math.sin(t * 0.7 + t0) * 0.3, 0, (0.6 + Math.sin(t * 0.9 + x * 2 + y + t0) * 0.6) * 1.2];
    this.geo.setAttribute('position', new BufferAttribute(this.cloth.positions, 3));
    const idx: number[] = [];
    const w = cols + 1;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) idx.push(r * w + c, (r + 1) * w + c, r * w + c + 1, r * w + c + 1, (r + 1) * w + c, (r + 1) * w + c + 1);
    this.geo.setIndex(idx);
    this.geo.computeVertexNormals();
    this.mesh = new Mesh(this.geo, new MeshStandardMaterial({ color, roughness: 0.85, side: DoubleSide, transparent: true, opacity: 0.88, emissive: new Color('#5a3a20'), emissiveIntensity: 0.25 }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }
  update(dt: number): void {
    this.cloth.step(Math.min(dt, 1 / 30));
    (this.geo.attributes.position as BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}

interface Spot {
  name: 'hearth' | 'table' | 'window';
  pos: Vector3;
  done: boolean;
}

export class Dwelling extends UChapter {
  readonly id = 'dwelling';
  override keyMomentAt = 10;
  override transitionIn = 'light' as const;
  private curtains: Curtain[] = [];
  private flame!: Points;
  private fireLight!: PointLight;
  private spots: Spot[] = [];
  private parts: { o: Mesh | Group; delay: number; y: number }[] = [];
  private harp = 3;
  private hinted = false;
  private ending = -1;
  private ringMat!: ShaderMaterial;

  enter(ctx: UnderCtx): void {
    this.begin(ctx, [
      { id: 'primary', label: ctx.t('underneath.jump'), size: 'large', icon: 'up' },
      { id: 'secondary', label: ctx.t('core.controls.action'), size: 'small', icon: 'hand' },
    ]);
    const w = this.w;
    const y = COLUMN.islands;
    const m = w.mats;
    w.arms.group.visible = false;
    w.sky.lookAltitude = 2470;
    const R = 7;
    const base = new Group();
    base.position.set(0, y, 0);
    base.add(islandTop(R, 41, m.grass), islandUnderside(R * 0.95, 41, m.rock), islandDetail(R * 0.4, 42, m));
    this.root.add(base);
    const warm = new MeshStandardMaterial({ color: '#efdcc0', roughness: 0.7, emissive: new Color('#3a2414'), emissiveIntensity: 0.2 });
    const floor = new Mesh(new CylinderGeometry(5.9, 5.9, 0.16, 48), warm);
    floor.position.set(0, y + 0.08, 0);
    floor.receiveShadow = true;
    this.root.add(floor);
    const add = (o: Mesh | Group, delay: number) => {
      this.parts.push({ o, delay, y: o.position.y });
      o.position.y -= 6;
      o.visible = false;
      this.root.add(o);
    };
    // Pillars around, a gap for the doorway at the front (+z).
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.4) continue;
      const p = new Mesh(new CylinderGeometry(0.26, 0.32, 4.4, 14), warm);
      p.position.set(Math.cos(a) * 5.5, y + 2.2, Math.sin(a) * 5.5);
      p.castShadow = true;
      add(p, 0.4 + i * 0.12);
      // Low walls between pillars, except at the window (back).
      if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) > 0.5) {
        const wall = new Mesh(new BoxGeometry(3.2, 1.1, 0.3), warm);
        const b = a + Math.PI / 10;
        wall.position.set(Math.cos(b) * 5.5, y + 0.55, Math.sin(b) * 5.5);
        wall.rotation.y = Math.PI / 2 - b;
        wall.castShadow = wall.receiveShadow = true;
        add(wall, 0.6 + i * 0.12);
      }
    }
    // A ring of light as the roof, and arches crossing above.
    this.ringMat = new ShaderMaterial({
      uniforms: { uC: { value: new Color('#ffe2a8').multiplyScalar(2.4) } },
      vertexShader: `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }`,
    });
    const ring = new Mesh(new TorusGeometry(5.5, 0.07, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 4.5;
    add(ring, 1.8);
    for (let i = 0; i < 3; i++) {
      const arch = new Mesh(new TorusGeometry(5.5, 0.04, 6, 64, Math.PI), this.ringMat);
      arch.position.y = y + 4.5;
      arch.rotation.y = (i / 3) * Math.PI;
      arch.scale.set(1, 0.42, 1);
      add(arch, 2.1 + i * 0.15);
    }
    // Hearth (left), table (right), window (back).
    const hearth = new Group();
    hearth.position.set(-3.2, y, -0.6);
    const stones = new Mesh(new TorusGeometry(0.75, 0.22, 8, 18), m.stone);
    stones.rotation.x = Math.PI / 2;
    stones.position.y = 0.2;
    hearth.add(stones);
    const fpos = new Float32Array(240 * 3);
    const fseed = new Float32Array(240);
    for (let i = 0; i < 240; i++) fseed[i] = Math.random();
    const fgeo = new BufferGeometry();
    fgeo.setAttribute('position', new BufferAttribute(fpos, 3));
    fgeo.setAttribute('aSeed', new BufferAttribute(fseed, 1));
    this.flame = new Points(
      fgeo,
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexShader: `attribute float aSeed; uniform float uTime; varying float vL;
          void main(){ float l = fract(aSeed * 7.3 + uTime * (0.6 + aSeed * 0.6)); vL = l;
            float a = aSeed * 40.0 + uTime * 2.0; float r = (1.0 - l) * 0.35 * fract(aSeed * 3.1);
            vec3 p = vec3(cos(a) * r, 0.2 + l * 1.3, sin(a) * r);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (1.0 - l) * 90.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * (1.0 - vL);
            vec3 c = mix(vec3(1.0, 0.75, 0.35), vec3(1.0, 0.35, 0.1), vL) * 2.6; gl_FragColor = vec4(c * a, a); }`,
      }),
    );
    this.flame.frustumCulled = false;
    hearth.add(this.flame);
    this.fireLight = new PointLight('#ffb070', 6, 9, 1.5);
    this.fireLight.position.set(0, 1, 0);
    hearth.add(this.fireLight);
    add(hearth, 2.6);
    const table = new Group();
    table.position.set(3.1, y, -0.4);
    const top = new Mesh(new BoxGeometry(1.8, 0.1, 1.0), new MeshStandardMaterial({ color: '#9a7458', roughness: 0.7 }));
    top.position.y = 0.85;
    table.add(top);
    for (const [sx, sz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]] as const) {
      const leg = new Mesh(new BoxGeometry(0.09, 0.85, 0.09), top.material);
      leg.position.set(sx, 0.42, sz);
      table.add(leg);
    }
    const loaf = new Mesh(new SphereGeometry(0.2, 12, 8), new MeshStandardMaterial({ color: '#d9a46b', roughness: 0.8 }));
    loaf.scale.set(1.4, 0.7, 1);
    loaf.position.set(-0.3, 0.97, 0);
    const cup = new Mesh(new CylinderGeometry(0.09, 0.07, 0.2, 12), m.gold);
    cup.position.set(0.4, 1.0, 0.1);
    table.add(loaf, cup);
    table.traverse((o) => ((o as Mesh).isMesh ? ((o as Mesh).castShadow = true) : null));
    add(table, 2.9);
    const frame = new Mesh(new BoxGeometry(2.2, 2.6, 0.25), warm);
    frame.position.set(0, y + 2.0, -5.5);
    const hole = new Mesh(new PlaneGeometry(1.6, 2.0), new MeshStandardMaterial({ color: '#ffe9c4', emissive: new Color('#ffd79a'), emissiveIntensity: 1.4 }));
    hole.position.set(0, y + 2.0, -5.36);
    add(frame, 3.1);
    add(hole, 3.2);

    // Curtains in the doorway and at the window.
    this.curtains = [
      new Curtain([-1.75, y + 4.2, 5.35], 1.1, 3.9, '#f2e6d4'),
      new Curtain([0.65, y + 4.2, 5.35], 1.1, 3.9, '#f2e6d4'),
      new Curtain([-0.8, y + 3.3, -5.1], 1.6, 2.4, '#f5d7a8'),
    ];
    for (const c of this.curtains) {
      this.root.add(c.mesh);
      this.own(c);
    }

    this.spots = [
      { name: 'hearth', pos: new Vector3(-3.2, y, -0.6), done: false },
      { name: 'table', pos: new Vector3(3.1, y, -0.4), done: false },
      { name: 'window', pos: new Vector3(0, y, -4.6), done: false },
    ];
    w.platforms = [{ x: 0, z: 0, y, r: R - 0.3 }, { x: 0, z: 9.5, y, r: 0, hx: 1.1, hz: 3.4 }];
    const path = new Mesh(new BoxGeometry(2.2, 0.3, 6.8), m.stone);
    path.position.set(0, y - 0.15, 9.5);
    path.receiveShadow = true;
    this.root.add(path);
    w.camMode = 'ground';
    w.camDistance = 1.15;
    w.yaw = 0.25;
    w.visitor.fallPose = 0;
    w.visitor.lean = 0;
    w.visitor.glowLevel = 1.2;
    w.visitor.body.rotation.z = 0;
    w.visitor.motion.teleport(0, y, 11.5, w.platforms[1]!);
    w.visitor.group.position.copy(w.visitor.motion.pos);
    w.visitor.heading = Math.PI;
    w.visitor.settle();
    w.snapCamera();

    const a = ctx.audio;
    this.own(a.fire({ level: 0.25 }));
    this.own(a.wind(0.08, { level: 0.25 }));
    this.own(a.drone(146.83, 'warm', { level: 0.12 }));
    this.card({ word: 'מְעֹנָה', lang: 'he', translit: "me'onah", english: 'dwelling place, refuge', ref: 'Deuteronomy 33:27', number: 6 });
    this.own(() => {
      w.sky.lookAltitude = null;
      w.camDistance = 1;
      (this.flame.material as ShaderMaterial).dispose();
      this.ringMat.dispose();
      warm.dispose();
    });
  }

  update(dt: number): void {
    const { ctx } = this;
    const { input, ui, audio, t } = ctx;
    const w = this.w;
    this.runEvents();
    this.walk(dt);
    for (const c of this.curtains) c.update(dt);
    (this.flame.material as ShaderMaterial).uniforms.uTime!.value = this.time;
    this.fireLight.intensity = 5 + Math.sin(this.time * 13) * 0.8 + Math.sin(this.time * 7.3) * 0.6;
    // The dwelling rises out of the light.
    for (const p of this.parts) {
      const k = smoothstep(p.delay, p.delay + 1.6, this.time);
      p.o.visible = k > 0;
      p.o.position.y = p.y - (1 - k) * 6;
    }
    this.harp -= dt;
    if (this.harp < 0) {
      this.harp = 2.2 + Math.random() * 2.5;
      const notes = [293.66, 329.63, 369.99, 440, 493.88, 587.33];
      audio.pluck(notes[Math.floor(Math.random() * notes.length)]!, { level: 0.12 });
    }

    const vp = w.visitor.motion.pos;
    const near = this.spots.find((s) => !s.done && Math.hypot(vp.x - s.pos.x, vp.z - s.pos.z) < 2.1);
    if (near && !this.hinted) {
      this.hinted = true;
      ui.whisper.show(t('underneath.interact'), { duration: 4 });
    }
    if (!near) this.hinted = false;
    if (near && input.pressed('secondary')) {
      near.done = true;
      ui.whisper.hide();
      audio.ui.confirm();
      const opts = { position: 'lower' as const, duration: 7 };
      if (near.name === 'hearth') void ui.scripture.show({ ref: 'Deuteronomy 33:27', partial: 0, ...opts });
      else if (near.name === 'table') void ui.scripture.show({ ref: 'Psalm 90:1', ...opts });
      else void ui.scripture.show({ ref: 'John 10:28', ...opts });
      audio.duck(0.4, 6);
      if (this.spots.every((s) => s.done) && this.ending < 0) {
        this.ending = this.time;
        this.at(this.time + 8.5, () => {
          void ui.card.show({ word: 'יְשֻׁרוּן', lang: 'he', translit: 'Yeshurun', english: 'upright one', ref: 'Deuteronomy 33:26', duration: 6 });
        });
        this.at(this.time + 11, () => ui.whisper.show(t('underneath.named'), { duration: 6 }));
        this.at(this.time + 18, () => this.complete());
      }
    }
  }
}
