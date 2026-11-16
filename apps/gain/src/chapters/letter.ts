// CH3 · τὸ ζῆν Χριστός · THE LETTER (Philippians 1 to 4).
//
// The visitor writes: drag the reed pen across the papyrus and gold ink flows. Whatever they
// scribble, the strokes resolve into the real opening words of the letter, ending with 1:21. The
// papyrus rolls itself, rises to the window and flies out as a streak of light, over the roofs of
// Rome, across a moonlit sea, about 1,200 km to a small house in Philippi that fills with light.
import { CanvasTexture, CylinderGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three';
import { announce, clamp, easing, haptic, partial, smoothstep, verse } from '@delivered/core';
import { BEAM_ORIGIN, LAMP, SEAT } from '../world/layout';
import { MapWorld, PHILIPPI, ROUTE, Streak } from '../world/map';
import { House } from '../world/philippi';
import { Pointer } from '../world/pointer';
import { Rome } from '../world/rome';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

type Phase = 'write' | 'hold' | 'roll' | 'rise' | 'rome' | 'sea' | 'philippi' | 'done';

const W = 1024;
const H = 724;
const NEED = 5.5;

export class Letter extends GChapter {
  readonly id = 'letter';
  override keyMomentAt = 8;
  override transitionIn = 'dissolve' as const;

  private phase: Phase = 'write';
  private phaseT = 0;
  private pointer!: Pointer;
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private tex!: CanvasTexture;
  private sheet!: Mesh;
  private scroll!: Mesh;
  private strokes: { a: [number, number]; b: [number, number] }[] = [];
  private last: [number, number] | null = null;
  private length = 0;
  private lines: string[] = [];
  private total = 0;
  private dirty = true;
  private auto = 0;
  private streak: Streak | null = null;
  private rome: Rome | null = null;
  private map: MapWorld | null = null;
  private house: House | null = null;
  private flags = new Set<string>();
  private scrollFrom = new Vector3();

  enter(ctx: GainCtx): void {
    this.begin(ctx);
    const w = ctx.world;
    this.phase = 'write';
    this.phaseT = 0;
    this.strokes = [];
    this.length = 0;
    this.flags.clear();
    w.inCell = true;
    w.chainToWall();
    w.figure.group.position.set(SEAT.x, 0, SEAT.z);
    w.figure.heading = 0;
    w.figure.sit = 1;
    w.figure.kneel = 0;
    w.lamp.target = 1.2;
    w.beam.intensity = 1.1;
    w.papyrus.age = 0;
    w.papyrus.mesh.visible = true;
    w.cut('desk');
    ctx.input.setVirtualButtons([]);
    this.pointer = this.own(new Pointer(ctx.engine.renderer.domElement));

    // The letter's words: its real opening, then the verse at its heart.
    this.lines = [`${partial('Philippians 1:1', 0)},`, verse('Philippians 1:2'), '…', verse('Philippians 1:21')];
    this.total = this.lines.join('').length;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const p = w.papyrus.mesh;
    this.sheet = new Mesh(
      new PlaneGeometry(0.34, 0.24).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    (this.sheet.material as MeshBasicMaterial).color.setRGB(1.25, 1.12, 0.95);
    this.sheet.position.copy(p.position).add(new Vector3(0, 0.012, 0));
    this.sheet.rotation.y = p.rotation.y;
    this.sheet.renderOrder = 20;
    this.root.add(this.sheet);
    this.scroll = new Mesh(new CylinderGeometry(0.024, 0.024, 0.25, 18), new MeshStandardMaterial({ color: '#e2cfa2', roughness: 0.8, emissive: '#ffb25c', emissiveIntensity: 0 }));
    this.scroll.rotation.z = Math.PI / 2;
    this.scroll.visible = false;
    this.root.add(this.scroll);
    void document.fonts?.load('italic 400 44px "Cormorant Garamond"').then(() => (this.dirty = true));

    this.card({ word: 'τὸ ζῆν Χριστός', lang: 'grc', translit: 'to zēn Christos', english: 'to live is Christ', ref: 'Philippians 1:21', number: 3 });
    this.at(4.2, () => ctx.ui.hud.set('bottom-center', ctx.input.device === 'touch' ? ctx.t('gain.letter.hint') : `${ctx.t('gain.letter.hint')} · ${ctx.t('gain.letter.hintKeys')}`));
  }

  private get progress(): number {
    return clamp(this.length / NEED);
  }

  /** Redraw the sheet: the real words, revealed as far as the visitor has written; their own strokes fading. */
  private draw(): void {
    const g = this.g;
    const p = this.progress;
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // The visitor's own strokes: gold over a dark bronze edge, fading as the real words come.
    const fade = 1 - p * 0.92;
    g.beginPath();
    for (const s of this.strokes) {
      g.moveTo(s.a[0] * W, s.a[1] * H);
      g.lineTo(s.b[0] * W, s.b[1] * H);
    }
    g.strokeStyle = `rgba(70, 40, 12, ${0.7 * fade})`;
    g.lineWidth = 11;
    g.stroke();
    g.strokeStyle = `rgba(245, 199, 107, ${0.95 * fade})`;
    g.lineWidth = 6;
    g.stroke();
    g.font = 'italic 500 46px "Cormorant Garamond", Georgia, serif';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(64, 36, 10, 0.85)';
    g.fillStyle = '#f5c76b';
    g.textBaseline = 'alphabetic';
    let left = Math.floor(this.total * easing.outQuad(p));
    let y = 96;
    for (const line of this.lines) {
      const words = line.split(' ');
      let row = '';
      const rows: string[] = [];
      for (const word of words) {
        const test = row ? `${row} ${word}` : word;
        if (g.measureText(test).width > W - 140 && row) {
          rows.push(row);
          row = word;
        } else row = test;
      }
      rows.push(row);
      for (const r of rows) {
        if (left <= 0) break;
        g.strokeText(r.slice(0, left), 70, y);
        g.fillText(r.slice(0, left), 70, y);
        left -= r.length;
        y += 58;
      }
      y += line === '…' ? 0 : 14;
    }
    this.tex.needsUpdate = true;
  }

  private updateWrite(dt: number): void {
    const { ctx } = this;
    const w = ctx.world;
    const cam = ctx.engine.camera;
    const p = this.pointer;
    let uv: [number, number] | null = null;
    const hit = p.raycaster(cam).intersectObject(this.sheet, false)[0];
    if (hit?.uv) uv = [hit.uv.x, 1 - hit.uv.y];
    if (hit && this.time > 1.5) ctx.ui.cursor.setLabel(ctx.t('gain.cursor.drag'));
    // Keyboard and touch-free path: hold Space and the pen writes on its own.
    const holding = ctx.input.raw.primary || ctx.input.raw.hold;
    if (holding && !p.down) {
      this.auto += dt;
      const t = this.auto;
      uv = [0.12 + ((t * 0.5) % 0.76) + Math.sin(t * 13) * 0.012, 0.18 + (Math.floor((t * 0.5) / 0.76) % 6) * 0.12 + Math.sin(t * 17) * 0.025];
    }
    const writing = (p.down && uv) || (holding && uv);
    if (writing && uv) {
      if (this.last) {
        const d = Math.hypot(uv[0] - this.last[0], uv[1] - this.last[1]);
        if (d > 0.002 && d < 0.2) {
          this.strokes.push({ a: this.last, b: uv });
          this.length += d;
          this.dirty = true;
          if (Math.random() < 0.08) ctx.audio.pluck(880 + Math.random() * 220, { level: 0.03, duration: 0.2 });
        }
      }
      this.last = uv;
    } else this.last = null;
    // The pen follows the writing point.
    const pen = w.pen;
    if (uv) {
      const local = new Vector3((uv[0] - 0.5) * 0.34, 0, (uv[1] - 0.5) * 0.24).applyAxisAngle(new Vector3(0, 1, 0), this.sheet.rotation.y);
      const target = this.sheet.position.clone().add(local).add(new Vector3(0.06, writing ? 0.03 : 0.06, 0.05));
      pen.position.lerp(target, 1 - Math.exp(-dt * 20));
      pen.rotation.set(0, -0.6, -0.9);
    }
    w.figure.reach[0].target.copy(pen.position);
    w.figure.reach[0].weight = 0.4;
    if (this.dirty) {
      this.draw();
      this.dirty = false;
    }
    if (this.progress >= 1) {
      this.phase = 'hold';
      this.phaseT = 0;
      ctx.ui.hud.clear();
      ctx.ui.cursor.setLabel(null);
      announce(this.lines.join(' '));
      haptic(14);
      ctx.audio.chord([293.7, 370, 440, 587.3], { level: 0.18, duration: 4, timbre: 'warm' });
    }
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx } = this;
    const w = ctx.world;
    this.phaseT += dt;
    const t = this.phaseT;
    if (this.phase === 'write') this.updateWrite(dt);
    else if (this.phase === 'hold') {
      if (t > 1.8) this.next('roll');
    } else if (this.phase === 'roll') {
      // The sheet rolls itself up from the far edge.
      const k = easing.inOutCubic(clamp(t / 1.4));
      for (const m of [this.sheet, w.papyrus.mesh]) m.scale.set(1 - k * 0.92, 1, 1);
      this.scroll.visible = true;
      this.scroll.position.copy(this.sheet.position).add(new Vector3(0, 0.03, 0));
      this.scroll.scale.set(1, 0.3 + k * 0.7, 1);
      w.figure.reach[0].weight = 0.4 * (1 - k);
      if (t > 1.5) {
        this.sheet.visible = false;
        w.papyrus.mesh.visible = false;
        this.scrollFrom.copy(this.scroll.position);
        w.glide([new Vector3(0.2, 1.4, 0.4), BEAM_ORIGIN.clone().add(new Vector3(0.3, -0.4, 0)), 52], 0.9);
        this.next('rise');
      }
    } else if (this.phase === 'rise') {
      // It rises, glowing, to the window.
      const k = easing.inOutCubic(clamp(t / 3));
      const mid = this.scrollFrom.clone().lerp(BEAM_ORIGIN, 0.5).add(new Vector3(0.3, 0.5, 0.4));
      const a = this.scrollFrom.clone().lerp(mid, k);
      const b = mid.clone().lerp(BEAM_ORIGIN, k);
      this.scroll.position.copy(a.lerp(b, k));
      this.scroll.rotation.y += dt * 1.5;
      (this.scroll.material as MeshStandardMaterial).emissiveIntensity = k * 3;
      if (this.flag('flash', t > 2.8)) ctx.postfx.fadeTo('white', 1, 0.5);
      if (t > 3.4) this.toRome();
    } else if (this.phase === 'rome' && this.rome && this.streak) {
      // Up from the cell block, over the roofs, east.
      const k = clamp(t / 5.5);
      const o = this.rome.origin;
      const p = new Vector3(o.x + k * 70, o.y + 2 + easing.outCubic(k) * 12, o.z + 4 + k * 34);
      this.streak.moveTo(p);
      // Above and behind, looking down over the roofs.
      ctx.rig.position.lerp(p.clone().add(new Vector3(-9, 9, -12)), 1 - Math.exp(-dt * 2.2));
      ctx.rig.target.lerp(p.clone().add(new Vector3(10, -3.2, 13)), 1 - Math.exp(-dt * 4));
      this.rome.update(dt, () => {}, () => {});
      if (this.flag('toSea', t > 5)) ctx.postfx.fadeTo('black', 1, 0.5);
      if (t > 5.6) this.toSea();
    } else if (this.phase === 'sea' && this.map && this.streak) {
      // Across the sea to Philippi, about 1,200 km.
      const k = easing.inOutQuad(clamp(t / 11));
      const p = ROUTE.getPointAt(k);
      this.streak.moveTo(p);
      const ahead = ROUTE.getPointAt(Math.min(1, k + 0.05));
      const back = p.clone().sub(ahead).setY(0).normalize();
      ctx.rig.position.lerp(p.clone().addScaledVector(back, 3.2).add(new Vector3(0, 0.9 + Math.sin(k * Math.PI) * 1.2, 0.9)), 1 - Math.exp(-dt * 1.4));
      const far = ROUTE.getPointAt(Math.min(1, k + 0.2)).lerp(PHILIPPI, 0.2);
      ctx.rig.target.lerp(far.setY(p.y * 0.62), 1 - Math.exp(-dt * 3));
      this.map.update(dt);
      if (this.flag('land', t > 10.4)) ctx.postfx.fadeTo('black', 1, 0.6);
      if (t > 11.1) this.toPhilippi();
    } else if (this.phase === 'philippi' && this.house && this.streak) {
      // In through the window; the house fills with gold light.
      const k = easing.inOutCubic(clamp(t / 2.6));
      const from = this.house.window.clone().add(new Vector3(3, 6, 8));
      this.streak.moveTo(from.lerp(this.house.window.clone().add(new Vector3(0, 0, -0.6)), k));
      this.house.fill = smoothstep(2.2, 5.5, t);
      this.house.update(dt);
      if (this.flag('arrive', t > 2.4)) {
        ctx.audio.chord([293.7, 440, 587.3, 740], { level: 0.2, duration: 6, timbre: 'choir' });
        haptic(18);
      }
      if (t > 2.6) this.streak.group.visible = false;
      if (this.flag('end', t > 8.5)) this.complete();
    }
  }

  private next(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  private flag(key: string, cond: boolean): boolean {
    if (!cond || this.flags.has(key)) return false;
    this.flags.add(key);
    return true;
  }

  private toRome(): void {
    const { ctx } = this;
    ctx.world.inCell = false;
    ctx.world.air('night');
    ctx.world.release();
    this.rome = new Rome({ maxInstances: Math.min(400, ctx.quality.budget.maxInstances), guards: false });
    this.root.add(this.rome.group);
    this.streak = new Streak(0.09);
    this.streak.reset(this.rome.origin);
    this.root.add(this.streak.group);
    this.rome.lightWindows(0.6);
    ctx.rig.snapTo(this.rome.origin.clone().add(new Vector3(-9, 9, -8)), this.rome.origin.clone().add(new Vector3(10, -3, 13)));
    this.streak.light = 6;
    ctx.engine.exposure = 1.1;
    ctx.postfx.fadeTo('white', 0, 1.2);
    this.next('rome');
  }

  private toSea(): void {
    const { ctx } = this;
    this.rome?.dispose();
    this.rome = null;
    // The moon low ahead, east over the Aegean, so its road on the water leads the letter on.
    this.map = new MapWorld({ moon: [11, 1.42] });
    this.root.add(this.map.group);
    ctx.world.air('flight');
    this.streak!.light = 1.2;
    const start = ROUTE.getPointAt(0);
    this.streak!.reset(start);
    ctx.rig.snapTo(start.clone().add(new Vector3(-3.2, 1.2, 0.9)), start.clone().add(new Vector3(4, -0.8, 0.8)));
    ctx.rig.setFov(55);
    ctx.postfx.fadeTo('black', 0, 1.0);
    this.next('sea');
  }

  private toPhilippi(): void {
    const { ctx } = this;
    this.map?.dispose();
    this.map = null;
    this.house = new House();
    this.root.add(this.house.group);
    ctx.world.air('night');
    this.streak!.light = 2;
    const win = this.house.window;
    this.streak!.reset(win.clone().add(new Vector3(3, 6, 8)));
    ctx.rig.snapTo(new Vector3(3.2, 2.5, 8), new Vector3(0, 1.7, 1.4));
    ctx.rig.setFov(48);
    ctx.engine.exposure = 1.15;
    ctx.postfx.fadeTo('black', 0, 1.2);
    this.next('philippi');
  }

  override exit(): void {
    const { ctx } = this;
    const w = ctx.world;
    w.inCell = true;
    w.papyrus.mesh.visible = true;
    w.papyrus.mesh.scale.set(1, 1, 1);
    w.figure.reach[0].weight = 0;
    w.pen.position.set(LAMP.x + 0.24, LAMP.y + 0.012, LAMP.z + 0.02);
    w.pen.rotation.set(0, -0.35, 0);
    ctx.engine.exposure = 1.25;
    ctx.rig.setFov(50);
    this.rome?.dispose();
    this.map?.dispose();
    this.house?.dispose();
    this.streak?.dispose();
    this.rome = this.map = this.house = this.streak = null;
    this.tex.dispose();
  }
}
