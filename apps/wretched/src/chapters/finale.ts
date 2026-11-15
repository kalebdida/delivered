// CH6 εὐχαριστῶ (deliverance from outside) · CH7 οὐδὲν … κατάκριμα (no condemnation)
import { AdditiveBlending, Color, Group, Mesh, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import { partial, LightShaft, damp, flashLimiter, glsl, graceFilter, haptic, lerp, smoothstep, type DroneHandle } from '@delivered/core';
import { LINKS } from '../world/chain';
import { PATH } from '../world/layout';
import { heightAt } from '../world/terrain';
import type { WretchedCtx } from '../world/world';
import { WChapter, WordLine, follow } from './base';
import { collapsedPose } from './struggle';

const GOLD = new Color('#F5C76B').multiplyScalar(2.4);
const ASH = new Color('#2b2a2e');
const BELLS = [523.3, 587.3, 659.3, 784, 880, 987.8, 1046.5];

/** A soft beam of light on a camera-facing plane (the cross and the seam in the sky). */
function glowMaterial(color: string, power = 2.4): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uLevel: { value: 0 }, uPower: { value: power } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uLevel, uPower; varying vec2 vUv; ${glsl.dither}
      void main(){
        float x = abs(vUv.x - 0.5) * 2.0; float y = abs(vUv.y - 0.5) * 2.0;
        float core = exp(-x * x * 40.0) * 1.6 + exp(-x * 5.0) * 0.35;
        float ends = smoothstep(1.0, 0.7, y);
        float a = core * ends * uLevel;
        gl_FragColor = vec4(uColor * a * uPower + dither(gl_FragCoord.xy), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
}

// -------------------------------------------------------------------------------------------------
// CH6 · εὐχαριστῶ · I THANK GOD THROUGH JESUS CHRIST
// -------------------------------------------------------------------------------------------------
export class Thanks extends WChapter {
  readonly id = 'thanks';
  override keyMomentAt = 9.5;
  override transitionIn = 'light' as const;
  private cross = new Group();
  private seam!: Mesh;
  private beam!: LightShaft;
  private mats: ShaderMaterial[] = [];
  private pad: DroneHandle | null = null;
  private crossLevel = 0;
  private seamLevel = 0;
  private beamLevel = 0;
  private wave = -1;
  private freed = false;
  private stand = 0;
  private dissolving = false;
  private start = new Vector3();

  async enter(ctx: WretchedCtx): Promise<void> {
    this.crossLevel = this.seamLevel = this.beamLevel = 0;
    this.wave = -1;
    this.freed = false;
    this.stand = 0;
    this.dissolving = false;
    await this.begin(ctx, { z: PATH.arena, chained: true, weight: 0.95, reveal: 0.75, posture: 1 });
    collapsedPose(ctx);
    const w = this.w;
    w.figure.target.head = w.figure.pose.head = -0.5;
    w.setBedLevel(0, 0.5);
    w.autoGrade = false;
    ctx.postfx.params.saturation = 0.22;
    this.start.copy(w.figure.position);
    this.card({ word: 'εὐχαριστῶ', lang: 'grc', translit: 'eucharistō', english: 'I give thanks', ref: 'Romans 7:25', number: 6 });

    // The seam in the sky above the hill, and the cross of light that descends through it.
    const z = PATH.arena - 46;
    this.mats = [glowMaterial('#FFE9B0', 2), glowMaterial('#FFF4DA', 3.2), glowMaterial('#FFF4DA', 3.2)];
    this.seam = new Mesh(new PlaneGeometry(1, 260), this.mats[0]);
    this.seam.position.set(0, 120, z - 30);
    const vertical = new Mesh(new PlaneGeometry(5, 64), this.mats[1]);
    const horizontal = new Mesh(new PlaneGeometry(5, 40), this.mats[2]);
    horizontal.rotation.z = Math.PI / 2;
    horizontal.position.y = 13;
    this.cross.add(vertical, horizontal);
    this.cross.position.set(0, 170, z);
    this.beam = this.own(new LightShaft({ color: '#FFE9B0', length: 10, radiusTop: 0.5, radiusBottom: 0.9, intensity: 0, motes: 160, seed: 'deliver' }));
    this.root.add(this.seam, this.cross, this.beam.group);
    this.pad = this.own(ctx.audio.drone(130.8, 'choir', { level: 0 }));
    ctx.rig.follow(w.figure.group, { offset: new Vector3(1.8, 1.1, 6.2), lookOffset: new Vector3(0, 10.5, -12), spring: 'heavy' }, true);
    ctx.rig.setFov(60, 6);
    this.own(() => ctx.rig.setFov(45, 2));

    // ---- the timeline (see PLAN.md) ----
    this.at(0.5, () => {
      ctx.audio.duck(0.2, 2);
      ctx.audio.chord([65.4, 98, 130.8], { duration: 9, level: 0.25 });
    });
    this.at(1.5, () => {
      this.pad?.setLevel(0.2, 6);
      ctx.rig.addTrauma(0.15);
    });
    this.at(6.8, () => {
      ctx.audio.chord([130.8, 196, 261.6, 329.6, 392], { duration: 10, level: 0.45 });
      ctx.audio.bell(1046.5, { level: 0.5 });
    });
    this.at(7, () => this.strike());
    for (let i = 1; i < LINKS; i++) this.at(7.5 + i * 0.32, () => this.goldLink(i));
    this.at(12, () => {
      this.dissolving = true;
      w.double.face.set(0, 0, -1);
      ctx.audio.chord([196, 246.9, 293.7, 392], { duration: 8, level: 0.3 });
    });
    this.at(13, () => {
      this.wave = 0;
      w.terrainU.uWaveCenter.value.set(w.figure.position.x, w.figure.position.z);
      haptic(25);
    });
    this.at(15, () => {
      w.figure.target.kneel = 0;
      w.figure.target.head = -0.25;
    });
    this.at(17, () => void ctx.ui.scripture.show({ ref: 'Romans 7:25', text: partial('Romans 7:25', 0), position: 'lower', duration: 7 }));
    this.at(18.5, () => {
      w.grace = true;
      w.movable = true;
      w.speedScale = 1.1;
      w.weight = 0;
      ctx.input.addFilter(graceFilter(1.18));
      follow(ctx, 'close');
      w.chain.mesh.visible = false;
      ctx.ui.whisper.show(ctx.t('wretched.whisper.free'), { duration: 5 });
    });
  }

  private strike(): void {
    const { ctx, w } = this;
    this.beamLevel = 1;
    flashLimiter.request(0.5);
    ctx.postfx.flash(0.55);
    ctx.rig.addTrauma(0.35);
    ctx.audio.impact(0.5);
    ctx.audio.bell(523.3, { level: 0.6 });
    haptic([20, 40, 20]);
    w.chain.gold[0] = 1;
    w.detach();
    this.freed = true;
    w.chain.releaseEnd();
    w.sparks.emit(w.chain.linkPosition(0, new Vector3()), 70, GOLD, { speed: 1.8, up: 1.2, life: 2.2 });
  }

  private goldLink(i: number): void {
    const { ctx, w } = this;
    w.chain.gold[i] = 1;
    ctx.audio.bell(BELLS[i % BELLS.length]! * (i > 6 ? 2 : 1), { level: 0.18 });
    w.sparks.emit(w.chain.linkPosition(i, new Vector3()), 26, GOLD, { speed: 0.8, up: 0.9, life: 2.4, spread: 0.15 });
  }

  update(dt: number): void {
    this.runEvents();
    const { ctx, w } = this;
    const t = this.time;
    const cam = ctx.engine.camera.position;

    // Seam opens, the cross descends vast and slow.
    this.seamLevel = smoothstep(0.2, 2.2, t) * (1 - smoothstep(9, 13, t) * 0.7);
    this.seam.scale.x = 0.5 + smoothstep(0.5, 6, t) * 9;
    this.crossLevel = smoothstep(1.5, 5, t);
    const descent = smoothstep(1.5, 7.5, t);
    this.cross.position.y = lerp(170, 46, descent * descent * (3 - 2 * descent));
    this.cross.lookAt(cam.x, this.cross.position.y, cam.z);
    this.seam.lookAt(cam.x, this.seam.position.y, cam.z);
    this.mats[0]!.uniforms.uLevel!.value = this.seamLevel;
    this.mats[1]!.uniforms.uLevel!.value = this.crossLevel;
    this.mats[2]!.uniforms.uLevel!.value = this.crossLevel;
    w.beacon.level = 1 + this.crossLevel * 0.8;

    // The beam from the cross to the ankle.
    const ankle = w.figure.ankle(new Vector3());
    const top = this.cross.position.clone().setY(this.cross.position.y + 6);
    const dir = ankle.clone().sub(top);
    const len = dir.length();
    this.beam.group.position.copy(top);
    this.beam.group.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), dir.normalize());
    this.beam.group.scale.set(1, len / 10, 1);
    this.beamLevel = Math.max(0, this.beamLevel - dt * (t > 12 ? 0.3 : 0.02));
    this.beam.intensity = this.beamLevel * 1.3;
    this.beam.update(dt);

    // Gold links fade away one by one, as dust.
    for (let i = 0; i < LINKS; i++) {
      if (w.chain.gold[i]! > 0) {
        w.chain.gone[i] = Math.min(1, w.chain.gone[i]! + dt * 0.7);
        if (Math.random() < dt * 8 && w.chain.gone[i]! < 1) w.sparks.emit(w.chain.linkPosition(i, new Vector3()), 2, GOLD, { speed: 0.3, up: 0.6, life: 2 });
      }
    }

    // The double stands, faces the light, its eyes go out, and the wind carries it off as ash.
    if (this.dissolving) {
      this.stand = Math.min(1, this.stand + dt / 3);
      w.double.posture = 1 + this.stand;
      w.double.reveal = 1;
      w.double.eyeLevel = Math.max(0, 1 - (t - 12) / 3.5);
      w.double.dissolve = smoothstep(14, 21, t);
      if (Math.random() < dt * 20 && w.double.dissolve < 0.95) {
        w.sparks.emit(w.double.pelvis(new Vector3()).add(new Vector3(0, 0.4, 0)), 3, ASH, { speed: 0.4, up: 0.8, life: 3, spread: 0.8, wind: new Vector3(0.8, 0.3, 1) });
      }
    }

    // The colour wave rolls out; the law's light warms to gold. Fulfilled, never destroyed.
    if (this.wave >= 0) {
      this.wave += dt * 14;
      w.terrainU.uWave.value = this.wave;
      w.monoliths.warmth = Math.min(1, w.monoliths.warmth + dt * 0.25);
      ctx.postfx.params.saturation = damp(ctx.postfx.params.saturation ?? 0.22, 1.05, 0.6, dt);
      w.weight = damp(w.weight, 0, 1, dt);
    }
    if (t > 22 && (w.figure.position.distanceTo(this.start) > 6 || t > 40)) this.complete();
    void heightAt;
    void this.freed;
  }
}

