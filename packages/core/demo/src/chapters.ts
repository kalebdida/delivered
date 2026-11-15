// The demo chapters. Each one is a small, complete example of how a room chapter is written:
// build under `this.root`, register cleanup with `this.own()`, animate in `update()`.
import {
  AmbientLight, BoxGeometry, CapsuleGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, IcosahedronGeometry,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, Plane, PointLight, Raycaster, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import {
  Chapter, CloudField, Dust, FOG_PRESETS, HeightFog, LightShaft, RopeMesh, Sky, breath, corruptionFilter, createChain, createCrumble,
  createNoise, createRagdoll, createRope, damp, graceFilter, palette, t, type Chain, type CoreContext, type Crumble, type Ragdoll, type Verlet,
} from '@delivered/core';

const stone = (color = '#3a3530') => new MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 });

/** Shared helpers the control panel calls into. */
export const demoState = {
  breakChain: () => {},
  dropRagdoll: () => {},
  crumble: () => {},
  toggleCorruption: (): boolean => false,
  toggleGrace: (): boolean => false,
};

// -------------------------------------------------------------------------------------------------
// 0 · LIGHT: a draggable glowing orb under a light shaft, a Verlet rope, dust, night sky
// -------------------------------------------------------------------------------------------------
export class LightChapter extends Chapter {
  readonly id = 'light';
  override keyMomentAt = 4;
  private orb!: Mesh;
  private orbLight!: PointLight;
  private shaft!: LightShaft;
  private dust!: Dust;
  private sky!: Sky;
  private rope!: Verlet;
  private ropeMesh!: RopeMesh;
  private target = new Vector3(0, 1.1, 0);
  private dragging = false;
  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 0, 1), 0);
  private ndc = new Vector2();
  private hit = new Vector3();

  enter(ctx: CoreContext): void {
    const { engine, rig, postfx } = ctx;
    postfx.setPreset('cinematic');
    postfx.params.dof = false;
    engine.exposure = 1;
    rig.snapTo(new Vector3(0, 1.7, 7.2), new Vector3(0, 1.2, 0));
    rig.setFov(40);

    this.sky = this.own(new Sky());
    this.sky.setTime(0);
    this.sky.set({ zenith: '#05060f', horizon: '#11122a', stars: 0.9, sunIntensity: 0, sunGlow: 0.15 });
    this.root.add(this.sky.mesh);
    const fog = this.own(new HeightFog(engine.scene, { ...FOG_PRESETS.groundHaze, color: '#0d0e1c', density: 0.02, heightStrength: 0.3 }));

    const ground = new Mesh(new CircleGeometry(40, 64), stone('#15151c'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    fog.apply(ground);

    // Midground subject: the orb. Emissive above 1.0 so only it blooms.
    this.orb = new Mesh(
      new SphereGeometry(0.34, 48, 32),
      new MeshStandardMaterial({ color: palette.gold, emissive: new Color(palette.gold), emissiveIntensity: 2.6, roughness: 0.3 }),
    );
    this.orb.position.copy(this.target);
    this.orbLight = new PointLight(palette.goldLight, 14, 14, 1.8);
    this.orb.add(this.orbLight);
    this.root.add(this.orb);

    // Standing stones give the light something to rake across (key + rim).
    for (const [x, z, h, r] of [[-2.6, -1.6, 2.6, 0.2], [2.9, -2.2, 3.4, -0.15], [-4.4, -4, 4.2, 0.1], [4.8, -5, 5, 0.05]] as const) {
      const m = new Mesh(new BoxGeometry(0.7, h, 0.5), stone('#2a2a33'));
      m.position.set(x, h / 2, z);
      m.rotation.y = r * 3;
      m.rotation.z = r * 0.2;
      m.castShadow = m.receiveShadow = true;
      this.root.add(m);
      fog.apply(m);
    }
    const rim = new DirectionalLight('#8fa8ff', 2.4);
    rim.position.set(-6, 5, -8);
    this.root.add(rim, new AmbientLight('#3a3e66', 1.1));

    this.shaft = this.own(new LightShaft({ color: '#CFE0FF', length: 9, radiusTop: 0.25, radiusBottom: 2.1, intensity: 0.55, motes: 320 }));
    this.shaft.group.position.set(1.3, 9, -0.6);
    this.shaft.group.rotation.z = 0.14;
    this.root.add(this.shaft.group);

    this.dust = this.own(new Dust({ count: Math.min(900, ctx.quality.budget.maxParticles), bounds: [9, 4, 7], color: palette.gold, size: 3, opacity: 0.55 }));
    this.dust.points.position.set(0, 3, 0);
    this.root.add(this.dust.points);

    // A Verlet rope strung between two stones, one end tied to the orb.
    this.rope = createRope([-2.6, 2.5, -1.6], [0, 1.1, 0], 28, { iterations: 8, slack: 1.25, damping: 0.99 });
    this.rope.pin(0);
    this.rope.pin(28);
    this.rope.wind = (x, _y, _z, time) => [Math.sin(time * 0.7 + x) * 0.8, 0, Math.cos(time * 0.5) * 0.6];
    this.ropeMesh = this.own(new RopeMesh(this.rope, { radius: 0.014, color: '#6f6a78', rimColor: palette.goldLight }));
    this.root.add(this.ropeMesh.mesh);

    const canvas = engine.renderer.domElement;
    const move = (e: PointerEvent) => {
      this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      this.ray.setFromCamera(this.ndc, engine.camera);
      const over = this.ray.intersectObject(this.orb).length > 0;
      ctx.ui.cursor.setLabel(over || this.dragging ? t('core.cursor.drag') : null);
      if (this.dragging && this.ray.ray.intersectPlane(this.plane, this.hit)) {
        this.target.set(Math.max(-3.4, Math.min(3.4, this.hit.x)), Math.max(0.5, Math.min(3.2, this.hit.y)), 0);
      }
    };
    const down = (e: PointerEvent) => {
      move(e);
      if (this.ray.intersectObject(this.orb).length) {
        this.dragging = true;
        ctx.audio.pluck(196, { level: 0.35 });
      }
    };
    const up = () => (this.dragging = false);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    this.own(() => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      ctx.ui.cursor.setLabel(null);
    });
    ctx.ui.whisper.show(t('core.whisper.drag'), { duration: 6 });
  }

  override fixedUpdate(dt: number): void {
    this.rope.step(dt);
  }

  update(dt: number): void {
    const b = breath(this.time, 5);
    this.orb.position.x = damp(this.orb.position.x, this.target.x, 6, dt);
    this.orb.position.y = damp(this.orb.position.y, this.target.y + Math.sin(this.time * 0.8) * 0.06, 6, dt);
    (this.orb.material as MeshStandardMaterial).emissiveIntensity = 2.2 + b * 0.9;
    this.orbLight.intensity = 11 + b * 6;
    this.rope.movePin(28, this.orb.position.x, this.orb.position.y, this.orb.position.z);
    this.ropeMesh.update();
    this.shaft.update(dt);
    this.shaft.intensity = 0.5 + b * 0.18;
    this.dust.update(dt);
    this.sky.update(dt);
    this.ctx.postfx.params.focusDistance = this.ctx.engine.camera.position.distanceTo(this.orb.position);
  }
}

