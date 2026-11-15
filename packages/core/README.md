# @delivered/core

The shared engine and design system for DELIVERED. Three rooms and the hub are built on it.
Everything is procedural: there are no models, textures or audio files in this package.

Read this with `DESIGN.md` and `CONVENTIONS.md`, and keep the playground open while you work:

```bash
pnpm dev:demo
```

`packages/core/demo/src/chapters.ts` is four small chapters written exactly the way a room chapter
should be written, and `demo/src/main.ts` calls every public API from a button.

## Contents
1. [Booting a room](#1-booting-a-room) · 2. [Chapters and the Director](#2-chapters-and-the-director)
· 3. [Engine, Loop, Quality](#3-engine-loop-quality) · 4. [PostFX](#4-postfx) · 5. [CameraRig](#5-camerarig)
· 6. [Input](#6-input) · 7. [Physics](#7-physics) · 8. [Verlet](#8-verlet) · 9. [Atmosphere](#9-atmosphere)
· 10. [Audio](#10-audio) · 11. [UI components](#11-ui-components) · 12. [i18n](#12-i18n)
· 13. [Scripture](#13-scripture) · 14. [Safety and accessibility](#14-safety-and-accessibility)
· 15. [Debug and screenshots](#15-debug-and-screenshots) · 16. [Shader and math library](#16-shader-and-math-library)

## 1. Booting a room

Replace `apps/<room>/src/main.ts` (currently the placeholder) with:

```ts
import '@delivered/core/styles.css';
import { createApp, markComplete } from '@delivered/core';
import { Threshold } from './chapters/threshold';

const ctx = await createApp({
  appId: 'gain',              // 'wretched' | 'underneath' | 'gain'
  title: 'GAIN',              // assembles letter by letter on the loader
  chapters: [new Threshold() /* , ... */],
  reverb: 'smallCell',        // 'smallCell' | 'stoneHall' | 'vastDesert' | 'openSky'
  physics: true,              // only if you need Rapier (it downloads WASM)
  transition: 'dissolve',     // default chapter transition
  setup: async (ctx, progress) => { /* build persistent world objects while the loader shows */ },
  onEnd: () => markComplete('gain'),
});
```

`createApp` creates the canvas, engine, quality detection, PostFX with your room's grade, camera
rig, input (with touch controls on phones), audio, every UI component, the top bar, the loader
with a Begin button (the gesture that unlocks audio), the Director and the main loop. It sets
`data-room` on `<html>` so the shared UI takes your palette, and it picks up the portal's light
color when the visitor arrives from the hub.

The context it returns (and passes to every chapter):

```ts
ctx.engine   // renderer, scene, camera, exposure, precompile(), shadow helpers
ctx.loop     // timeScale, time
ctx.quality  // tier, budget
ctx.postfx   // params, flash(), fadeTo(), glitchBurst(), setLUT(), addEffect()
ctx.rig      // follow(), playPath(), addTrauma(), kickFov(), letterbox()
ctx.input    // raw, filtered, pressed(), addFilter()
ctx.audio    // every sound
ctx.physics  // Physics | null
ctx.director // goTo(), next(), skip(), canSkip
ctx.store    // localStorage under delivered:<appId>:*
ctx.ui       // scripture, card, whisper, hud, settings, end, cursor, chrome
ctx.t        // translate
```

Frame order: input → fixed steps (physics, `chapter.fixedUpdate`) → `chapter.update` → `onFrame`
→ camera rig → audio listener → PostFX render.

To add your own things to the context, extend the type:

```ts
interface WretchedCtx extends CoreContext { world: World; weight: number }
class Want extends Chapter<WretchedCtx> { /* this.ctx.world */ }
await createApp<WretchedCtx>({ ..., setup: (ctx) => { ctx.world = buildWorld(ctx); } });
```

## 2. Chapters and the Director

```ts
import { Chapter, type CoreContext } from '@delivered/core';

export class Threshold extends Chapter {
  readonly id = 'threshold';
  override keyMomentAt = 6;            // seconds in, when `pnpm shots` takes the picture
  override transitionIn = 'ink';       // 'dissolve' | 'ink' | 'light' | 'fade' | 'cut'

  async enter(ctx: CoreContext) {
    this.root.add(mesh);               // everything under `root` is disposed for you on exit
    this.own(ctx.audio.drone(55));     // own(): anything with stop(), dispose() or kill(), or a function
    await ctx.ui.card.show({ word: 'θέλω', lang: 'grc', translit: 'thelō', english: 'I want', ref: 'Romans 7:19', number: 1 });
  }
  update(dt: number) {                 // per frame, dt scaled by loop.timeScale; this.time counts up
    if (done) this.complete();         // the Director moves to the next chapter
  }
  override fixedUpdate(dt: number) {}  // optional, 60 Hz
  override exit() {}                   // optional extra teardown
}
```

The Director:
- runs the transition (cover, swap, reveal), so the swap is never visible;
- saves progress under `delivered:<appId>:chapter` (`director.savedIndex`);
- unlocks `director.skip()` once the room has been completed (`director.canSkip`);
- honors `?chapter=N` to start anywhere (development, screenshots);
- pre-compiles shaders after `enter` so the first frame never stutters;
- checks `renderer.info.memory` against the baseline after every exit and warns in the console in
  dev builds or with `?debug` when a chapter leaves geometry or textures behind.

Persistent world objects (WRETCHED's terrain, for example) are built in `setup` and added to
`ctx.engine.scene` directly; chapters then only add and remove what is theirs.
`deepDispose(object)` frees a subtree by hand.

## 3. Engine, Loop, Quality

```ts
const { renderer, scene, camera } = ctx.engine;
ctx.engine.exposure = 1.2;                    // ACES filmic tone mapping happens in PostFX
await ctx.engine.precompile(this.root);       // compile a heavy subtree during a quiet moment
ctx.engine.setupShadowLight(keyLight, 12, 60);// shadow map sized by the tier; no-op on low
ctx.engine.castShadows(this.root);            // meshes cast and receive

ctx.loop.timeScale = 0.2;                     // slow motion for a "hold moment"; 0 freezes the sim

const b = ctx.quality.budget;                 // read budgets, never hard-code counts
const count = Math.min(30_000, b.maxParticles);
```

| Budget | low | medium | high |
| --- | --- | --- | --- |
| `maxParticles` | 6,000 | 20,000 | 60,000 |
| `maxInstances` | 400 | 1,500 | 5,000 |
| `shadows` / `shadowMapSize` | off | 1024 | 2048 |
| `postFx` | 0 grade only | 1 + bloom, god rays | 2 + depth of field |
| `clouds` / `raymarchSteps` | billboard | billboard | raymarch / 56 |
| `maxDpr` | 1.25 | 1.5 | 2 |
| `maxBodies` | 60 | 140 | 320 |

The tier comes from detect-gpu plus a 2-second warm-up benchmark; DPR adapts on its own (drops when
frame time stays above 20 ms for 2 s, rises with headroom, clamped 1 to 2). Force a tier with
`?quality=low|medium|high` or in Settings. `ctx.quality.onChange(fn)` fires when it changes.

## 4. PostFX

Pass order: render → depth of field → bloom (+ god rays) → distortion → your effects → exposure,
ACES tone map, LUT, grade (saturation, vignette, grain, fades, dithering).

```ts
const fx = ctx.postfx;
fx.setPreset('cinematic');            // 'cinematic' | 'clean' | 'dream' | 'stark'
fx.params.saturation = 0.4;           // every param is live: set it or tween it with gsap
fx.params.heat = 0.5;                 // heat-haze distortion
fx.params.glitch = 0.3;               // RGB split + block displacement + scanline jitter
fx.params.radialBlur = 0.6; fx.blurCenter.set(0.5, 0.4);
fx.params.dof = true; fx.params.focusDistance = 6;   // high tier
fx.glitchBurst(0.8, 0.25);            // softened under reduce flashing / reduced motion
fx.flash(0.8);                        // goes through the flash limiter
fx.fadeTo('white', 1, 1.2);           // white-out; fadeTo('black', 1, 2); fadeTo('white', 0) clears
fx.setLUT(GRADES.gain);               // or your own GradeParams: shadows, highlights, contrast, saturation...
fx.setGodRays(sunMesh);               // medium and high tiers
fx.setBloomSelection([orb]);          // strict selective bloom; null = luminance threshold (default)
```

Bloom only catches HDR values above `bloomThreshold`: make the light that *means* something
emissive above 1.0 (`color.multiplyScalar(3)`, `emissiveIntensity: 2.5`) and nothing else.

**Registering a custom pass.** Write a pmndrs `Effect` (re-exported from the core) and add it:

```ts
import { Effect } from '@delivered/core';
class Ember extends Effect {
  constructor() {
    super('Ember', `uniform float uAmount;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = vec4(inputColor.rgb + vec3(0.4, 0.1, 0.0) * uAmount * uv.y, inputColor.a);
      }`, { uniforms: new Map([['uAmount', new Uniform(0)]]) });
  }
}
const remove = ctx.postfx.addEffect(new Ember());   // runs in HDR before tone mapping
this.own(remove);
```

Effects flagged `EffectAttribute.CONVOLUTION` get their own pass automatically. For a whole custom
pass use `fx.addPass(pass)`.

## 5. CameraRig

```ts
const rig = ctx.rig;
rig.follow(player, FOLLOW_PRESETS.close);          // 'close' | 'wide' | 'above' | 'low', or your own offsets
rig.follow(player, { offset: new Vector3(0.6, 1.9, 4.2), lookOffset: new Vector3(0, 1.2, 0), spring: 'heavy', inheritHeading: true });
rig.addTrauma(0.6);                                // shake = trauma squared; ignored under reduced motion
rig.kickFov(8);                                    // momentary punch that springs back
rig.setFov(38, 3);                                 // animated
rig.lookAt(point, 2);                              // blend the look target
rig.letterbox(true);                               // cinematic bars
rig.parallax = 2.5;                                // degrees of pointer parallax; 0 disables
const tween = rig.playPath([a, b, c], { duration: 5, lookAt: [la, lb], fov: 50 });  // CatmullRom, gsap-driven
timeline.add(tween, 0);                            // it is a gsap tween: put it on a timeline
rig.snapTo(position, target);                      // cut
```

## 6. Input

Pointer, touch, keyboard, gamepad and (opt-in) device tilt become semantic actions:
`moveX`, `moveY`, `lookX`, `lookY`, `primary`, `secondary`, `hold`, `confirm`, `cancel`, plus
`custom` for room-defined buttons.

| Action | Keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| move | WASD, arrows | virtual joystick (left half) | left stick, d-pad |
| look | drag | drag | right stick |
| primary / hold | Space, pointer held | large button | A |
| secondary | E, F | small button | X, B |
| confirm / cancel | Enter / Escape | — | Start / B |

```ts
const { input } = ctx;
player.move(input.filtered.moveX, input.filtered.moveY);   // what gameplay receives
if (input.pressed('primary')) strain();                    // edge-triggered
input.raw;                                                 // what the visitor actually pressed
const { pressed, went } = input.arrows();                  // '→', '←'
ui.hud.set('bottom-center', `you pressed ${pressed} · you went ${went}`);
if (input.betrayed) fx.glitchBurst();                      // filters changed the movement this frame
input.enabled = false;                                     // cut-scene: filtered is zero, raw still updates
```

**The InputFilter pipeline.** Filters transform actions before gameplay sees them:

```ts
const remove = input.addFilter(invertFilter());            // press forward, go backward
input.addFilter(delayFilter(() => 300 + 600 * weight));    // input arrives late
input.addFilter(redirectFilter(() => dirToNearestTemptation(), 0.75));
input.addFilter(dropFilter());                             // input ignored
input.addFilter(driftFilter((t) => ({ x: Math.sin(t) * 0.4, y: 0 })));
input.addFilter(smoothFilter(10)); input.addFilter(amplifyFilter(1.15));
input.addFilter(graceFilter());                            // smoother, lighter, a little faster
input.removeFilter('invert'); input.clearFilters();

// The unpredictable mix WRETCHED needs, in one filter:
const corruption = corruptionFilter({
  intensity: () => weight * (1 - distanceToLight / maxDistance),   // chance, live
  kinds: ['invert', 'delay', 'redirect', 'drop', 'drift'],
  redirectTo: () => dirToNearestTemptation(),
  onBetray: (kind) => { if (kind) { fx.glitchBurst(0.7, 0.3); audio.stutter(); heartbeat.skip(); } },
});
input.addFilter(corruption);
```

A filter is just `{ id, apply(actions, { dt, time, raw }) }`; write your own freely.

```ts
const cry = new HoldMeter({ fillTime: 6, drainTime: 2, fatigue: 0.1 });   // hold helper, 0..1
const v = cry.update(dt, input.filtered.hold); if (cry.complete) deliver();

input.setVirtualButtons([{ id: 'primary', label: t('core.controls.action'), size: 'large', icon: 'dot' },
                         { id: 'lookUp', label: t('core.whisper.lookUp'), size: 'small', icon: 'up' }]);
if (input.filtered.custom.lookUp) lookUp();
await input.enableTilt();   // permission-gated, call from a tap; off by default
```

## 7. Physics

An async Rapier wrapper. `createApp({ physics: true })` creates it, steps it at 60 Hz and syncs
bound meshes every frame.

```ts
const physics = ctx.physics!;
const ground = physics.addGround(0);
const body = physics.addBox({ x: 0, y: 4, z: 0 }, { x: 0.5, y: 0.5, z: 0.5 }, { density: 2 });
physics.bind(mesh, body);          // mesh follows body (mesh must be in world space)
this.own(() => physics.remove(body));   // remove() is safe to call twice
physics.R; physics.world;          // the raw Rapier namespace and world for anything else
```

**Ragdoll** (humanoid, 11 capsule bodies, limited joints):

```ts
const doll = createRagdoll(physics, { position: { x: 0, y: 2, z: 0 }, stiffness: 2.5, material });
this.root.add(doll.group);         // capsule meshes; pass meshes: false and use doll.bodies + doll.shapes
doll.applyImpulse({ x: 0, y: 4, z: -2 }); doll.teleport({ x: 0, y: 1, z: 0 });
this.own(doll);
```

**Chain** (capsule links, spherical joints, optionally breakable):

```ts
const chain = createChain(physics, {
  from, to, links: 14, fromBody: ankle, toBody: wrist,
  breakStretch: Infinity,          // default: unbreakable, whatever the visitor does
  onBreak: (i) => audio.chainSnap(),
});
chain.links.forEach((body) => physics.bind(linkMesh(), body));
chain.tension();                   // 0 slack .. 1+
chain.breakAt(0);                  // break a joint on purpose (deliverance)
```

`createPhysicsRope` is the same idea with rope joints. For purely visual ropes prefer Verlet.

**Platform crumble** (a slab pre-fractured into Voronoi chunks; zero cost until released):

```ts
const slab = createCrumble(physics, { position, width: 6, depth: 4, thickness: 0.4, chunks: 24, material });
this.root.add(slab.group);
slab.releaseNear(x, z, 1.2);       // chunks near a point fall
slab.collapse({ x, z }, 1.5);      // everything, spreading outward over 1.5 s
// fixedUpdate: slab.update(dt)
```

The collider debug view is in the `?debug` panel ("physics view").

## 8. Verlet

```ts
const rope = createRope([0, 3, 0], [2, 3, 0], 24, { slack: 1.2, iterations: 8 });
rope.pin(0); rope.movePin(24, hand.x, hand.y, hand.z);
rope.wind = (x, y, z, t) => [Math.sin(t) * 2, 0, 0];
rope.floorY = 0;
const tube = new RopeMesh(rope, { radius: 0.02, color: '#8E8A93' });   // GPU tube driven by a DataTexture
this.root.add(tube.mesh); this.own(tube);
// fixedUpdate: rope.step(dt)      update: tube.update()

const cloth = createCloth([0, 3, 0], 2, 3, 16, 24);
cloth.pin(0); cloth.pin(16);
const tex = cloth.toTexture(17);   // positions as a float texture for your own ribbon or cloth shader
const c = rope.constrain(3, 9); rope.release(c);   // cut
```

## 9. Atmosphere

```ts
const sky = new Sky();                         // gradient + sun or moon disc + stars, dithered
sky.setTime(6.5);                              // 0..24: night, dawn, noon, dusk
sky.set({ zenith: '#0A0D1F', stars: 1 });      // or override with your palette
keyLight.position.copy(sky.sunDirection).multiplyScalar(50);

const clouds = new CloudField({                // raymarched on high, soft billboards on medium and low
  tier: ctx.quality.tier, base: -30, top: -5, extent: 260, coverage: 0.6, scale: 70,
  lightDirection: sky.sunDirection, lightColor: '#FFF4DA', shadowColor: '#7B88AD', hazeColor: '#F2B866',
  wind: [1.5, 0, 0.5],
});
clouds.params.coverage = 0.9;                  // live
const wisps = new CloudField({ mode: 'billboard', count: 30, base: 0, top: 8, extent: 60, scale: 16 });

const beam = new LightShaft({ color: '#CFE0FF', length: 6, radiusTop: 0.3, radiusBottom: 1.4, intensity: 0.6, motes: 260 });
beam.group.position.set(0, 5, 0);              // the source; it shines toward local -Y, so rotate the group
beam.intensity = 1;                            // tween it to "open" the beam

const fog = new HeightFog(ctx.engine.scene, FOG_PRESETS.groundHaze);   // clear | groundHaze | cell | aerial | whiteout
fog.apply(this.root);                          // adds the height layer to built-in materials
fog.set({ density: 0.05 });

const dust = new Dust({ count: 800, bounds: [12, 6, 12], color: '#F5C76B', size: 3 });   // the foreground layer
// update: sky.update(dt); clouds.update(dt, camera); beam.update(dt); dust.update(dt)
```

The raymarched cloud layer is a backdrop: solid objects always draw in front of it. To pass
*through* cloud, add a billboard `CloudField` for wisps (they depth-test, and dissolve as the
camera reaches them) and lean on `HeightFog` / `postfx.fadeTo`.

## 10. Audio

Web Audio with a master limiter, four buses (`music`, `ambience`, `sfx`, `ui`), generated
convolution reverbs, unlock on the first gesture, and persisted volume and mute. Every call is a
safe no-op before unlock or when audio is unavailable.

```ts
const a = ctx.audio;
a.setReverb('vastDesert', 0.9);                // smallCell | stoneHall | vastDesert | openSky

// Sustained (each returns a handle with setLevel(v, seconds) and stop(seconds)):
const drone = a.drone(55, 'dark');             // warm | dark | glass | choir | hollow
drone.setFreq(49, 4); drone.setBrightness(0.2, 4);
const wind = a.wind(0.2); wind.setSpeed(1, 6); // 0 gentle .. 1 roaring
a.rain(0.6); a.fire(); a.crowd(); a.breathing(14);
const heart = a.heartbeat(64); heart.setBpm(110); heart.skip();
const scrape = a.stoneScrape(); scrape.setLevel(speed);   // drive from physics speed

// One-shots (all take { when, level, bus, to }):
a.pluck(220); a.flute(440, { duration: 2 }); a.horn(110); a.bell(660); a.chord([146.8, 220, 293.7]);
a.thunder({ distance: 0.3 }); const cancel = a.gallop(104, 8);   // thunder as hoofbeats
a.impact(0.8); a.chainRattle(0.6); a.chainSnap(); a.crumble(0.7); a.stutter();

// Melody helper:
const s = scale('D3', 'dorian');               // church modes, pentatonics, Ethiopian qenet (tizita, bati, ...)
[0, 2, 4, 7].forEach((d, i) => a.pluck(s.freq(d), { when: i * 0.3 }));

// Mixing:
a.duck(0.3, 2);                                // pull music and ambience down for a line of scripture
a.crossfade(oldBed, newBed, 3);
const src = a.spatial({ refDistance: 4 });     // positional source
src.follow(mesh); a.drone(880, 'glass', { to: src.input });

a.ui.hover(); a.ui.click(); a.ui.open(); a.ui.close(); a.ui.confirm();   // already wired to every button
```

## 11. UI components

DOM, no framework, all styled by `DESIGN.md`. `createApp` creates them on `ctx.ui`.

```ts
const { ui } = ctx;
await ui.scripture.show({ ref: 'Romans 7:24', duration: 6, position: 'lower',
  original: { text: 'τίς με ῥύσεται;', lang: 'grc' } });     // line-mask reveal, aria-live, selectable
ui.scripture.show({ ref: 'Romans 7:24', huge: true, align: 'center' }); ui.scripture.hide();

await ui.card.show({ word: 'יְשֻׁרוּן', lang: 'he', translit: 'Yeshurun', english: 'upright one', ref: 'Deuteronomy 33:26', number: 0 });

ui.whisper.show(t('core.whisper.hold'));       // breathes until hide(); or { duration: 4 }
ui.hud.set('top-right', `attempts: ${n}`);     // 'top-left' | 'top-right' | 'bottom-center'; hud.clear()

ui.settings.addSwitch({ label: t('wretched.gentle'), get: () => gentle, set: (v) => (gentle = v) });
ui.settings.open();                            // volume, quality, reduce flashing, reduced motion, language

await ui.end.show({
  title: 'WRETCHED', ref: 'Romans 8:1', line: t('wretched.closing'),
  readUrl: webChapterUrl('Romans', 7), readLabel: t('wretched.read'),
  onReplay: () => { ui.end.hide(); director.resetProgress(); void director.goTo(0); },
  onShare: async () => {
    const blob = await createPostcard({ canvas: ctx.engine.renderer.domElement, title: 'WRETCHED',
      line: t('wretched.postcard', { n }), ref: 'Romans 7:24-25', lang: getLanguage() });   // 1080x1350 PNG
    await sharePostcard(blob, 'delivered-wretched.png');   // Web Share on mobile, download on desktop
  },
});

ui.cursor.setLabel('drag');                    // or data-cursor="drag" on any element; null clears
const b = button({ label: 'Begin', variant: 'primary', icon: 'arrow', onClick });   // pill | primary | text | icon
openDialog('About', [h('p', { class: 'dl-body' }, text)]);
toast('Saved');
const loader = new LoadingScreen({ title: 'GAIN' }); loader.setProgress(0.5); await loader.finish();
```

CSS classes for your own DOM: `dl-display`, `dl-title`, `dl-verse`, `dl-body`, `dl-caption`,
`dl-label`, `dl-ref`, `dl-greek`, `dl-hebrew`, `dl-panel`, `dl-scrim`, `dl-btn`, and the reveal
pair `dl-line` / `dl-rise` (add `is-in` to the parent; stagger with `style="--i: n"`). `splitLines(el)`
turns a paragraph into masked lines. Icons: `icons.sound`, `settings`, `share`, `back`, `replay`,
`close`, `book`, `info`, `globe`, `arrow`, `hand`, `dot`, `up`, `skip`, `download`, and `markSvg()`.

## 12. i18n

```ts
registerStrings('en', { 'gain.begin': 'Take up the pen', 'gain.count': '{n} of {total}' });
registerStrings('am', { 'gain.begin': 'ብዕሩን ያንሡ', 'gain.count': '{n} ከ{total}' });
t('gain.count', { n: 2, total: 7 });
getLanguage(); setLanguage('am'); onLanguageChange((lang) => rerender());
```

English is the default, Amharic (`am`) the second language, persisted. Keys are namespaced per
room. Switching sets `<html lang>`, which swaps to the Noto Ethiopic fonts and the Amharic type
scale in CSS. `?lang=am` forces a language for testing. All core strings are translated.

## 13. Scripture

Every verse the three rooms quote is in the registry in English (WEB) and Amharic:
Deuteronomy 32:15, 33:26-27 · Psalm 18:10, 90:1 · Isaiah 44:2 · John 10:28 ·
Romans 7:12, 7:15, 7:18-19, 7:21-25, 8:1-2, 8:4 · Philippians 1:12-14, 1:20-25, 3:7-8.

```ts
verse('Philippians 1:21');                 // current language, falling back to English
passage('Romans 7:24-25', 'en');           // joins a range
formatRef('Romans 8:1');                   // 'ሮሜ 8፥1' in Amharic
webChapterUrl('Romans', 7);                // where "Read the chapter" points
registerScripture(scripture);              // partial quotes from apps/<room>/src/scripture.ts
```

Scripts: `pnpm fetch:web` regenerates `scripture.en.ts` from ebible.org; `pnpm fetch:amharic`
regenerates `scripture.am.ts` (two-source cross-check); `pnpm verify:scripture` checks every
English entry, core and rooms, word for word against ebible.org. See CONVENTIONS.md section 7.

## 14. Safety and accessibility

```ts
flashLimiter.request(0.8);        // returns the luminance change you may apply (max 2 flashes per second)
prefersReducedMotion();           // OS setting or the Settings switch
preferences.get(); preferences.set({ reduceFlashing: true }); preferences.onChange(fn);
markComplete('gain'); isComplete('gain'); allComplete();   // delivered:complete:<appId>
announce('The chain is gone.');   // polite aria-live
const release = trapFocus(panel, onEscape);
haptic(12);                       // light, Android only, never constant
```

PostFX and the Director apply the flash limiter on their own. The focus ring, 44 px targets and
reduced-motion CSS come with the stylesheet.

## 15. Debug and screenshots

- `?debug`: tweakpane (PostFX, exposure, time scale, quality tier), stats-gl, a chapter jumper, the
  physics collider view, and the input-filter visualizer (raw stick next to filtered stick).
  `ctx.debug?.pane.addBinding(obj, 'key')` adds your own controls. The libraries are code-split and
  never reach visitors.
- `?chapter=N` starts at a chapter; `?quality=low|medium|high` forces a tier; `?lang=am`.
- `pnpm build && pnpm shots [app ...]` saves desktop (1440x900) and mobile (390x844) screenshots of
  every chapter at its `keyMomentAt` into `shots/`. `SHOTS_URL=http://localhost:5173 pnpm shots gain`
  runs against a dev server. It needs a Chromium: `pnpm exec playwright install chromium` once, or
  set `PW_CHROMIUM` to a browser binary.

## 16. Shader and math library

```ts
import { glsl } from '@delivered/core';
const fragmentShader = `${glsl.hash}${glsl.simplex3D}${glsl.fbm}${glsl.dither}
  void main(){ gl_FragColor = vec4(vec3(fbm(vPos)) + dither(gl_FragCoord.xy), 1.0); }`;
```

Chunks: `hash` (hash11/12/13/22/33), `simplex2D`, `simplex3D`, `simplex4D` (each defines `snoise`;
include one of the three per shader), `fbm` and `curl` (need `simplex3D`), `voronoi` (F1, edge
distance, cell id; needs `hash`), `fresnel`, `heatDistortion`, `dither`, `softParticles`.

TypeScript: `easing.*`, `breath(t)`, `damp`, `lerp`, `remap`, `smoothstep`, `clamp` ·
`seededRandom(seed)` (`range`, `int`, `pick`, `gauss`, `inSphere`) · `createNoise(seed)`
(`noise2`, `noise3`, `fbm2`, `fbm3`) · `Spring`, `Spring3`, `SPRING_PRESETS` · `vec.*` ·
`createInstances`, `setInstance`, `scatterDisc` · `bakeVAT` (vertex animation textures) ·
`palette`, `roomPalettes`, `motion`.

## Tests

`pnpm test` runs the unit tests in `packages/core/test` (InputFilter transforms, Director
lifecycle, flash limiter, Verlet constraints, i18n, scripture registry, loop, quality, math).
Rooms add theirs under `apps/<room>/test/*.test.ts`.