// -------------------------------------------------------------------------------------------------
// CH7 · οὐδὲν … κατάκριμα · NO CONDEMNATION
// -------------------------------------------------------------------------------------------------
export class NoCondemnation extends WChapter {
  readonly id = 'no-condemnation';
  override keyMomentAt = 9.5;
  override transitionIn = 'light' as const;
  private warm: DroneHandle | null = null;
  private flickers = [PATH.arena - 28, PATH.arena - 58];
  private summitAt = -1;
  private line: WordLine | null = null;

  async enter(ctx: WretchedCtx): Promise<void> {
    this.summitAt = -1;
    this.flickers = [PATH.arena - 28, PATH.arena - 58];
    const shot = new URLSearchParams(location.search).has('shot');
    await this.begin(ctx, { z: shot ? PATH.summit + 3 : PATH.arena - 4, chained: false, weight: 0 });
    const w = this.w;
    w.double.visible = false;
    w.chain.mesh.visible = false;
    w.grace = true;
    w.speedScale = 1.45;
    w.autoGrade = false;
    w.monoliths.warmth = 1;
    w.terrainU.uWave.value = 600;
    w.terrainU.uWaveCenter.value.set(0, PATH.arena);
    w.beacon.level = 1.3;
    ctx.postfx.params.saturation = 1.05;
    ctx.input.addFilter(graceFilter(1.18));
    this.card({ word: 'οὐδὲν … κατάκριμα', lang: 'grc', translit: 'ouden … katakrima', english: 'no condemnation', ref: 'Romans 8:1', number: 7 });
    this.warm = this.own(ctx.audio.drone(130.8, 'warm', { level: 0 }));
    this.warm.setLevel(0.2, 5);
    this.own(ctx.audio.drone(196, 'choir', { level: 0 })).setLevel(0.08, 8);
    this.own(() => {
      this.line?.remove();
      this.line = null;
      ctx.postfx.fadeTo('white', 0, 1);
    });
    if (shot) this.at(4, () => this.summit());
  }

