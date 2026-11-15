// CH1 · ζημία · THE LEDGER (Philippians 1:21; 3:7-8). The sentence engine.
//
// Drag (or tap, or choose with the arrow keys) one of the things people live for into the first
// blank. Its life plays out in fast-forward and fails in its own way; the second blank fills grey
// with LOSS and the ash slides into the ζημία column. The moonbeam waits in the corner, never
// pointed at. Stepping into it is the only thing that completes the sentence as GAIN.
import { Plane, PointLight, Raycaster, Vector3 } from 'three';
import { announce, clamp, damp, easing, getUIRoot, h, haptic, partial, smoothstep, trapFocus } from '@delivered/core';
import { collapse, drip, motif, resolve, shimmer } from '../audio';
import { Ledger as LedgerState, sanitizeWord, type LedgerId } from '../logic/sentence';
import { AshField, GainColumn, LossColumn, Written, createLedgerObjects, type LedgerObject } from '../world/ledger';
import { BEAM_DIR, BEAM_FLOOR, BEAM_KNEEL, BEAM_LENGTH, BEAM_ORIGIN, BENCH, CELL, SEAT } from '../world/layout';
import { Pointer } from '../world/pointer';
import { Sentence } from '../world/sentence';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

type Phase = 'intro' | 'idle' | 'drag' | 'place' | 'life' | 'write' | 'reveal' | 'done';

/** Camera for the ledger: the figure and the objects, the beam off in the corner. */
const CAM = { pos: new Vector3(0.3, 1.32, 1.25), look: new Vector3(-1.4, 1.28, -1.5), fov: 52 };

/** Where the objects float: an arc in front of the visitor, in the lamp's light. */
const ARC: Record<LedgerId, [number, number, number]> = {
  written: [-2.12, 1.25, -1.0],
  laurel: [-1.95, 1.72, -1.62],
  coins: [-1.72, 0.88, -0.95],
  scroll: [-1.4, 1.82, -1.4],
  heart: [-0.98, 1.2, -0.8],
  cushion: [-0.95, 0.86, -1.08],
  mirror: [-0.86, 1.6, -1.35],
};

const LIFE = { rise: 1.6, years: 4.6, out: 5.4, crumble: 8.4, gather: 10.2, end: 11.6 };

export class LedgerChapter extends GChapter {
  readonly id = 'ledger';
  override keyMomentAt = 9;
  override transitionIn = 'fade' as const;

  private ledger = new LedgerState();
  private sentence!: Sentence;
  private objects: LedgerObject[] = [];
  private ash!: AshField;
  private loss!: LossColumn;
  private gainCol!: GainColumn;
  private pointer!: Pointer;
  private phase: Phase = 'intro';
  private focus = 0;
  private hovered: LedgerObject | 'beam' | null = null;
  private held: LedgerObject | null = null;
  private heldFrom = new Vector3();
  private dragPlane = new Plane();
  private lifeT = 0;
  private current: LedgerObject | null = null;
  private revealT = 0;
  private whispered = false;
  private hintShown = false;
  private prevMoveX = 0;
  private nextDrip = 2;
  private dialog: HTMLElement | null = null;
  private shimmerHandle: ReturnType<typeof shimmer> | null = null;
  private arrived = 0;
  private fill!: PointLight;

