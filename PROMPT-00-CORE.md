# DELIVERED · PHASE 1: THE SHARED CORE, THE DESIGN SYSTEM, AND THE HUB

## 0. YOUR ROLE
You are a senior creative technologist, WebGL engineer, and art director working at the craft level of studios like Active Theory, Lusion, and Bruno Simon. You are building the shared engine, the design system, the repo setup, and the hub for a trilogy of interactive Three.js experiences. Beauty is a first-class requirement here, equal to correctness.

Read `CLAUDE.md` first and obey it completely, especially the AUTHORSHIP rules: Kaleb Dida is the sole author, and no AI attribution may appear anywhere, including commit messages.

Work autonomously. Make reasonable decisions without stopping to ask me, and log every non-obvious decision in DECISIONS.md. Run the build and tests after every milestone and fix all errors before moving on. Do not hand me manual steps: if something needs doing, do it yourself. Do not spawn subagents.

## 1. WHAT DELIVERED IS
DELIVERED is one website with three interactive rooms, all about deliverance:

| Room | Scripture | Theme |
| --- | --- | --- |
| WRETCHED | Romans 7:15 to 8:2 | delivered from yourself |
| UNDERNEATH | Deuteronomy 33:26-27 | caught when everything falls |
| GAIN | Philippians 1:12-25 | even death becomes gain |

A hub landing page with three portals leads into the rooms.

IMPORTANT CONTEXT: after you finish, three separate AI agents will build the three rooms IN PARALLEL, each in its own git worktree and branch, each touching only its own `apps/<name>/` folder. Your job is to build an engine, a design system, and conventions so solid that those agents never need to edit the core, never collide, and all produce work that looks like one coherent, beautiful piece.

The folders `apps/wretched/`, `apps/underneath/`, `apps/gain/` already exist and each contains a `PROMPT.md`. Never edit or delete those PROMPT.md files. Read all three before you design the core APIs, so the core gives each room exactly what it will need.

## 2. GIT AND GITHUB SETUP (do this first)
1. Run `git config user.name` and `git config user.email`. If either is empty or shows an AI or bot identity, stop and tell me (see CLAUDE.md). Otherwise never touch them.
2. `git init -b main` if this is not already a repo. Create a proper `.gitignore` (node_modules, dist, .DS_Store, .env*, shots/, coverage).
3. Commit messages: short, clear, imperative, with a prefix (`[core]`, `[hub]`, `[repo]`). NO AI attribution trailers or lines of any kind.
4. Check `gh auth status`. If the GitHub CLI is logged in, create a PRIVATE repo named `delivered` and push: `gh repo create delivered --private --source . --remote origin --push`. If it is not logged in, skip this, keep everything local, and write one line in DECISIONS.md: "GitHub push skipped: run gh auth login, then gh repo create delivered --private --source . --remote origin --push".
5. Push after every milestone if a remote exists.
6. At the very end of Phase 1, create the three room worktrees next to this folder so each room agent gets its own folder and branch:
   - `git worktree add ../delivered-wretched -b app/wretched`
   - `git worktree add ../delivered-underneath -b app/underneath`
   - `git worktree add ../delivered-gain -b app/gain`
   Push the three branches if a remote exists. Then update START-HERE.md with the exact folder paths.

## 3. MONOREPO SETUP
- pnpm workspaces, TypeScript strict everywhere, Vite for every app.

```
delivered/
  CLAUDE.md / AGENTS.md   (already exist; do not weaken them)
  .claude/settings.json   (already exists; keep it)
  package.json            scripts: dev:hub, dev:wretched, dev:underneath, dev:gain, build, test, lint, shots, verify:scripture
  pnpm-workspace.yaml
  tsconfig.base.json
  CONVENTIONS.md          (you write this, section 9)
  DESIGN.md               (you write this, section 5)
  DECISIONS.md
  LICENSE                 (MIT, Copyright (c) 2026 Kaleb Dida)
  README.md               (project overview, credits "Made by Kaleb Dida")
  netlify.toml
  packages/
    core/                 the shared engine (section 4)
      demo/               a playground that exercises every module (section 10)
  apps/
    hub/                  the landing page (section 8)
    wretched/             placeholder "coming soon" + existing PROMPT.md
    underneath/           same
    gain/                 same
```