// -------------------------------------------------------------------------------------------------
// 1 · WEIGHT: Rapier chain (breakable), ragdoll, crumbling platform
// -------------------------------------------------------------------------------------------------
export class WeightChapter extends Chapter {
  readonly id = 'weight';
  override keyMomentAt = 5;
  private chain: Chain | null = null;
  private ragdoll: Ragdoll | null = null;
  private crumble: Crumble | null = null;
  private dust!: Dust;
  private linkMeshes: Mesh[] = [];
  private weight!: Mesh;

  enter(ctx: CoreContext): void {
    const { engine, rig, postfx } = ctx;
    const physics = ctx.physics!;
    postfx.setPreset('cinematic');
    rig.snapTo(new Vector3(-0.2, 2.6, 8.6), new Vector3(-0.2, 2.3, 0));
    rig.setFov(40);
    const fog = this.own(new HeightFog(engine.scene, { ...FOG_PRESETS.groundHaze, color: '#17130f', density: 0.022, heightStrength: 0.3 }));
    engine.scene.background = new Color('#0b0907');

    const groundBody = physics.addGround(0);
    this.own(() => physics.remove(groundBody));
    const ground = new Mesh(new CircleGeometry(40, 64), stone('#221d18'));
    ground.rotation.x = -Math.PI / 2;
    this.root.add(ground);

    const key = new DirectionalLight('#ffc98a', 5);
    key.position.set(5, 8, 5);
    engine.setupShadowLight(key, 9, 30);
    const rim = new DirectionalLight('#9db8ff', 2.6);
    rim.position.set(-6, 4, -7);
    this.root.add(key, rim, new AmbientLight('#4a3f38', 1.2));

    // Chain: hangs from a beam, carries an iron weight, snaps when stretched too far.
    const beam = new Mesh(new BoxGeometry(3, 0.25, 0.3), stone('#3a3530'));
    beam.position.set(-3, 4.6, 0);
    this.root.add(beam);
    const anchor = physics.addBox({ x: -3, y: 4.6, z: 0 }, { x: 1.5, y: 0.12, z: 0.15 }, { type: 'fixed' });
    const weightBody = physics.addBall({ x: -3, y: 1.9, z: 0 }, 0.32, { density: 9 });
    this.weight = new Mesh(new IcosahedronGeometry(0.32, 2), new MeshStandardMaterial({ color: '#5c5a5e', roughness: 0.45, metalness: 0.9 }));
    this.root.add(this.weight);
    physics.bind(this.weight, weightBody);
    this.chain = createChain(physics, {
      from: { x: -3, y: 4.4, z: 0 }, to: { x: -3, y: 2.3, z: 0 }, links: 14, radius: 0.045,
      fromBody: anchor, fromAnchor: { x: 0, y: -0.12, z: 0 }, toBody: weightBody, toAnchor: { x: 0, y: 0.32, z: 0 },
      breakStretch: 0.22,
      onBreak: () => {
        ctx.audio.chainSnap();
        ctx.rig.addTrauma(0.35);
      },
    });
    const iron = new MeshStandardMaterial({ color: '#77757a', roughness: 0.4, metalness: 0.95 });
    const linkGeo = new TorusGeometry(0.075, 0.02, 8, 18);
    this.chain.links.forEach((body, i) => {
      const holder = new Group();
      const m = new Mesh(linkGeo, iron);
      m.scale.set(0.75, 1.25, 1);
      m.rotation.y = i % 2 ? Math.PI / 2 : 0;
      m.castShadow = true;
      holder.add(m);
      this.root.add(holder);
      physics.bind(holder, body);
      this.linkMeshes.push(m);
    });
    this.own(() => {
      this.chain?.dispose();
      physics.remove(anchor);
      physics.remove(weightBody);
    });
    demoState.breakChain = () => {
      weightBody.applyImpulse({ x: 26, y: -30, z: 4 }, true);
      ctx.audio.chainRattle(0.9);
    };

    // Crumbling platform with a ragdoll standing on it.
    this.crumble = createCrumble(physics, {
      position: { x: 2.2, y: 2.2, z: 0 }, width: 3.6, depth: 2.4, thickness: 0.3, chunks: Math.min(22, ctx.quality.budget.maxBodies / 3),
      material: stone('#6b6259'), seed: 'demo',
    });
    this.root.add(this.crumble.group);
    for (const x of [0.7, 3.7]) {
      const leg = new Mesh(new CylinderGeometry(0.16, 0.2, 2.05, 12), stone('#3a3530'));
      leg.position.set(x, 1.02, 0);
      leg.castShadow = true;
      this.root.add(leg);
    }
    this.own(() => this.crumble?.dispose());
    demoState.crumble = () => {
      this.crumble?.collapse({ x: 2.2, z: 0 }, 1.1);
      ctx.audio.crumble(0.8);
      ctx.rig.addTrauma(0.5);
    };

    const spawn = () => {
      this.ragdoll?.dispose();
      this.ragdoll = createRagdoll(physics, {
        position: { x: 2.2, y: 3.5, z: 0 }, material: new MeshStandardMaterial({ color: '#d8cfbf', roughness: 0.8, emissive: '#3a2a18', emissiveIntensity: 0.4 }),
      });
      this.root.add(this.ragdoll.group);
    };
    spawn();
    this.own(() => this.ragdoll?.dispose());
    demoState.dropRagdoll = () => {
      spawn();
      ctx.audio.impact(0.3);
    };

    engine.castShadows(this.root, true, true);
    ground.castShadow = false;
    fog.apply(this.root);
    this.dust = this.own(new Dust({ count: 500, bounds: [8, 3, 5], color: '#ffb25c', size: 3, opacity: 0.4 }));
    this.dust.points.position.y = 2.5;
    this.root.add(this.dust.points);
    this.own(() => (engine.scene.background = new Color(palette.ink)));
  }

