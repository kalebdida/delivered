// CH4 · συνέχομαι · HARD PRESSED BETWEEN THE TWO (Philippians 1:22-24).
//
// The cell is split by light into two doorways in its right wall. On the visitor's left,
// ἀναλῦσαι, "to depart and be with Christ, which is far better": radiant and peaceful, and
// SEALED with a veil of light. Coming near, the veil gently pushes back and says "not yet". It
// cannot be opened, ever: there is no code path that opens it, and every step goes through
// `resolveVeil` (see logic/doors.ts and its tests). On the right, ἐπιμένειν, "to remain ... for
// your sake": the ordinary heavy door, with people's voices behind it. It opens.
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, PlaneGeometry, PointLight, ShaderMaterial, TorusGeometry, Vector3 } from 'three';
import { announce, clamp, damp, easing, glsl, haptic, partial, type DroneHandle, type SoundHandle } from '@delivered/core';
import { DEPART, request, resolveVeil, type Point2, type Veil } from '../logic/doors';
import { CELL, DOOR } from '../world/layout';
import { text3d } from '../world/text3d';
import { GChapter } from './base';
import type { GainCtx } from '../world/world';

/** The depart doorway, on the right wall, to the visitor's left of the ordinary door. */
const DEPART_Z = -1.35;
const WALL_X = CELL.x1;
/** The right wall in the veil's frame: vx = world z, vz = -world x; the room is vz > -WALL_X. */
const toVeil = (x: number, z: number): Point2 => ({ x: z, z: -x });
const fromVeil = (p: Point2): { x: number; z: number } => ({ x: -p.z, z: p.x });
const VEIL: Veil = { center: { x: DEPART_Z, z: -WALL_X }, radius: 0.95 };
const SAFE = { x: 0.2, z: -0.1 };

const VEIL_FRAG = /* glsl */ `
uniform float uTime, uPush, uOpen; varying vec2 vUv;
${glsl.hash}
${glsl.simplex3D}
${glsl.dither}
void main(){
  vec2 p = vUv - vec2(0.5, 0.0);
  // An arched doorway shape.
  float arch = step(abs(p.x), 0.5) * step(vUv.y, 0.78 + sqrt(max(0.0, 0.25 - p.x * p.x)) * 0.44);
  float folds = 0.6 + 0.4 * snoise(vec3(p.x * 9.0, vUv.y * 2.0 - uTime * 0.25, uTime * 0.15));
  float ripple = uPush * sin(length(p - vec2(0.0, 0.45)) * 40.0 - uTime * 9.0) * 0.25;
  float core = smoothstep(0.55, 0.0, abs(p.x)) * (0.6 + 0.4 * vUv.y);
  vec3 c = mix(vec3(1.0, 0.9, 0.7), vec3(1.0, 0.97, 0.92), vUv.y) * (core * 0.55 + folds * 0.55 + ripple) * arch;
  gl_FragColor = vec4(c * (1.05 + uPush * 0.6) + dither(gl_FragCoord.xy), 1.0);
}`;

export class Doors extends GChapter {
  readonly id = 'doors';
  override keyMomentAt = 9;
  override transitionIn = 'light' as const;

  private veilMat!: ShaderMaterial;
  private push = 0;
  private pushVel = new Vector3();
  private notYetAt = -10;
  private opening = 0;
  private opened = false;
  private still: DroneHandle | null = null;
  private voices: SoundHandle | null = null;
  private warm!: PointLight;
  private doorGlow!: ShaderMaterial;
  private nextVoice = 2;

