// The floating 3D sentence: "For to me to live is ____, / and to die is ____."
// The fixed words come from registered partial quotations of Philippians 1:21. The blanks are
// glowing rules; words are written into them with a left-to-right wipe (troika clipRect).
import { Color, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import type { Text } from 'troika-three-text';
import { damp } from '@delivered/core';
import { text3d, textWidth } from './text3d';

export type Tone = 'neutral' | 'warm' | 'grey' | 'light' | 'gold';

const TONES: Record<Tone, Color> = {
  neutral: new Color('#F7F3EA').multiplyScalar(0.92),
  warm: new Color('#FFD9A6').multiplyScalar(1.25),
  grey: new Color('#6E6A66').multiplyScalar(1.05),
  light: new Color(2.4, 2.32, 2.05),
  gold: new Color('#F5C76B').multiplyScalar(2.3),
};

const SIZE = 0.115;
const BLANK = 0.64;
const GAP = 0.05;

class Blank {
  readonly rule: Mesh;
  readonly word: Text;
  private ruleMat: MeshBasicMaterial;
  /** 0..1 wipe of the written word. */
  private reveal = 0;
  private target = 0;
  private wipeRate = 1.2;
  private ruleGlow = 0.35;
  private blink = false;
  private t = 0;

  constructor(parent: Group, x: number, y: number) {
    this.ruleMat = new MeshBasicMaterial({ color: new Color('#F7F3EA'), transparent: true, opacity: 0.4, depthWrite: false, fog: false });
    this.rule = new Mesh(new PlaneGeometry(BLANK, 0.006), this.ruleMat);
    this.rule.position.set(x + BLANK / 2, y - SIZE * 0.42, 0);
    this.rule.renderOrder = 30;
    this.word = text3d('', { size: SIZE * 1.08, anchorX: 'center', anchorY: 'middle' });
    this.word.position.set(x + BLANK / 2, y, 0.002);
    parent.add(this.rule, this.word);
  }

  write(text: string, tone: Tone, seconds = 1.1, upper = false): void {
    this.word.text = upper ? text.toUpperCase() : text;
    this.word.letterSpacing = upper ? 0.08 : 0;
    this.word.color = TONES[tone].clone();
    this.word.sync();
    this.reveal = 0;
    this.target = 1;
    this.wipeRate = 1 / Math.max(0.05, seconds);
    this.blink = false;
  }

  erase(seconds = 0.8): void {
    this.target = 0;
    this.wipeRate = 1 / Math.max(0.05, seconds);
  }

  waiting(on: boolean): void {
    this.blink = on;
  }

  glowRule(v: number): void {
    this.ruleGlow = v;
  }

  center(out = new Vector3()): Vector3 {
    return this.rule.getWorldPosition(out).add(new Vector3(0, SIZE * 0.42, 0));
  }

  get written(): boolean {
    return this.target > 0;
  }

  update(dt: number): void {
    this.t += dt;
    if (this.target > this.reveal) this.reveal = Math.min(this.target, this.reveal + dt * this.wipeRate);
    else if (this.target < this.reveal) this.reveal = Math.max(this.target, this.reveal - dt * this.wipeRate);
    // Wipe: reveal from the left; erasing fades instead.
    const w = Math.max(0.01, textWidth(this.word) + 0.1);
    if (this.target > 0) {
      (this.word as unknown as { clipRect: number[] | null }).clipRect = [-w / 2 - 0.05, -1, -w / 2 - 0.05 + (w + 0.1) * this.reveal, 1];
      this.word.fillOpacity = 1;
    } else {
      (this.word as unknown as { clipRect: number[] | null }).clipRect = null;
      this.word.fillOpacity = this.reveal;
    }
    const blink = this.blink ? 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 3.4)) : this.ruleGlow;
    this.ruleMat.opacity = damp(this.ruleMat.opacity, blink, 8, dt);
  }
}

export class Sentence {
  readonly group = new Group();
  readonly blanks: [Blank, Blank];
  private readonly parts: Text[] = [];
  private opacity = 0;
  private targetOpacity = 1;

  /** `a` = "For to me to live is", `b` = "and to die is" (registered partials of 1:21). */
  constructor(a: string, b: string) {
    const lineH = SIZE * 1.9;
    const p1 = text3d(a, { size: SIZE, anchorX: 'right', anchorY: 'middle' });
    p1.position.set(-GAP, lineH / 2, 0);
    const p2 = text3d(b, { size: SIZE, anchorX: 'right', anchorY: 'middle' });
    p2.position.set(-GAP, -lineH / 2, 0);
    const comma = text3d(',', { size: SIZE, anchorX: 'left', anchorY: 'middle' });
    comma.position.set(GAP + BLANK + 0.01, lineH / 2, 0);
    const stop = text3d('.', { size: SIZE, anchorX: 'left', anchorY: 'middle' });
    stop.position.set(GAP + BLANK + 0.01, -lineH / 2, 0);
    this.parts.push(p1, p2, comma, stop);
    this.group.add(p1, p2, comma, stop);
    this.blanks = [new Blank(this.group, GAP, lineH / 2), new Blank(this.group, GAP, -lineH / 2)];
    // Centre the whole block on the group origin.
    this.group.children.forEach((c) => (c.position.x -= BLANK / 2 - 0.25));
  }

  /** Fade the whole sentence in or out. */
  show(on: boolean): void {
    this.targetOpacity = on ? 1 : 0;
  }

  /** Turn the sentence to face a point (the camera), staying upright. */
  face(p: Vector3): void {
    const g = this.group;
    g.lookAt(new Vector3(p.x, g.position.y, p.z));
  }

  update(dt: number): void {
    this.opacity = damp(this.opacity, this.targetOpacity, 2.2, dt);
    for (const p of this.parts) p.fillOpacity = this.opacity * 0.92;
    for (const b of this.blanks) b.update(dt);
    this.group.visible = this.opacity > 0.01;
  }
}