  override fixedUpdate(dt: number): void {
    this.crumble?.update(dt);
  }

  update(dt: number): void {
    this.dust.update(dt);
  }
}

// -------------------------------------------------------------------------------------------------
// 2 · SKY: volumetric clouds at golden hour, a light shaft, a small figure for scale
// -------------------------------------------------------------------------------------------------
export class SkyChapter extends Chapter {
  readonly id = 'sky';
  override keyMomentAt = 4;
  private sky!: Sky;
  private clouds!: CloudField;
  private wisps!: CloudField;
  private shaft!: LightShaft;
  private figure!: Mesh;

  enter(ctx: CoreContext): void {
    const { engine, rig, postfx } = ctx;
    postfx.setPreset('dream');
    postfx.params.bloom = 0.5;
    rig.snapTo(new Vector3(-1.5, 2.6, 14), new Vector3(0.6, 0.4, 0));
    rig.setFov(44);
    this.sky = this.own(new Sky());
    this.sky.azimuth = Math.PI + 0.5;
    this.sky.setTime(6.7);
    this.root.add(this.sky.mesh);

    const common = { lightDirection: this.sky.sunDirection, lightColor: '#fff0cf', shadowColor: '#7a6f9c', hazeColor: '#f2b866' };
    this.clouds = this.own(new CloudField({ tier: ctx.quality.tier, base: -26, top: -3, extent: 260, coverage: 0.62, scale: 70, wind: [1.6, 0, 0.5], ...common }));
    this.wisps = this.own(new CloudField({ mode: 'billboard', count: 26, base: 0.5, top: 7, extent: 60, coverage: 0.35, density: 0.5, scale: 16, wind: [0.9, 0, 0.2], seed: 'wisps', ...common }));
    this.root.add(this.clouds.object, this.wisps.object);

    const key = new DirectionalLight('#ffd9a0', 3.4);
    key.position.copy(this.sky.sunDirection).multiplyScalar(40);
    const rim = new DirectionalLight('#9fb6ff', 0.8);
    rim.position.set(-8, 6, 10);
    this.root.add(key, rim, new AmbientLight('#8c86b8', 0.9));

    // A floating shard of rock with a tiny figure: the midground subject.
    const rockGeo = new IcosahedronGeometry(2.6, 24);
    const noise = createNoise('island');
    const pos = rockGeo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = noise.fbm3(x * 0.45, y * 0.45, z * 0.45, 4);
      // Flat on top, tapering to a ragged point underneath.
      const up = y > 0 ? 0.16 : 1.5;
      const taper = y > 0 ? 1 : Math.max(0.12, 1 - Math.pow(-y / 2.6, 1.4) * 0.9);
      pos.setXYZ(i, x * taper * 1.35 * (1 + n * 0.22), y * up + (y > 0 ? n * 0.12 : n * 0.5), z * taper * (1 + n * 0.22));
    }
    rockGeo.computeVertexNormals();
    const rock = new Mesh(rockGeo, stone('#6a5f52'));
    rock.position.set(0, 0.55, 0);
    const top = new Group();
    this.figure = new Mesh(new CapsuleGeometry(0.16, 0.6, 6, 12), new MeshStandardMaterial({ color: '#f4ebdd', roughness: 0.7, emissive: '#f2b866', emissiveIntensity: 0.25 }));
    this.figure.position.set(0.4, 1.42, 0.3);
    this.root.add(rock, top, this.figure);