  /** 7:25b: the struggle still flickers in this life, but every flicker is absorbed by grace. */
  private flicker(first: boolean): void {
    const { ctx, w } = this;
    ctx.postfx.glitchBurst(0.12, 0.15);
    ctx.audio.stutter({ level: 0.15 });
    const p = w.figure.position;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      w.sparks.emit(new Vector3(p.x + Math.cos(a) * 0.5, p.y + 0.9, p.z + Math.sin(a) * 0.5), 1, GOLD, {
        speed: 0.1, up: 0.1, life: 1, wind: new Vector3(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4),
      });
    }
    ctx.audio.bell(784, { level: 0.25 });
    if (first) void ctx.ui.scripture.show({ ref: 'Romans 7:25', text: partial('Romans 7:25', 1), position: 'upper', duration: 7 });
  }

  private summit(): void {
    const { ctx, w } = this;
    this.summitAt = this.time;
    w.movable = false;
    w.figure.target.reach = 0;
    w.figure.target.head = -0.35;
    ctx.ui.whisper.hide();
    ctx.audio.chord([130.8, 196, 261.6, 329.6, 392, 523.3], { duration: 12, level: 0.4 });
    ctx.rig.follow(w.figure.group, { ...(window.innerWidth < window.innerHeight ? { offset: new Vector3(3.4, 2.4, 7.4), lookOffset: new Vector3(-1.2, 2.6, -2) } : { offset: new Vector3(3.2, 1.2, 3.6), lookOffset: new Vector3(-1.4, 1.6, -2) }), spring: 'heavy' });
    const s = this.summitAt;
    this.at(s + 0.5, () => ctx.postfx.fadeTo('white', 0.08, 5));
    this.at(s + 1, () => void ctx.ui.scripture.show({ ref: 'Romans 8:1', position: 'lower', duration: 7.5 }));
    this.at(s + 9.5, () => void ctx.ui.scripture.show({ ref: 'Romans 8:2', position: 'lower', duration: 7 }));
    this.at(s + 17.5, () => {
      this.line = new WordLine(ctx.t('wretched.closing'));
      this.line.reveal(1);
    });
    this.at(s + 24, () => this.complete());
  }

  update(dt: number): void {
    this.runEvents();
    const w = this.w;
    const z = w.figure.position.z;
    if (this.flickers.length && z < this.flickers[0]!) {
      this.flickers.shift();
      this.flicker(this.flickers.length === 1);
    }
    const toLight = 1 - Math.min(1, Math.max(0, (z - PATH.summit) / (PATH.arena - PATH.summit)));
    this.warm?.setFreq(130.8 + toLight * 65.4, 0.5);
    if (this.summitAt < 0) {
      w.beacon.level = 1.3 + toLight * 1.2;
      if (z <= PATH.summit + 0.6) this.summit();
    } else {
      w.beacon.level = damp(w.beacon.level, 1.7, 0.6, dt);
    }
  }
}