  enter(ctx: GainCtx): void {
    this.begin(ctx, { walk: true });
    const w = ctx.world;
    w.inCell = true;
    this.opened = false;
    this.opening = this.push = 0;
    // The visitor stands in the middle of the cell. The chains stay on the wrists; their wall
    // ends have come loose, so they drag behind.
    w.figure.group.position.set(0.05, 0, -0.35);
    w.figure.heading = Math.PI / 2;
    w.figure.sit = 0;
    w.figure.kneel = 0;
    w.figure.settle();
    for (const c of w.chains) {
      c.detach();
      c.warmth = 0.6;
    }
    w.lamp.target = 0.5;
    w.beam.intensity = 0.8;
    w.cell.door.rotation.y = 0;
    ctx.rig.follow(w.figure.group, { offset: new Vector3(-2.25, 1.7, 0.1), lookOffset: new Vector3(1.6, 1.15, -0.25), spring: 'gentle' }, true);
    // A narrow screen needs a taller view to hold both doors and the visitor.
    ctx.rig.setFov(ctx.engine.camera.aspect < 0.9 ? 78 : 50);

    // The depart doorway: a veil of light in an arch, with its words above it.
    const g = new Group();
    g.position.set(WALL_X - 0.03, 0, DEPART_Z);
    g.rotation.y = -Math.PI / 2;
    this.veilMat = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPush: { value: 0 }, uOpen: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: VEIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    const veil = new Mesh(new PlaneGeometry(1.05, 2.35), this.veilMat);
    veil.position.y = 2.35 / 2;
    veil.renderOrder = 12;
    const frame = new Mesh(new TorusGeometry(0.55, 0.02, 8, 48, Math.PI), new ShaderMaterial({ vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main(){ gl_FragColor = vec4(vec3(1.0, 0.85, 0.55) * 2.6, 1.0); }' }));
    frame.position.y = 1.85;
    const glow = new PointLight('#fff1d0', 7, 5, 1.4);
    glow.position.set(0, 1.4, 0.5);
    g.add(veil, frame, glow);
    const word = text3d('ἀναλῦσαι', { font: 'greek', size: 0.12, color: new Color('#FFE9B0').multiplyScalar(1.8) });
    word.position.set(0, 2.72, 0.02);
    const line = text3d(partial('Philippians 1:23', 0), { size: 0.06, color: '#e9dcc4', maxWidth: 1.4 });
    line.position.set(0, 2.52, 0.02);
    g.add(word, line);
    this.root.add(g);

    // The remain door: the ordinary door, warm light under it and through its cracks.
    const r = new Group();
    r.position.set(WALL_X - 0.12, 0, DOOR.z);
    r.rotation.y = -Math.PI / 2;
    const word2 = text3d('ἐπιμένειν', { font: 'greek', size: 0.12, color: new Color('#F5C76B').multiplyScalar(1.6) });
    word2.position.set(0, DOOR.h + 0.45, 0.02);
    const line2 = text3d(partial('Philippians 1:24', 0), { size: 0.06, color: '#e9dcc4', maxWidth: 1.4 });
    line2.position.set(0, DOOR.h + 0.27, 0.02);
    this.doorGlow = new ShaderMaterial({
      uniforms: { uOpen: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uOpen; varying vec2 vUv; void main(){ float under = smoothstep(0.05, 0.0, vUv.y); float edge = smoothstep(0.03, 0.0, min(vUv.x, 1.0 - vUv.x)) + smoothstep(0.02, 0.0, 1.0 - vUv.y); gl_FragColor = vec4(vec3(1.0, 0.7, 0.36) * ((under * 2.6 + edge * 1.2) + uOpen * 2.4), 1.0); }',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const leak = new Mesh(new PlaneGeometry(DOOR.w + 0.04, DOOR.h + 0.02), this.doorGlow);
    leak.position.set(0, DOOR.h / 2, -0.08);
    r.add(word2, line2, leak);
    this.warm = new PointLight('#ffb25c', 1.2, 6, 1.6);
    this.warm.position.set(WALL_X + 0.6, 1.2, DOOR.z);
    // Morning spilling under and around the door onto the floor of the cell.
    const spill = new PointLight('#ffb25c', 2.2, 3.2, 1.5);
    spill.position.set(WALL_X - 0.35, 0.12, DOOR.z);
    this.root.add(spill);
    this.root.add(r, this.warm);

    // Two textures in stereo: a pure, high, still tone at the left door; warm voices at the right.
    const left = ctx.audio.spatial({ refDistance: 1.5 });
    left.follow(veil);
    this.still = this.own(ctx.audio.drone(1318.5, 'glass', { level: 0.05, to: left.input }));
    this.own(left);
    const right = ctx.audio.spatial({ refDistance: 1.5 });
    right.follow(leak);
    this.voices = this.own(ctx.audio.crowd({ level: 0.12, voices: 5 }));
    this.own(right);

    this.card({ word: 'συνέχομαι', lang: 'grc', translit: 'synechomai', english: 'I am hard pressed', ref: 'Philippians 1:23', number: 4 });
    this.at(4.6, () => void ctx.ui.scripture.show({ ref: 'Philippians 1:23-24', position: 'upper', duration: 9 }));
    this.at(6, () => ctx.ui.hud.set('bottom-center', ctx.t(ctx.input.device === 'touch' ? 'gain.doors.hintTouch' : 'gain.doors.hint')));
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx } = this;
    const w = ctx.world;
    const fig = w.figure;
    this.veilMat.uniforms.uTime!.value += dt;
    this.push = damp(this.push, 0, 2.5, dt);
    this.veilMat.uniforms.uPush!.value = this.push;

    if (!this.opened) {
      // Walk, relative to the camera.
      const { moveX, moveY } = ctx.input.filtered;
      const cam = ctx.engine.camera;
      const f = cam.getWorldDirection(new Vector3()).setY(0).normalize();
      const r = new Vector3().crossVectors(f, new Vector3(0, 1, 0));
      const v = f.multiplyScalar(moveY).add(r.multiplyScalar(moveX));
      if (v.lengthSq() > 1) v.normalize();
      const speed = 1.15;
      const pos = fig.group.position;
      const next = pos.clone().addScaledVector(v, speed * dt).addScaledVector(this.pushVel, dt);
      this.pushVel.multiplyScalar(Math.exp(-dt * 3));
      // Stay inside the cell.
      next.x = clamp(next.x, CELL.x0 + 0.35, CELL.x1 - 0.3);
      next.z = clamp(next.z, CELL.z0 + 0.5, CELL.z1 - 0.35);
      // The veil: whatever the step, the visitor stays on this side of it.
      const res = resolveVeil(VEIL, toVeil(pos.x, pos.z), toVeil(next.x, next.z), toVeil(SAFE.x, SAFE.z));
      const p = fromVeil(res.p);
      if (res.pushed) {
        // A gentle push back into the room, and the calm line.
        this.pushVel.set(-1.1, 0, 0);
        this.push = Math.min(1, this.push + 0.6);
        if (request('depart') === 'not-yet' && this.time - this.notYetAt > 3.5) {
          this.notYetAt = this.time;
          ctx.ui.whisper.show(ctx.t('gain.doors.notYet'), { duration: 2.8 });
          announce(ctx.t('gain.doors.notYet'));
          ctx.audio.bell(1318.5, { level: 0.08, duration: 3 });
          haptic(8);
        }
      }
      const moved = Math.hypot(p.x - pos.x, p.z - pos.z) / Math.max(dt, 1e-4);
      pos.set(p.x, 0, p.z);
      fig.speed = damp(fig.speed, moved, 8, dt);
      if (v.lengthSq() > 0.01) fig.heading = damp(fig.heading, Math.atan2(v.x, v.z), 6, dt);
      // Near the right door: it opens.
      const dRemain = Math.hypot(pos.x - (WALL_X - 0.5), pos.z - DOOR.z);
      if (dRemain < 0.75 && request('remain') === 'open') {
        this.opened = true;
        ctx.ui.hud.clear();
        ctx.input.enabled = false;
        ctx.audio.ui.open();
        this.voices?.setLevel(0.3, 2);
        this.still?.setLevel(0.02, 2);
      }
    } else {
      // The door swings; warm morning light pours in; the visitor walks into it.
      this.opening = Math.min(1, this.opening + dt / 2.2);
      const k = easing.inOutCubic(this.opening);
      w.cell.door.rotation.y = k * 1.7;
      this.doorGlow.uniforms.uOpen!.value = k;
      this.warm.intensity = 1.2 + k * 22;
      const pos = fig.group.position;
      pos.lerp(new Vector3(WALL_X - 0.25, 0, DOOR.z), dt * 0.9);
      fig.heading = damp(fig.heading, Math.PI / 2, 4, dt);
      fig.speed = 0.5;
      if (this.opening >= 1 && this.flag('out')) {
        ctx.postfx.fadeTo('white', 1, 1.6);
        this.at(this.time + 1.7, () => this.complete());
      }
    }
    // The seal never changes.
    void DEPART.state;
  }

  private flags = new Set<string>();
  private flag(k: string): boolean {
    if (this.flags.has(k)) return false;
    this.flags.add(k);
    return true;
  }

  override exit(): void {
    const { ctx } = this;
    const w = ctx.world;
    this.flags.clear();
    w.cell.door.rotation.y = 0;
    ctx.rig.follow(null);
    ctx.input.enabled = true;
    w.figure.speed = 0;
  }
}