    this.shaft = this.own(new LightShaft({ color: '#ffe9b0', length: 30, radiusTop: 0.6, radiusBottom: 7, intensity: 0.35, motes: 220, seed: 'sky' }));
    this.shaft.group.position.copy(this.sky.sunDirection).multiplyScalar(26).add(new Vector3(0, 2, 0));
    this.shaft.group.lookAt(0, 1, 0);
    this.shaft.group.rotateX(-Math.PI / 2);
    this.root.add(this.shaft.group);
    this.own(ctx.audio.wind(0.25, { level: 0 })).setLevel(0.35, 3);
  }

  update(dt: number): void {
    this.sky.update(dt);
    this.clouds.update(dt, this.ctx.engine.camera);
    this.wisps.update(dt, this.ctx.engine.camera);
    this.shaft.update(dt);
    this.figure.position.y = 1.42 + Math.sin(this.time * 0.9) * 0.012;
  }
}

// -------------------------------------------------------------------------------------------------
// 3 · WILL: a figure you steer; toggle the corrupting InputFilter and watch raw vs filtered
// -------------------------------------------------------------------------------------------------
export class WillChapter extends Chapter {
  readonly id = 'will';
  override keyMomentAt = 4;
  private figure!: Group;
  private dust!: Dust;
  private beacon!: Mesh;
  private vel = new Vector3();

