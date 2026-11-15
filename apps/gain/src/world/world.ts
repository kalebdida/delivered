// GAIN's persistent world: the cell, the moonbeam, the lamp, the visitor and the chains. Built
// once in `setup`; chapters frame it, light it and add their own pieces under their roots.
import { Group, HemisphereLight, Vector3 } from 'three';
import { Dust, FOG_PRESETS, HeightFog, damp, type CoreContext } from '@delivered/core';
import { Cell } from './cell';
import { Chain } from './chains';
import { Figure } from './figure';
import { Lamp, Papyrus, reedPen } from './lamp';
import { BENCH, CELL, LAMP, RINGS, SEAT } from './layout';
import { Moonbeam } from './moonbeam';

export interface GainCtx extends CoreContext {
  world: World;
}

export type Shot = 'still' | 'ledger' | 'beam' | 'chains' | 'desk' | 'doors';

/** Camera framings in the cell: [position, look-at, fov]. */
export const SHOTS: Record<Shot, [Vector3, Vector3, number]> = {
  still: [new Vector3(0.85, 1.25, 0.95), new Vector3(-1.1, 1.2, -2.05), 56],
  ledger: [new Vector3(0.95, 1.5, 1.35), new Vector3(-0.85, 1.25, -1.45), 50],
  beam: [new Vector3(1.6, 1.0, 1.4), new Vector3(-0.2, 1.1, -1.3), 46],
  chains: [new Vector3(-0.1, 1.15, 0.2), new Vector3(-1.55, 0.75, -1.95), 50],
  desk: [new Vector3(-0.42, 1.12, -1.28), new Vector3(-0.76, 0.43, -2.0), 44],
  doors: [new Vector3(0, 1.55, 2.0), new Vector3(0, 1.35, -1.0), 50],
};

export class World {
  readonly root = new Group();
  readonly cell: Cell;
  readonly beam: Moonbeam;
  readonly lamp: Lamp;
  readonly papyrus: Papyrus;
  readonly pen = reedPen();
  readonly figure = new Figure();
  readonly chains: [Chain, Chain];
  readonly dust: Dust;
  readonly fog: HeightFog;
  readonly ambient: HemisphereLight;
  /** Seconds of world time. */
  time = 0;
  private readonly cellGroup = new Group();
  private camGoal: { pos: Vector3; look: Vector3; fov: number; lambda: number } | null = null;

  constructor(private readonly ctx: GainCtx) {
    const { quality, engine } = ctx;
    const b = quality.budget;
    engine.exposure = 1.25;
    this.fog = new HeightFog(engine.scene, { ...FOG_PRESETS.cell, density: 0.045, heightStrength: 0.4, falloff: 1.1 });

    this.cell = new Cell({ strawCount: Math.min(3600, Math.round(b.maxInstances * 0.75)) });
    this.cellGroup.add(this.cell.group);
    this.beam = new Moonbeam({ tier: quality.tier, shadows: b.shadows, shadowMapSize: b.shadowMapSize, motes: Math.min(1400, Math.round(b.maxParticles / 14)) });
    this.cellGroup.add(this.beam.group);
    this.lamp = new Lamp(LAMP);
    this.cellGroup.add(this.lamp.group);
    this.papyrus = new Papyrus(new Vector3(LAMP.x + 0.2, LAMP.y + 0.004, LAMP.z + 0.17), 0.15);
    this.cellGroup.add(this.papyrus.mesh);
    this.pen.position.set(LAMP.x + 0.24, LAMP.y + 0.012, LAMP.z + 0.02);
    this.pen.rotation.y = -0.35;
    this.cellGroup.add(this.pen);

    // The figure sits on the ledge; the cloak rests on the stone instead of sinking into it.
    this.figure.group.position.set(SEAT.x, 0, SEAT.z);
    this.figure.cloakCollider = (p, i) => {
      const o = i * 3;
      const x = p[o]!;
      const z = p[o + 2]!;
      if (x > BENCH.x0 && x < BENCH.x1 && z > BENCH.z0 && z < BENCH.z1 && p[o + 1]! < BENCH.height + 0.015) p[o + 1] = BENCH.height + 0.015;
      if (z < CELL.z0 + 0.02) p[o + 2] = CELL.z0 + 0.02;
    };
    this.root.add(this.figure.group);
    this.figure.update(0);
    this.chains = [new Chain(RINGS[1], this.figure.wrist(0), 1.5), new Chain(RINGS[0], this.figure.wrist(1), 1.5)];
    for (const c of this.chains) this.root.add(c.mesh);

    // The darkness is never empty: an almost-nothing cool fill so shadows hold shape.
    this.ambient = new HemisphereLight('#33405e', '#1a130d', 0.42);
    this.cellGroup.add(this.ambient);

    this.dust = new Dust({ count: Math.min(500, Math.round(b.maxParticles / 40)), bounds: [2.4, 2, 2.3], color: '#F5C76B', size: 1.6, speed: 0.35, opacity: 0.16, seed: 'cell-dust' });
    this.dust.points.position.set(0, 1.9, 0);
    this.cellGroup.add(this.dust.points);

    this.fog.apply(this.cellGroup);
    this.root.add(this.cellGroup);
    engine.scene.add(this.root);
    // Settle the chains before anyone sees them.
    for (let i = 0; i < 240; i++) this.stepChains(1 / 60);
  }