- `pnpm build` builds every app and assembles one `dist/`: hub at `/`, rooms at `/wretched/`, `/underneath/`, `/gain/` (set Vite `base` per app).
- A placeholder app must build successfully even before its agent starts. Placeholders must still look beautiful: the room title in the DESIGN.md type system on a slow animated gradient, never a plain "coming soon".
- netlify.toml publishes `dist/`, sets long cache headers for hashed assets, and adds fallbacks per room.

## 4. CORE MODULES (packages/core)
Each module gets a clean exported API, TSDoc comments, and at least one unit test where the logic is testable. Write `packages/core/README.md` documenting every module with a short code example.

### 4.1 Engine
- `createEngine({ canvas, quality })` returns the renderer (WebGL2, no WebGPU requirement), scene, camera, clock, resize handling, and DPR management.
- ACES tone mapping, sRGB output, exposure control, shadow helpers.
- Shader pre-compilation (`renderer.compileAsync`) during loading, so no chapter ever stutters on its first frame.

### 4.2 Loop
- Fixed-step simulation at 60 Hz, variable-rate rendering.
- Global `timeScale` for slow motion (rooms use this for "hold moments").
- Auto-pause when the tab is hidden.

### 4.3 Quality
- Detect GPU tier with detect-gpu plus a 2-second warm-up benchmark. Tiers: low, medium, high.
- Adaptive DPR clamped between 1 and 2. Lower it when frame time stays above 20 ms for 2 seconds; raise it when there is headroom.
- Export a budget table per tier that rooms read from: max particles, max instances, shadows on or off, post FX level, raymarch steps, volumetric cloud quality.
- Targets: 60 fps on a mid-range laptop with integrated graphics, 30 fps or better on a 3 to 4 year old mid-range Android phone.

### 4.4 PostFX
- pmndrs postprocessing composer with presets.
- Selective bloom.
- Ready-made passes: color grading with a 3D LUT per room, saturation, heat-haze distortion, glitch (RGB split, block displacement, scanline jitter), vignette, film grain, radial blur, depth-of-field (cheap bokeh), god rays, white-out and black-out fades.
- A documented way for a room to register its own custom pass.

### 4.5 CameraRig
- Damped-spring follow with presets.
- Trauma-based camera shake that respects reduced motion.
- Cinematic camera paths through CatmullRom splines, driven by gsap timelines.
- FOV kicks, look-at blending, letterbox bars for cinematic moments.
- Subtle pointer parallax (a few degrees) available on every scene, disabled with reduced motion.

### 4.6 Input (critical for WRETCHED)
- Unify pointer, touch, keyboard, gamepad, and device tilt (optional, permission-gated) into semantic actions: `moveX`, `moveY`, `primary`, `secondary`, `hold`, `confirm`, `cancel`, `look`.
- An `InputFilter` middleware pipeline. Rooms register filters that transform actions before gameplay sees them: delay, invert, redirect toward a target, drop, add drift, smooth, amplify.
- Every frame, expose both the RAW action (what the visitor pressed) and the FILTERED action (what gameplay received), so a HUD can show "you pressed → · you went ←".
- Mobile: a beautifully designed virtual joystick (thin ring, soft glow, follows the thumb) on the left half of the screen and action buttons on the right, auto-enabled on touch devices.
- Hold helper: returns a 0 to 1 value from holding a key or touch, with optional fatigue over time.

### 4.7 Physics
- Async Rapier wrapper (@dimforge/rapier3d-compat).
- Helpers: ragdoll builder (humanoid, about 11 bodies, configurable joints), chain builder with breakable joints, rope helper, platform-crumble helper (fracture a slab into pre-baked Voronoi chunks that become rigid bodies), debug renderer behind `?debug`.

### 4.8 Verlet
- Generic Verlet utility for ropes and cloth: points, distance constraints, pins, iterations, wind, and a GPU-friendly DataTexture export for shader-driven tubes and ribbons.