  enter(ctx: GainCtx): void {
    this.begin(ctx);
    const w = ctx.world;
    this.ledger = new LedgerState();
    this.phase = 'intro';
    this.whispered = this.hintShown = false;
    this.arrived = 0;
    w.inCell = true;
    w.figure.group.position.set(SEAT.x, 0, SEAT.z);
    w.chainToWall();
    w.figure.heading = 0;
    w.figure.sit = 1;
    w.figure.kneel = 0;
    w.figure.look.weight = 0;
    w.lamp.target = 1;
    w.beam.intensity = 1;
    w.beam.warmth = 0;
    w.beam.pull = 0;
    w.papyrus.age = 0;
    ctx.postfx.fadeTo('black', 0, 3.2);
    ctx.world.glide([CAM.pos, CAM.look, CAM.fov], 0.9);
    ctx.rig.snapTo(CAM.pos.clone().add(new Vector3(0.25, 0.1, 0.5)), CAM.look.clone());
    ctx.rig.parallax = 1.2;

    // The sentence, from the registered pieces of Philippians 1:21.
    this.sentence = new Sentence(partial('Philippians 1:21', 0), partial('Philippians 1:21', 1));
    this.sentence.group.position.set(-1.62, 2.22, -0.85);
    this.sentence.face(CAM.pos);
    this.root.add(this.sentence.group);
    this.sentence.blanks[0].waiting(true);

    // The things people live for, floating in the lamp's light.
    this.objects = createLedgerObjects();
    for (const o of this.objects) {
      o.home.fromArray(ARC[o.id]);
      o.group.position.copy(o.home);
      o.group.scale.setScalar(0.001);
      this.root.add(o.group);
    }

    this.ash = new AshField();
    this.root.add(this.ash.points);
    this.ash.onArrive = () => {
      this.arrived++;
    };
    this.loss = new LossColumn(w.cell.stone, 'ζημία', ctx.t('gain.loss').toUpperCase());
    this.loss.group.position.set(CELL.x0 + 0.07, 0, -1.45);
    this.loss.group.rotation.y = Math.PI / 2;
    // A faint cool light on the column (moonlight thrown back off the floor).
    const colLight = new PointLight('#a8b6d2', 6, 3.2, 1.2);
    colLight.position.set(CELL.x0 + 0.9, 1.6, -0.75);
    this.root.add(colLight);
    // The lamp's glow spilling forward onto the things floating in front of the visitor.
    const fill = new PointLight('#ffb25c', 0.9, 3.2, 1.6);
    fill.position.set(-0.85, 1.55, -0.35);
    this.root.add(fill);
    this.fill = fill;
    this.root.add(this.loss.group);
    this.gainCol = new GainColumn('κέρδος', partial('Philippians 1:21', 3).toUpperCase());
    this.gainCol.group.position.set(CELL.x0 + 0.38, 0, 0.32);
    this.gainCol.group.rotation.y = Math.PI / 2 - 0.45;
    this.root.add(this.gainCol.group);

    this.pointer = this.own(new Pointer(ctx.engine.renderer.domElement));
    this.shimmerHandle = this.own(shimmer(ctx.audio));

    this.card({ word: 'ζημία', lang: 'grc', translit: 'zēmia', english: 'loss', ref: 'Philippians 3:7', number: 1 });
    this.at(4.4, () => {
      this.phase = 'idle';
      this.showHint();
    });
    this.own(() => this.closeDialog());
  }

  // -------------------------------------------------------------------------------------------
  // Choosing
  // -------------------------------------------------------------------------------------------

  private get available(): (LedgerObject | 'beam')[] {
    return [...this.objects.filter((o) => !o.spent || o.id === 'written'), 'beam'];
  }

  private showHint(): void {
    const { input, ui, t } = this.ctx;
    const key = input.device === 'touch' ? 'gain.hint.touch' : this.usedKeys ? 'gain.hint.keys' : 'gain.hint.drag';
    ui.hud.set('bottom-center', t(key));
    this.hintShown = true;
  }
  private usedKeys = false;