  /** Distance fog for where we are: the cell's close dark air, or the open night, map or morning. */
  air(kind: 'cell' | 'night' | 'map' | 'morning'): void {
    const presets = {
      cell: { ...FOG_PRESETS.cell, density: 0.045, heightStrength: 0.4, falloff: 1.1 },
      night: { color: '#0a0e1a', density: 0.0065, base: 0, falloff: 0.2, heightStrength: 0.25 },
      map: { color: '#070a14', density: 0.0035, base: 0, falloff: 1, heightStrength: 0 },
      morning: { color: '#eadcc2', density: 0.012, base: 0, falloff: 0.4, heightStrength: 0.2 },
    } as const;
    this.fog.set(presets[kind]);
  }

  /** Show or hide the cell (the later chapters leave it). */
  set inCell(v: boolean) {
    this.cellGroup.visible = v;
    if (v) this.air('cell');
    // The visitor goes with the cell; a chapter outside it shows them again if it needs to.
    this.figure.group.visible = v;
    for (const c of this.chains) c.mesh.visible = v;
  }
  get inCell(): boolean {
    return this.cellGroup.visible;
  }

  /** Fix both chains back to their wall rings and let them settle (chapters that start seated). */
  chainToWall(): void {
    this.chains[0].attach(RINGS[1]);
    this.chains[1].attach(RINGS[0]);
  }

  /** Cut the camera to a framing. */
  cut(shot: Shot): void {
    const [p, l, fov] = SHOTS[shot];
    this.camGoal = null;
    this.ctx.rig.follow(null);
    this.ctx.rig.snapTo(p.clone(), l.clone());
    this.ctx.rig.setFov(fov);
  }

  /** Ease the camera toward a framing (critically damped, so it never overshoots). */
  glide(shot: Shot | [Vector3, Vector3, number], lambda = 1.2): void {
    const [p, l, fov] = typeof shot === 'string' ? SHOTS[shot] : shot;
    this.ctx.rig.follow(null);
    this.camGoal = { pos: p.clone(), look: l.clone(), fov, lambda };
    this.ctx.rig.setFov(fov, 2.5);
  }

  /** Stop any camera glide (a chapter is driving the rig itself). */
  release(): void {
    this.camGoal = null;
  }

  private stepChains(dt: number): void {
    this.chains[0].setEnd(this.figure.wrist(0));
    this.chains[1].setEnd(this.figure.wrist(1));
    for (const c of this.chains) c.step(dt);
  }

  update(dt: number): void {
    this.time += dt;
    const { rig, engine } = this.ctx;
    if (this.camGoal) {
      const g = this.camGoal;
      rig.position.set(damp(rig.position.x, g.pos.x, g.lambda, dt), damp(rig.position.y, g.pos.y, g.lambda, dt), damp(rig.position.z, g.pos.z, g.lambda, dt));
      rig.target.set(damp(rig.target.x, g.look.x, g.lambda, dt), damp(rig.target.y, g.look.y, g.lambda, dt), damp(rig.target.z, g.look.z, g.lambda, dt));
    }
    if (this.figure.group.visible) this.figure.update(dt);
    if (!this.cellGroup.visible) return;
    this.cell.update(dt);
    // Two substeps keep the chain stiff when the wrists move quickly.
    const h = Math.min(dt, 1 / 30) / 2;
    if (h > 0) {
      this.stepChains(h);
      this.stepChains(h);
    }
    for (const c of this.chains) c.update(dt);
    this.lamp.update(dt);
    this.papyrus.light = this.lamp.level;
    this.beam.update(dt, engine.camera);
    this.dust.update(dt);
    this.fog.update();
  }
}