### 4.9 Atmosphere
- Volumetric cloud field: raymarched on high tier, layered soft billboards with depth fade on medium and low. Configurable density, color, light direction, wind. UNDERNEATH depends on this heavily.
- Volumetric light shafts (GAIN's moonbeam) with dust motes.
- Height fog and distance fog presets.
- Procedural sky (gradient plus sun disc plus stars) with time-of-day control.

### 4.10 Audio
- Web Audio engine with a master bus and limiter. Unlock on the first user gesture. Mute and volume persisted.
- Procedural instruments and sounds:
  - `drone(freq, timbre)` with slow modulation
  - Karplus-Strong pluck (lyre, harp)
  - breathy flute and soft horn synthesis
  - noise beds: wind (gentle to roaring, mapped to a 0 to 1 speed), rain, fire crackle, crowd murmur
  - thunder that can be shaped into a rolling "hoofbeat" rhythm
  - heartbeat (with a controllable BPM), impact, chain rattle, stone scrape, crumble
  - convolution reverb with generated impulse responses (small cell, stone hall, vast desert, open sky)
- Spatial PositionalAudio wrapper, ducking, crossfades between beds.
- UI sound kit (section 5.7).
- Modal scale helper for melodies.

### 4.11 Director and Chapter
- `abstract class Chapter { id; enter(ctx); update(dt); exit(); }`, where `ctx` gives access to every core module.
- Director sequences chapters, runs transitions (section 5.6), and saves progress in localStorage under the room's namespace.
- After a room is completed once, chapter skipping unlocks.
- `?chapter=N` deep link for development.
- `exit()` must leave `renderer.info.memory` at baseline. Provide `deepDispose(object3D)` and a dev-mode leak check that warns in the console.

### 4.12 UI components (DOM, no framework, all styled by DESIGN.md)
- `ScriptureOverlay`: typeset verse with line-mask reveal, `aria-live`, selectable text, optional original-language line above.
- `ChapterCard`: large title, original-language word (Greek or Hebrew), transliteration, English, verse reference.
- `Whisper`: small fading hints ("drag", "hold", "look up").
- `HUD` slots: top-left, top-right, bottom-center, with oldstyle numerals.
- `Settings` panel: volume, quality, reduce flashing, reduced motion, language.
- `EndCard`: title, verse, buttons (Replay, Back to DELIVERED, Read the chapter, Share).
- `Postcard`: composites a canvas snapshot into a 1080x1350 image with designed typography. Uses the Web Share API on mobile, PNG download on desktop.
- `LoadingScreen` (section 5.8).
- `Cursor` (section 5.5).

### 4.13 i18n
- `t(key)`. English default, Amharic (`am`) second, persisted.
- Keys namespaced per room (`wretched.*`, `underneath.*`, `gain.*`, `hub.*`, `core.*`).
- Font swap to Noto Serif Ethiopic and Noto Sans Ethiopic when `am` is active, with an Amharic-specific type scale (Ethiopic glyphs need a slightly larger size and more line height to look balanced).
- Translate all core and hub UI strings into Amharic, natural and warm, never word-for-word robotic.

### 4.14 Scripture registry
- `scripture.ts` with typed entries: `{ ref, lang: 'en' | 'am', translation, text, verified, source }`.
- English: World English Bible (WEB, public domain) only. `pnpm verify:scripture` fetches the WEB text from ebible.org and compares every entry word for word. If the network is unavailable, mark entries `verified: false` and list them in DECISIONS.md.
- Amharic: source the verses from a public GitHub dataset of the 1962 Revised Amharic Bible (search GitHub for a well-structured JSON or USFM repo, prefer one with clear documentation, and record the repo URL and commit hash in DECISIONS.md). Rules:
  - That text is copyright © 1962, 2003 United Bible Societies / Bible Society of Ethiopia. Use it ONLY for the handful of verses the rooms quote. Never vendor or ship the whole Bible.
  - Fetch at build time with a script (`pnpm fetch:amharic`) that extracts only the listed references into `scripture.am.ts`, then commit that small file.
  - Credit it in the About panel and footer: "Amharic scripture: Revised Amharic Bible (1962), © United Bible Societies / Bible Society of Ethiopia. Used for non-commercial purposes."
  - The site must stay non-commercial: no ads, no paid features.
  - Cross-check each Amharic verse against a second independent source (for example biblehub.com/amh or another dataset) and log mismatches.
- Original languages: Greek and Hebrew words for chapter cards are verified against a reliable source and logged.

### 4.15 Safety and accessibility utilities
- Global flash limiter: at most 2 flashes per second, with a luminance-change threshold, applied by the Director and PostFX automatically.
- Reduced motion flags read from `prefers-reduced-motion` and settings.
- Keyboard focus management, beautiful visible focus rings, `aria-live` regions.
- Completion API: `markComplete(appId)` and `isComplete(appId)`, shared across rooms (key `delivered:complete:<appId>`).

### 4.16 Debug and screenshots
- `?debug` enables tweakpane, stats-gl, a chapter jumper, a physics debug view, and an input-filter visualizer.
- `pnpm shots`: a Playwright script that opens every app (headless Chromium with GPU flags, falling back to SwiftShader), jumps to every chapter with `?chapter=N`, waits for its "key moment" (each Chapter exposes `keyMomentAt` in seconds), and saves desktop (1440x900) and mobile (390x844) screenshots into `shots/`. Agents use this for the Beauty Review (section 6).

### 4.17 Shader and math library
- GLSL chunks: simplex noise 2D/3D/4D, fbm, curl noise, voronoi with edge distance, fresnel, heat distortion, blue-noise dithering (to kill gradient banding), hash functions, soft particles.
- TypeScript: easing set, seeded random, simplex noise, spring math, vector helpers, instanced-mesh helpers, vertex-animation-texture helper.

## 5. THE DESIGN BIBLE (write it as DESIGN.md; every room must follow it)
The north star: every single frame should look like a still from a film, and every interaction should feel like touching something expensive. If a screenshot of any moment would not look good as a phone wallpaper, it is not finished.

### 5.1 Composition and light
- One clear focal point per frame. Generous negative space.
- Depth in three layers in every scene: foreground particles or haze, a midground subject, a background atmosphere.
- Every scene has a key light, a rim light, and atmospheric fog. Flat lighting is banned.
- Never use pure #000000 or pure #FFFFFF. Darkest black is #07070A, brightest white is #F7F3EA.
- Each room has its own color grade via a 3D LUT, plus 2 to 4% film grain, a soft vignette, and blue-noise dithering on all gradients.
- Bloom is selective and restrained. Glow means something; it never washes the frame.

### 5.2 Color system
- Shared accents across the trilogy: gold #F5C76B, gold-light #FFE9B0, ink #07070A, bone #F7F3EA, mist #8E8A93.
- Each room defines its own palette in its PROMPT.md and maps it to the same token names, so UI stays consistent.
- Text on 3D scenes always sits on a soft local scrim (a blurred radial darkening) so it stays readable at WCAG AA contrast.

### 5.3 Typography
- Display: Cormorant Garamond (light and regular, italic for quoted scripture), tracking -0.01em at large sizes.
- UI: Inter (variable), tabular numerals in data, oldstyle numerals in prose and HUD.
- Original languages: Noto Serif (Greek), Noto Serif Hebrew (Hebrew). Amharic: Noto Serif Ethiopic for scripture, Noto Sans Ethiopic for UI.
- Fluid type scale with clamp(): display 56 to 112 px, title 32 to 48, verse 22 to 34, body 16 to 18, caption 12 to 13.
- Uppercase labels: letter-spacing 0.24em, 11 to 12 px, Inter medium.
- Verse references in small caps.
- Line length 28 to 60 characters for scripture. Balanced line breaks (`text-wrap: balance`).
- Self-host and subset every font. Preload the display font. `font-display: swap` with metric-matched fallbacks so nothing jumps.

### 5.4 Motion
- Nothing moves linearly. Easing tokens: `--ease-out-expo` for entrances, `--ease-in-out-quart` for camera and panels, a custom "breath" sine for idle loops.
- Durations: micro 160 ms, UI 420 ms, text reveals 900 to 1400 ms, camera moves 2 to 8 s.
- Text reveals: each line rises 12 px from behind a mask with a slight blur-to-sharp, staggered 60 ms per line. Default opacity fades alone are banned.
- Stagger lists 40 to 60 ms per item.
- Idle life everywhere: dust drifts, light breathes, fabric sways. No scene is ever fully frozen unless silence is the point.
- Respect reduced motion: replace movement with gentle crossfades.

### 5.5 Interface details
- No generic glassmorphism and no Bootstrap-looking buttons. Panels use a deep ink background at 72% opacity with a 1 px hairline border at 14% bone, and a 24 px backdrop blur only where it helps legibility.
- Buttons: pill or text buttons with a hairline underline that draws in on hover, magnetic hover (the button eases a few px toward the cursor), a soft gold inner glow on press.
- Custom cursor on desktop: a small bone dot with a slower trailing ring; it grows over interactive elements and shows a one-word label ("drag", "enter", "hold") when useful. Hidden on touch.
- Selection color: gold at 30%. Scrollbars hidden where scrolling is not needed.
- Icons: a tiny custom set drawn as 1.5 px strokes (sound, settings, share, back, replay). No emoji anywhere in the UI.
- Focus states are as designed as hover states.

### 5.6 Transitions
- Between chapters: shader transitions (noise dissolve, ink bleed, light wipe), chosen per room for meaning. No hard cuts unless the cut is deliberate drama.
- Between hub and rooms: the camera flies through the portal, the portal's light fills the screen, the new page loads behind that light, and the room fades in from the same color. The visitor never sees a blank white page.

### 5.7 UI sound
- Every interactive element has a sound, mixed very low: hover is a soft airy tick, click a warm muted thunk, open a gentle rising chime, close a falling one. All procedural from core Audio. Muted when sound is off.

### 5.8 Loading
- The loading screen is a designed moment: a single gold line draws itself across the screen while the percentage counts in oldstyle numerals, and the room title assembles letter by letter. Shaders compile during loading. Minimum display time 1.2 s so it never flickers.

### 5.9 Mobile beauty
- Design portrait first, then desktop. Respect safe areas. Primary actions sit in the thumb zone. Text never smaller than 15 px for body.
- Light haptics (navigator.vibrate on Android) on key moments, never constant.

### 5.10 Banned looks
Default Three.js grey materials, OrbitControls-style camera feel, unstyled HTML, emoji in UI, stock icon packs used as-is, pure black and pure white, harsh drop shadows, centered-everything layouts, gradient banding, Comic or "Christian clip-art" styling, rotating 3D crosses as decoration, walls of text.

## 6. THE BEAUTY REVIEW (required process for the core and every room)
At the end of each visual milestone:
1. Run `pnpm shots`.
2. Look at every screenshot (desktop and mobile) and score it 1 to 10 against this checklist: focal point clear, three depth layers present, lighting has key plus rim plus atmosphere, palette on-brand, typography from DESIGN.md, text readable, no banding, no default-looking UI, mobile layout intentional.
3. Anything below 8 gets fixed before the milestone is called done. Log scores and fixes in `BEAUTY.md`.

## 7. TECH STACK
three (latest stable) · postprocessing (pmndrs) · @dimforge/rapier3d-compat · gsap · troika-three-text · detect-gpu · tweakpane · stats-gl · vitest · playwright · eslint + prettier. No React.

## 8. THE HUB (apps/hub)
The hub is the first thing anyone sees. It has to be stunning in the first 2 seconds.
- A deep ink void with slow drifting gold dust and a faint aurora of light far behind.
- The DELIVERED wordmark: Cormorant Garamond light, wide tracking, one small gold mark, revealed letter by letter after the loader.
- The intro line beneath it: "Who will deliver me?" (Romans 7:24), in italic.
- Three tall arched portals floating in space, left to right: WRETCHED, UNDERNEATH, GAIN. Each portal is a frame of thin gold light with a live preview of its world inside (render-target portal, cheap preview scene):
  - WRETCHED: a dim ash plain, a figure chained to its own shadow, a warm light far away
  - UNDERNEATH: golden clouds seen from above, a tiny figure falling, huge soft arms of light far below
  - GAIN: a moonlit stone cell with one beam of light and dust in it
- The portals float with a slow breathing motion and respond to pointer parallax.
- Hover (or first tap on mobile): the portal opens slightly, its world brightens, its title and reference rise beneath it, and a soft audio preview of that room plays.
- Click: the camera flies through the portal (section 5.6) into the room.
- After a room is completed, its portal frame gains a small gold seal. When all three are completed, a quiet fourth line appears under the wordmark: "Delivered." with Romans 8:1.
- Footer: About · Credits · "Made by Kaleb Dida" · "English scripture: World English Bible (public domain)" · the Amharic credit (section 4.14) · and a quiet support line: "If you are carrying something heavy, please talk to someone you trust. findahelpline.com".
- Meta tags, a designed OG image (rendered from the hub scene at 1200x630), and a favicon (the small gold mark).
- A designed 404 page: a single lantern in the void with the line "Not lost. Just not here." and a link home.

## 9. CONVENTIONS.md (write this file; the room agents will follow it)
It must include:
1. Obey CLAUDE.md. No AI attribution anywhere. Never change the git identity.
2. Room agents work in their own worktree folder (`../delivered-<room>`) on their own branch (`app/wretched`, `app/underneath`, `app/gain`) and only touch `apps/<room>/**`. They never edit `packages/core`, other rooms, or root config.
3. If a room needs a core change, it writes the request in `apps/<room>/CORE_REQUESTS.md` and implements a local version under `apps/<room>/src/local-core/` so it is never blocked.
4. Commit message prefixes: `[core]`, `[hub]`, `[wretched]`, `[underneath]`, `[gain]`. Push after each milestone if a remote exists.
5. DESIGN.md is mandatory. The Beauty Review (section 6) is mandatory at every visual milestone.
6. Global reverence rules:
   - Never depict the face of Jesus or of God. Represent the divine with light, abstract forms, and silhouettes of light.
   - No gore, no jump scares, no horror imagery.
   - At most 2 lines of text on screen at once during gameplay.
   - English scripture: WEB only, verified. Amharic scripture: only via the core registry with credit.
7. Performance budgets per tier, accessibility rules, the flash limiter, and reduced motion are mandatory.
8. localStorage keys are namespaced `delivered:<app>:*`. i18n keys are namespaced per room.
9. Every room calls `markComplete(appId)` at its end and links back to the hub.
10. Every room must keep `pnpm build` passing for the whole repo.

## 10. CORE DEMO (packages/core/demo)
A small, beautiful playground that proves every module works: a glowing orb you can drag, a Verlet rope, a breakable Rapier chain, a ragdoll, a crumbling platform, a volumetric cloud bank, a light shaft, slow motion, a corrupting InputFilter toggle, every PostFX pass, procedural audio buttons, every UI component, the loader, the cursor, Postcard export, Settings, and the language switch. The room agents read this demo as living documentation, and it must itself follow DESIGN.md.

## 11. MILESTONES
After each milestone: run `pnpm build` and `pnpm test`, fix every error, commit (no AI attribution), and push if a remote exists.
- M1: Git and GitHub setup, monorepo, LICENSE, README, Engine, Loop, Quality, PostFX, CameraRig, beautiful placeholder apps, root build that assembles dist.
- M2: Input with InputFilter pipeline and mobile controls, Physics (including platform crumble), Verlet, Atmosphere (clouds, light shafts, fog, sky).
- M3: Audio engine with all procedural sounds, reverbs, and the UI sound kit.
- M4: Director/Chapter, transitions, all UI components, cursor, loader, i18n, scripture registry with both fetch/verify scripts, safety utilities, completion API.
- M5: DESIGN.md, CONVENTIONS.md, core demo, core README, `pnpm shots`. Run the Beauty Review on the demo.
- M6: Hub with live portals, transitions into rooms, footer, 404, meta, OG image, netlify.toml. Run the Beauty Review on the hub.
- M7: Create the three worktrees and branches (section 2.6), update START-HERE.md with exact paths, final push.

## 12. DEFINITION OF DONE
- `pnpm build` produces a working `dist/` with the hub and three beautiful placeholder rooms.
- The core demo exercises every module with zero console errors.
- Unit tests pass (InputFilter transforms, Director lifecycle, flash limiter, Verlet constraints, i18n, scripture registry).
- No memory growth when switching demo chapters 20 times.
- Hub Lighthouse mobile performance of at least 80, accessibility of at least 95.
- Every hub and demo screenshot scores 8 or higher in BEAUTY.md.
- Works on Chrome, Firefox, Safari (iOS 16+), and Android Chrome.
- `git log` shows no AI attribution in any commit. Verify with `git log --format=%B | grep -i -E "claude|co-authored|generated with"` returning nothing.

## 13. DO NOT
- Do not edit the three `apps/*/PROMPT.md` files.
- Do not build room content. Placeholders only.
- Do not add analytics, tracking cookies, ads, or any collection of personal data.
- Do not add AI attribution anywhere.
- Do not stop to ask me questions, except for the git identity check in CLAUDE.md. Decide, log it in DECISIONS.md, keep building.

## START
Read CLAUDE.md and the three room PROMPT.md files, do the git setup from section 2, write a short PLAN.md with the core API design and the design system plan, then start Milestone 1 immediately.