  enter(ctx: CoreContext): void {
    const { engine, rig, postfx, input } = ctx;
    postfx.setPreset('stark');
    postfx.params.saturation = 0.75;
    engine.scene.background = new Color('#0c0b0e');
    rig.setFov(42);
    const fog = this.own(new HeightFog(engine.scene, { ...FOG_PRESETS.groundHaze, density: 0.028 }));
    const ground = new Mesh(new CircleGeometry(60, 64), stone('#4a4844'));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    fog.apply(ground);

    this.figure = new Group();
    const body = new Mesh(new CapsuleGeometry(0.22, 0.9, 6, 14), new MeshStandardMaterial({ color: '#e9e2d4', roughness: 0.75, emissive: '#5a4a34', emissiveIntensity: 0.5 }));
    body.position.y = 0.67;
    body.castShadow = true;
    this.figure.add(body);
    this.root.add(this.figure);

    // The distant light: always visible, always the goal.
    this.beacon = new Mesh(new CylinderGeometry(0.12, 0.12, 40, 8), new MeshBasicMaterial({ color: new Color('#FFD9A0').multiplyScalar(3), fog: false }));
    this.beacon.position.set(0, 20, -42);
    this.root.add(this.beacon);
    const key = new DirectionalLight('#ffd9a0', 4.2);
    key.position.set(0, 9, -14);
    engine.setupShadowLight(key, 10, 40);
    const rim = new DirectionalLight('#8fa0c8', 0.9);
    rim.position.set(6, 4, 8);
    this.root.add(key, rim, new AmbientLight('#4a4a58', 1.3));
    const halo = new Mesh(new SphereGeometry(1.6, 24, 16), new MeshBasicMaterial({ color: new Color('#FFD9A0').multiplyScalar(2.2), fog: false }));
    halo.position.set(0, 3.2, -42);
    this.root.add(halo);
    this.dust = this.own(new Dust({ count: 500, bounds: [10, 3, 10], color: '#9A968F', size: 3, opacity: 0.35 }));
    this.dust.points.position.y = 2;
    this.root.add(this.dust.points);

    rig.follow(this.figure, { offset: new Vector3(0.8, 2.2, 5.6), lookOffset: new Vector3(0, 1.1, -1.5), spring: 'smooth' }, true);
    this.own(() => rig.follow(null));

    const corruption = corruptionFilter({
      intensity: 0.9,
      redirectTo: () => ({ x: 1, y: 0 }),
      onBetray: (kind) => {
        if (!kind) return;
        postfx.glitchBurst(0.7, 0.3);
        ctx.audio.stutter();
      },
    });
    let corrupt = false;
    let grace = false;
    demoState.toggleCorruption = () => {
      corrupt = !corrupt;
      if (corrupt) input.addFilter(corruption);
      else input.removeFilter(corruption.id);
      return corrupt;
    };
    demoState.toggleGrace = () => {
      grace = !grace;
      if (grace) input.addFilter(graceFilter());
      else input.removeFilter('grace');
      return grace;
    };
    this.own(() => {
      input.clearFilters();
      ctx.ui.hud.clear();
      engine.scene.background = new Color(palette.ink);
    });
    ctx.ui.whisper.show(t('core.whisper.move'), { duration: 6 });
  }

  update(dt: number): void {
    const { input, ui } = this.ctx;
    const a = input.filtered;
    this.vel.x = damp(this.vel.x, a.moveX * 3.2, 8, dt);
    this.vel.z = damp(this.vel.z, -a.moveY * 3.2, 8, dt);
    this.figure.position.addScaledVector(this.vel, dt);
    this.figure.position.x = Math.max(-12, Math.min(12, this.figure.position.x));
    this.figure.position.z = Math.max(-30, Math.min(8, this.figure.position.z));
    if (this.vel.lengthSq() > 0.02) this.figure.rotation.y = Math.atan2(this.vel.x, this.vel.z);
    this.figure.children[0]!.position.y = 0.67 + Math.abs(Math.sin(this.time * 9)) * 0.03 * Math.min(1, this.vel.length());
    const { pressed, went } = input.arrows();
    ui.hud.set('bottom-center', pressed === '·' && went === '·' ? '' : `you pressed ${pressed} · you went ${went}`);
    ui.hud.set('top-right', input.getFilters().map((f) => f.id).join(' + ') || 'no filters');
    this.dust.update(dt);
  }
}