  private pick(ray: Raycaster): LedgerObject | 'beam' | null {
    let best: LedgerObject | null = null;
    let bestD = Infinity;
    for (const o of this.objects) {
      if (o.spent && o.id !== 'written') continue;
      const c = o.group.getWorldPosition(new Vector3());
      const d = ray.ray.distanceToPoint(c);
      const along = c.clone().sub(ray.ray.origin).dot(ray.ray.direction);
      if (d < o.radius * 1.15 && along < bestD) {
        best = o;
        bestD = along;
      }
    }
    if (best) return best;
    // The beam: near its axis anywhere along its length, or its pool on the floor.
    const a = BEAM_ORIGIN;
    const b = BEAM_ORIGIN.clone().addScaledVector(BEAM_DIR, BEAM_LENGTH);
    const d2 = ray.ray.distanceSqToSegment(a, b);
    if (d2 < 0.3 * 0.3) return 'beam';
    const floorHit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), new Vector3());
    if (floorHit && floorHit.distanceTo(BEAM_FLOOR) < 0.45) return 'beam';
    return null;
  }

  private choose(target: LedgerObject | 'beam'): void {
    if (target === 'beam') return this.startReveal();
    if (target.id === 'written') return this.openDialog();
    this.place(target);
  }

  private place(o: LedgerObject): void {
    this.phase = 'place';
    this.held = o;
    this.heldFrom.copy(o.group.position);
    this.lifeT = 0;
    this.ctx.ui.hud.clear('bottom-center');
    this.ctx.ui.whisper.hide();
    this.ctx.audio.ui.confirm();
    haptic(10);
  }

  private beginLife(o: LedgerObject, word?: string): void {
    const { ctx } = this;
    const c = this.ledger.choose({ kind: 'object', id: o.id, text: word });
    void c;
    this.current = o;
    this.phase = 'life';
    this.lifeT = 0;
    const name = word ?? ctx.t(`gain.obj.${o.id}`);
    this.sentence.blanks[0].waiting(false);
    this.sentence.blanks[0].write(name, 'warm', 0.9);
    announce(`${partial('Philippians 1:21', 0)} ${name}`);
    motif(ctx.audio, o.id);
  }

  private openDialog(): void {
    const { t } = this.ctx;
    this.phase = 'write';
    this.ctx.input.enabled = false;
    const input = h('input', { type: 'text', class: 'gn-write__input', maxlength: '40', placeholder: t('gain.write.placeholder'), 'aria-label': t('gain.write.title'), autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    const ok = h('button', { class: 'dl-btn dl-btn--primary', type: 'submit' }, t('gain.write.ok'));
    const cancel = h('button', { class: 'dl-btn', type: 'button' }, t('gain.write.cancel'));
    const form = h(
      'form',
      { class: 'gn-write dl-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('gain.write.title') },
      h('p', { class: 'dl-title gn-write__title' }, t('gain.write.title')),
      input,
      h('p', { class: 'dl-caption gn-write__note' }, t('gain.write.private')),
      h('div', { class: 'gn-write__row' }, cancel, ok),
    ) as HTMLFormElement;
    this.dialog = h('div', { class: 'gn-write-wrap' }, form);
    getUIRoot().appendChild(this.dialog);
    const release = trapFocus(form, () => this.closeDialog());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const word = sanitizeWord(input.value);
      release();
      this.closeDialog();
      const o = this.objects.find((x) => x.id === 'written') as Written;
      o.setWord(word || '…');
      o.reset();
      this.writtenWord = word || '…';
      this.place(o);
    });
    cancel.addEventListener('click', () => {
      release();
      this.closeDialog();
    });
    requestAnimationFrame(() => {
      this.dialog?.classList.add('is-in');
      input.focus();
    });
  }
  private writtenWord = '';

  private closeDialog(): void {
    if (!this.dialog) return;
    const d = this.dialog;
    this.dialog = null;
    d.classList.remove('is-in');
    setTimeout(() => d.remove(), 420);
    if (this.phase === 'write') {
      this.phase = 'idle';
      this.ctx.input.enabled = true;
    }
  }

  // -------------------------------------------------------------------------------------------
  // The reveal
  // -------------------------------------------------------------------------------------------

  private startReveal(): void {
    const { ctx } = this;
    const w = ctx.world;
    this.phase = 'reveal';
    this.revealT = 0;
    this.ledger.choose({ kind: 'beam' });
    ctx.ui.hud.clear();
    ctx.ui.whisper.hide();
    ctx.input.enabled = false;
    ctx.ui.cursor.setLabel(null);
    w.beam.pull = 0;
    this.walkFrom.copy(w.figure.group.position);
    ctx.audio.ui.confirm();
    haptic(16);
    w.glide([new Vector3(1.05, 1.42, 1.55), new Vector3(-0.5, 1.45, -1.25), 56], 0.7);
  }
  private walkFrom = new Vector3();

  private updateReveal(dt: number): void {
    const { ctx } = this;
    const w = ctx.world;
    const fig = w.figure;
    const t = (this.revealT += dt);
    const window = BEAM_ORIGIN.clone();
    // 1. Rise, walk into the light, kneel, look up.
    const rise = clamp(t / 1.2);
    const walk = clamp((t - 0.9) / 3.2);
    const kneel = clamp((t - 4.0) / 1.4);
    fig.sit = (1 - easing.inOutCubic(rise)) * (1 - walk > 0 ? 1 : 0);
    const start = new Vector3(SEAT.x + 0.15, 0, BENCH.z1 + 0.25);
    const p = new Vector3();
    if (walk <= 0) p.copy(this.walkFrom).lerp(start, easing.inOutCubic(rise));
    else p.copy(start).lerp(BEAM_KNEEL, easing.inOutCubic(walk));
    fig.group.position.copy(p);
    if (walk > 0 && walk < 1) {
      const dir = BEAM_KNEEL.clone().sub(start);
      fig.heading = damp(fig.heading, Math.atan2(dir.x, dir.z), 5, dt);
      fig.speed = 0.55 * Math.sin(Math.PI * walk);
    } else fig.speed = 0;
    if (t > 3.6) {
      const toWin = window.clone().sub(fig.group.position);
      fig.heading = damp(fig.heading, Math.atan2(toWin.x, toWin.z), 2.5, dt);
    }
    fig.kneel = easing.inOutCubic(kneel);
    if (t < 1.2) fig.sit = 1 - easing.inOutCubic(rise);
    else fig.sit = 0;
    fig.look.target.copy(window);
    fig.look.weight = smoothstep(4.2, 6, t) * 0.85;
    const open = smoothstep(4.6, 6.5, t);
    fig.reach[0].target.copy(fig.group.position).add(new Vector3(0.25, 1.05, 0.0).applyAxisAngle(new Vector3(0, 1, 0), fig.heading));
    fig.reach[1].target.copy(fig.group.position).add(new Vector3(-0.25, 1.05, 0.0).applyAxisAngle(new Vector3(0, 1, 0), fig.heading));
    fig.reach[0].weight = fig.reach[1].weight = open * 0.6;

    // 2. "Christ" fills the first blank with light; the life plays again.
    if (this.once('christ', t > 5.4)) {
      this.sentence.blanks[0].waiting(false);
      this.sentence.blanks[0].write(partial('Philippians 1:21', 2), 'light', 1.6);
      announce(`${partial('Philippians 1:21', 0)} ${partial('Philippians 1:21', 2)}`);
      ctx.audio.bell(587.3, { level: 0.25, duration: 4 });
      w.glide([new Vector3(1.15, 1.32, 1.8), new Vector3(-0.8, 1.55, -1.2), 56], 0.35);
    }
    // What is left of the ledger is counted as loss and quietly goes (3:8): a slow gold-edged dissolve.
    const gone = smoothstep(6.5, 10.5, t);
    for (const o of this.objects) if (!o.spent) o.fade(gone);
    // Years pass: the lamp flickers, the papyrus ages.
    const years = clamp((t - 6.6) / 3.2);
    if (years > 0 && years < 1) {
      w.lamp.target = 1.1 + Math.sin(t * (6 + years * 22)) * 0.6;
      w.papyrus.age = years;
    }
    // 3. The lamp dies, and the moonbeam grows brighter as it does.
    if (this.once('lampOut', t > 9.8)) w.lamp.target = 0;
    const bright = smoothstep(9.6, 12.5, t);
    w.beam.intensity = 1 + bright * 1.5;
    w.beam.warmth = bright * 0.35;
    ctx.postfx.params.bloom = 0.55 + bright * 0.35;
    if (this.once('gain', t > 11.4)) {
      this.sentence.blanks[1].write(partial('Philippians 1:21', 3), 'gold', 1.4, true);
      announce(`${partial('Philippians 1:21', 1)} ${partial('Philippians 1:21', 3)}`);
      resolve(ctx.audio);
      haptic(24);
    }
    // 4. The LOSS column cracks along gold seams; the GAIN column rises beside it.
    if (this.once('columns', t > 13.2)) w.glide([new Vector3(0.35, 1.45, 1.75), new Vector3(-2.05, 1.5, -0.45), 58], 0.45);
    this.loss.crack = smoothstep(13.5, 17, t);
    this.gainCol.rise = easing.inOutCubic(smoothstep(14.2, 18, t));
    // 5. Philippians 1:21 in full.
    if (this.once('verse', t > 18.5)) void ctx.ui.scripture.show({ ref: 'Philippians 1:21', position: 'lower', duration: 7.5, original: { text: 'ἐμοὶ γὰρ τὸ ζῆν Χριστὸς καὶ τὸ ἀποθανεῖν κέρδος.', lang: 'grc' } });
    if (this.once('end', t > 27)) this.complete();
  }

  private flags = new Set<string>();
  private once(key: string, cond: boolean): boolean {
    if (!cond || this.flags.has(key)) return false;
    this.flags.add(key);
    return true;
  }

  // -------------------------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------------------------

  update(dt: number): void {
    this.runEvents();
    const { ctx } = this;
    const w = ctx.world;
    const cam = ctx.engine.camera;
    this.sentence.update(dt);
    this.fill.intensity = 0.9 * Math.min(1.6, w.lamp.level);
    this.loss.update(dt);
    this.gainCol.update(dt);
    this.ash.update(dt, (x, z) => (x > BENCH.x0 && x < BENCH.x1 && z > BENCH.z0 && z < BENCH.z1 ? BENCH.height : 0));

    // Objects appear one after another, then float.
    this.objects.forEach((o, i) => {
      const k = clamp((this.time - 1.6 - i * 0.18) / 1.0);
      if (o !== this.held && o !== this.current) o.group.scale.setScalar(Math.max(0.001, easing.outCubic(k) * 1.4));
      if (!o.spent || o === this.current) o.idle(dt);
      o.focus = damp(o.focus, this.hovered === o ? 1 : 0, 8, dt);
    });

    this.nextDrip -= dt;
    if (this.nextDrip <= 0) {
      drip(ctx.audio, 0.1 + Math.random() * 0.08);
      this.nextDrip = 3 + Math.random() * 4;
    }

    if (this.phase === 'idle' || this.phase === 'drag') this.updateChoosing(dt);
    else if (this.phase === 'place') this.updatePlace(dt);
    else if (this.phase === 'life') this.updateLife(dt);
    else if (this.phase === 'reveal') this.updateReveal(dt);

    // The gentle hints. Nothing ever points at the beam.
    if (this.ledger.whisperDue && !this.whispered && this.phase === 'idle') {
      this.whispered = true;
      ctx.ui.whisper.show(ctx.t('gain.untried'), { duration: 7 });
    }
    const pullGoal = this.ledger.motesDue && this.phase !== 'reveal' ? 1 : 0;
    w.beam.pull = damp(w.beam.pull, pullGoal, 0.35, dt);
    w.beam.pullTarget.copy(w.figure.headPosition()).add(new Vector3(0.25, -0.2, 0.35));
    // On a narrow (portrait) screen the sentence stacks and sits in the upper third of the view.
    const portrait = cam.aspect < 0.9;
    if (portrait !== this.sentence.isPortrait) this.sentence.layout(portrait);
    if (portrait) {
      const f = CAM.look.clone().sub(CAM.pos).normalize();
      const r = new Vector3().crossVectors(f, new Vector3(0, 1, 0)).normalize();
      this.sentence.group.position.copy(CAM.pos).addScaledVector(f, 1.75).addScaledVector(r, -0.16).add(new Vector3(0, 0.4, 0));
      this.sentence.group.scale.setScalar(0.5);
    } else {
      this.sentence.group.position.set(-1.62, 2.22, -0.85);
      this.sentence.group.scale.setScalar(1);
    }
    this.sentence.face(cam.position);
    this.pointer.endFrame();
  }

  private updateChoosing(dt: number): void {
    const { ctx } = this;
    const { input } = ctx;
    const cam = ctx.engine.camera;
    const w = ctx.world;
    const list = this.available;

    // Keyboard and gamepad: ← → move the focus, Enter or Space places.
    const mx = input.raw.moveX;
    if (Math.abs(mx) > 0.5 && Math.abs(this.prevMoveX) <= 0.5) {
      this.focus = (this.focus + (mx > 0 ? 1 : -1) + list.length) % list.length;
      this.usedKeys = true;
      const f = list[this.focus]!;
      this.hovered = f;
      announce(f === 'beam' ? ctx.t('gain.obj.beam') : ctx.t(`gain.obj.${f.id}`));
      ctx.audio.ui.hover();
      if (this.hintShown) this.showHint();
    }
    this.prevMoveX = mx;
    if ((input.pressed('confirm') || input.pressed('primary')) && this.usedKeys && this.hovered) {
      this.choose(this.hovered);
      return;
    }

    // Pointer.
    const p = this.pointer;
    const ray = p.raycaster(cam);
    if (this.phase === 'idle') {
      if (!this.usedKeys || p.travel > 0 || p.down) {
        const hit = this.pick(ray);
        if (hit !== this.hovered && p.type !== 'touch') {
          if (hit) ctx.audio.ui.hover();
          this.hovered = hit;
        }
        ctx.ui.cursor.setLabel(hit === 'beam' ? ctx.t('gain.cursor.enter') : hit ? ctx.t('gain.cursor.drag') : null);
        if (p.justDown) {
          this.usedKeys = false;
          this.hovered = hit;
          if (hit && hit !== 'beam') {
            this.held = hit;
            this.heldFrom.copy(hit.group.position);
            this.dragPlane.setFromNormalAndCoplanarPoint(cam.getWorldDirection(new Vector3()).negate(), hit.group.position);
            this.phase = 'drag';
          } else if (hit === 'beam') {
            this.choose('beam');
            return;
          }
        }
      }
    } else if (this.phase === 'drag' && this.held) {
      const o = this.held;
      const hitP = ray.ray.intersectPlane(this.dragPlane, new Vector3());
      if (hitP) o.group.position.lerp(hitP, 1 - Math.exp(-dt * 18));
      w.figure.reach[0].target.copy(o.group.position);
      w.figure.reach[0].weight = damp(w.figure.reach[0].weight, 0.45, 4, dt);
      if (p.justUp) {
        const blank = this.sentence.blanks[0].center().project(cam);
        const near = Math.hypot((blank.x - p.ndc.x) * cam.aspect, blank.y - p.ndc.y) < 0.38;
        const tap = p.travel < 8;
        if (near || tap) this.choose(o);
        else {
          this.phase = 'idle';
          this.held = null;
        }
      }
    }
    if (this.phase !== 'drag') w.figure.reach[0].weight = damp(w.figure.reach[0].weight, 0, 3, dt);
    // Return untouched objects home.
    for (const o of this.objects) if (o !== this.held && !o.spent) o.group.position.lerp(o.home, 1 - Math.exp(-dt * 4));
  }

  /** The chosen object flies to the blank, then down into the visitor's hands. */
  private updatePlace(dt: number): void {
    const o = this.held!;
    this.lifeT += dt;
    const k = easing.inOutCubic(clamp(this.lifeT / 0.7));
    const blank = this.sentence.blanks[0].center();
    o.group.position.copy(this.heldFrom).lerp(blank, k);
    if (this.lifeT >= 0.7) {
      this.held = null;
      this.heldFrom.copy(o.group.position);
      this.beginLife(o, o.id === 'written' ? this.writtenWord : undefined);
    }
  }

  private updateLife(dt: number): void {
    const { ctx } = this;
    const w = ctx.world;
    const o = this.current!;
    const t = (this.lifeT += dt);
    // The life is lived on a small stage just in front of the visitor, close enough to read.
    const hands = w.figure.group.position.clone().add(new Vector3(0.12, 1.08, 0.62));
    // Rise: from the blank down into the light just above the visitor's hands; it grows and glows.
    const rise = easing.inOutCubic(clamp(t / LIFE.rise));
    o.group.position.copy(this.heldFrom).lerp(hands, rise);
    o.group.scale.setScalar(1.4 + rise * 0.7);
    if (this.once(`push-${this.ledger.attempts}`, t > 0.2)) w.glide([hands.clone().add(new Vector3(1.05, 0.28, 1.55)), hands.clone().add(new Vector3(-0.15, 0.12, 0)), 48], 0.9);
    w.figure.reach[0].target.copy(o.group.position).add(new Vector3(0.06, -0.05, 0));
    w.figure.reach[1].target.copy(o.group.position).add(new Vector3(-0.06, -0.05, 0));
    const hold = smoothstep(0.6, 1.6, t) * (1 - smoothstep(LIFE.crumble - 0.5, LIFE.crumble + 0.4, t));
    w.figure.reach[0].weight = w.figure.reach[1].weight = hold * 0.9;
    o.flourish(smoothstep(0.2, LIFE.rise, t) * (1 - smoothstep(LIFE.years, LIFE.out, t)));
    if (t < LIFE.years) w.lamp.target = 1 + smoothstep(0.3, LIFE.rise, t) * 0.9;
    // Years: the lamp flickers through days and nights, faster and faster; the papyrus ages.
    const years = clamp((t - LIFE.rise) / (LIFE.years - LIFE.rise));
    if (years > 0 && years < 1) {
      w.lamp.target = 1.3 + Math.sin(t * (5 + years * 26)) * 0.7 * (1 - years * 0.3);
      w.papyrus.age = years;
      o.age(years * 0.6);
    }
    // The lamp goes out.
    if (this.once(`out-${this.ledger.attempts}`, t > LIFE.years)) {
      w.lamp.target = 0;
      ctx.audio.duck(0.5, 1.5);
    }
    if (t > LIFE.years) o.age(0.6 + clamp((t - LIFE.years) / 1.5) * 0.4);
    // It fails in its own way.
    const cv = clamp((t - LIFE.out) / (LIFE.crumble - LIFE.out));
    if (cv > 0) o.crumble(cv, dt, this.ash);
    if (this.once(`collapse-${this.ledger.attempts}`, t > LIFE.out)) {
      collapse(ctx.audio, o.id);
      ctx.audio.crumble(0.35);
    }
    if (this.once(`loss-${this.ledger.attempts}`, t > LIFE.out + 1.3)) {
      this.sentence.blanks[1].write(ctx.t('gain.loss'), 'grey', 1.2, true);
      this.sentence.blanks[0].write(this.sentence.blanks[0].word.text, 'grey', 0.01);
      announce(`${partial('Philippians 1:21', 1)} ${ctx.t('gain.loss')}`);
    }
    // The ash slides into the ζημία column.
    if (this.once(`gather-${this.ledger.attempts}`, t > LIFE.crumble)) {
      o.group.visible = false;
      this.ash.gather(this.loss.mouth(), 1.1);
      this.loss.level = Math.min(1, this.ledger.attempts / 7 + 0.04);
    }
    // Recover: the lamp is lit again; the sentence waits.
    if (this.once(`recover-${this.ledger.attempts}`, t > LIFE.gather)) {
      w.glide([CAM.pos, CAM.look, CAM.fov], 0.8);
      w.lamp.target = 1;
      this.sentence.blanks[0].erase(0.9);
      this.sentence.blanks[1].erase(0.9);
    }
    if (t > LIFE.gather) w.papyrus.age = Math.max(0, w.papyrus.age - dt * 0.8);
    if (t > LIFE.end) {
      o.spent = true;
      if (o.id === 'written') {
        (o as Written).setWord('');
        o.reset();
        o.group.position.copy(o.home);
        o.group.visible = true;
        o.spent = false;
      }
      this.current = null;
      this.phase = 'idle';
      this.sentence.blanks[0].waiting(true);
      this.focus = Math.min(this.focus, this.available.length - 1);
      this.hovered = null;
      if (!this.whispered && !this.ledger.whisperDue) this.showHint();
      else this.ctx.ui.hud.clear('bottom-center');
    }
  }

  override exit(): void {
    const w = this.ctx.world;
    w.figure.reach[0].weight = w.figure.reach[1].weight = 0;
    w.figure.look.weight = 0;
    w.beam.pull = 0;
    this.ctx.postfx.params.bloom = 0.55;
    this.ctx.rig.parallax = 2.5;
    this.ash.dispose();
    for (const o of this.objects) o.dispose();
    this.loss.dispose();
    this.gainCol.dispose();
    this.shimmerHandle = null;
  }
}
