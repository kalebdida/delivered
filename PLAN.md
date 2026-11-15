# DELIVERED · Phase 1 plan

## What Phase 1 delivers
One pnpm monorepo: a shared engine and design system (`packages/core`), a hub (`apps/hub`), three
beautiful placeholder rooms, and the conventions that let three room agents build in parallel
without touching the core or each other.

## Core API design (packages/core)
A room boots with one call and gets a context holding every module:

```ts
const ctx = await createApp({ appId: 'gain', title: 'GAIN', chapters: [...], reverb: 'smallCell', physics: true });
// ctx.engine · loop · quality · postfx · rig · input · audio · physics · director · ui · store · t
```

| Module | Entry points |
| --- | --- |
| Engine | `createEngine` (WebGL2, ACES via PostFX, `precompile`, shadow helpers) |
| Loop | `Loop` (60 Hz fixed step, variable render, `timeScale`, auto-pause) |
| Quality | `Quality`, `QUALITY_BUDGETS` (tiers, warm-up benchmark, adaptive DPR) |
| PostFX | `PostFX`, `GRADES`, `createGradeLUT` (bloom, LUT, grain, vignette, heat, glitch, radial blur, DoF, god rays, fades, custom effects) |
| CameraRig | `CameraRig` (spring follow, trauma shake, spline paths, FOV kicks, letterbox, parallax) |
| Input | `Input`, `InputFilter` + filter factories, `HoldMeter`, `VirtualControls` (raw and filtered actions every frame) |
| Physics | `Physics`, `createRagdoll`, `createChain`, `createPhysicsRope`, `createCrumble` |
| Verlet | `Verlet`, `createRope`, `createCloth` (DataTexture export) |
| Atmosphere | `CloudField` (raymarch or billboards), `LightShaft`, `HeightFog`, `Sky`, `Dust` |
| Audio | `AudioEngine` (drone, pluck, flute, horn, bell, wind, rain, fire, crowd, thunder, gallop, heartbeat, impact, chain, scrape, crumble, reverbs, spatial, duck, crossfade, UI kit), `scale` |
| Director | `Chapter`, `Director`, `TransitionEffect` (dissolve, ink, light), `deepDispose`, leak check |
| UI | `ScriptureOverlay`, `ChapterCard`, `Whisper`, `HUD`, `Settings`, `EndCard`, `createPostcard`, `LoadingScreen`, `Cursor`, `Chrome`, `button` |
| i18n | `t`, `registerStrings`, `setLanguage` (English, Amharic) |
| Scripture | `verse`, `passage`, `registerScripture`, `pnpm fetch:web`, `pnpm fetch:amharic`, `pnpm verify:scripture` |
| Safety | `flashLimiter`, `prefersReducedMotion`, `markComplete`, `isComplete`, `trapFocus`, `announce` |
| Debug | `?debug` (tweakpane, stats-gl, chapter jumper, physics view, input visualizer), `pnpm shots` |
| Library | `glsl` chunks, easing, seeded random, simplex noise, springs, instancing and VAT helpers |

Design choices that keep the room agents unblocked:
- Every room verse (English and Amharic) is already in the registry, so no room needs a core edit.
- Chapters own a `root` group that is disposed automatically; `own()` cleans up sounds and tweens.
- Everything is procedural: no models, textures or audio files anywhere in the core.

## Design system plan
`DESIGN.md` is the bible; `packages/core/src/styles` implements it as CSS tokens and components, and
`tokens.ts` mirrors the palette for WebGL. Rooms remap the palette tokens through `[data-room]`.
The Beauty Review (`pnpm shots`, scores in `BEAUTY.md`) gates every visual milestone.

## Milestones
M1 repo, engine, loop, quality, PostFX, camera rig, placeholders, build · M2 input, physics, Verlet,
atmosphere · M3 audio · M4 director, UI, i18n, scripture, safety · M5 docs, demo, shots · M6 hub ·
M7 room branches and hand-off.
