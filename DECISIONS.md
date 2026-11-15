# DELIVERED · decisions

Non-obvious choices made while building Phase 1, newest context first. Rooms keep their own log in
`apps/<room>/DECISIONS.md`.

## Environment
- **Built in a cloud session.** By Kal's instruction the `gh repo create` step and the three git
  worktrees were skipped: the repo already existed and work is pushed to `main`. The three room
  branches (`app/wretched`, `app/underneath`, `app/gain`) were created from `main` and pushed
  instead; `START-HERE.md` explains how to use them with or without worktrees.
- **Git identity.** The cloud container's default identity was an AI one, so work stopped and Kal
  chose to set this repo's local identity to his own. Every commit is authored by Kaleb Dida and
  carries no attribution trailers.
- **Lighthouse was not run.** The cloud session could not launch it, so the hub's Lighthouse
  scores (target: mobile performance 80, accessibility 95) are unmeasured. What was done toward
  them: about 257 KB gzipped of JS on first load, self-hosted subset fonts with `font-display: swap`,
  real links for the three portals, labelled controls, focus rings, AA contrast on text.
- **Browsers.** Everything was exercised in headless Chromium only (software WebGL). Firefox,
  Safari on iOS and Android Chrome have not been tested by hand yet.

## Repo and build
- **TypeScript 5.9**, not 7: typescript-eslint does not support TypeScript 7 yet.
- **The core is consumed as source** (`exports` points at `src/index.ts`); each Vite app compiles
  it. No separate build step, and tree-shaking drops what a room does not use.
- **One shared Vite config** (`vite.base.mjs`, `defineApp(base)`), so rooms cannot drift.
- **`pnpm lint` is eslint plus `tsc`.** Prettier is configured (`pnpm format`) but not enforced, so
  a formatting difference can never block a room agent's milestone.
- **The playground ships at `/demo/`** (noindex, disallowed in robots.txt) because the room agents
  read it as living documentation and it is useful when debugging on a real phone.
- **`pnpm shots` and `pnpm og` use Playwright's Chromium.** On a laptop run
  `pnpm exec playwright install chromium` once, or set `PW_CHROMIUM` to any Chrome binary.

## Engine
- **Tone mapping lives in PostFX**, not on the renderer: the renderer stays linear so bloom and
  custom effects work in HDR, then exposure → ACES filmic → LUT → grade run in the final pass.
- **The grade pass works in display space** (it converts in and out itself) so grain, fades and
  dithering are perceptually even. Running it in linear made the grain coarse and lifted the blacks.
- **"Never pure black or white" is enforced by the LUT**, which maps 0..1 into ink..bone.
- **Selective bloom defaults to an HDR luminance threshold** (cheap, no extra render). Strict
  per-object selection is available with `postfx.setBloomSelection`.
- **Chapter transitions are "cover, swap, reveal"** with a patterned mask (dissolve, ink, light)
  instead of rendering two chapters at once. It halves peak GPU memory and keeps the leak check
  honest.
- **`Chapter.root` and `own()`** make cleanup the default path, because "exit must leave memory at
  baseline" is easy to get wrong three times in parallel. Verified: 20 chapter switches in the
  demo leave `renderer.info.memory` identical per chapter.
- **The leak check skips the very first chapter exit**: that one also includes engine-owned
  allocations (shadow maps, bloom buffers, the LUT).
- **Raymarched clouds render as a backdrop** (after the sky, before everything else) rather than
  depth-compositing with the scene. Flying *through* cloud is done with billboard wisps and fog,
  which look better at that range anyway. Documented in the README.
- **Clouds use a generated tiling 3D noise texture** on the high tier instead of in-shader simplex:
  several times cheaper per march step.
- **Height fog is injected per material** (`HeightFog.apply`) with shared uniforms rather than
  patching three's global shader chunks, so it is explicit and live-tweakable.
- **`Physics.remove` remembers removed bodies.** Rapier recycles handles, so removing a stale body
  twice crashed the WASM; found by the chapter-switch test.
- **Rapier is heavy: about 1.65 MB gzipped** (`@dimforge/rapier3d-compat` embeds its WASM as
  base64). It is loaded lazily, only by apps that pass `physics: true`. A room that uses it has
  roughly 350 KB left in the 2 MB budget; GAIN can stay light by using `Verlet` for its chain.
- **Debug libraries (tweakpane, stats-gl) are dynamically imported** behind `?debug`.
- **Input exposes `custom` actions** beyond the fixed semantic set so rooms can add their own
  buttons (UNDERNEATH's "look up") without a core change.
- **`corruptionFilter` ships in the core** as a ready mix of the five betrayals, because WRETCHED's
  central mechanic should not depend on a room-local reimplementation.
- **`createApp` shows a Begin button by default** so audio always unlocks with a real gesture. The
  hub turns it off: it has to be stunning in the first two seconds, and its audio simply starts on
  the first interaction.

## Hub
- **The portals are real links.** Each portal has an `<a>` pinned under it, so keyboard and
  screen-reader visitors get the same three doors; focusing one opens the portal like a hover.
- **First tap opens, second tap enters** on touch devices.
- **Preview scenes render at half rate** unless hovered, and at a resolution chosen by tier.
- **The long credit lines are in the footer on desktop and in the Credits panel on phones**, where
  a three-line footer would crowd the portals. About and Credits always contain everything.
- **The hub-to-room hand-off uses `sessionStorage`** (`delivered:core:arrival`): the hub stores the
  portal's light color, and the room's loader or placeholder starts from it.
- **The 404 page is Canvas 2D**, not WebGL: it has to be tiny and can never fail.
- **The social card is a JPEG** rendered from the live hub scene (`pnpm og`).
- **The fourth line after completing all three rooms** shows "Delivered." with the first clause of
  Romans 8:1 and the reference.

## Scripture
- **English (WEB) is generated, not typed.** `pnpm fetch:web` extracts the verses from the USFM
  release on ebible.org (`https://ebible.org/Scriptures/eng-web_usfm.zip`); `pnpm verify:scripture`
  re-downloads and compares word for word. Result at the end of Phase 1: 30 of 30 match.
  The three key texts quoted in the room prompts match exactly (the registry keeps WEB's
  typographic apostrophes; the verifier treats straight and curly quotes as equal).
- **Every verse listed in all three room prompts is pre-registered** in both languages, so no room
  needs to touch the core for scripture.
- **Rooms register partial quotations in `apps/<room>/src/scripture.ts`** (a plain data module),
  which the verifier also reads.
- **Amharic source.** Primary: `github.com/biniama/ethiopic-bible-data` at commit
  `3ad70e77329e7dc5bbb1ed9b5efdc8e223ae5f2f` (structured JSON, documented schema, text scraped from
  ethiopicbible.com). Secondary, for the cross-check: `github.com/magna25/amharic-bible-json` at
  commit `e873238679d26668280f8ddf2d62046f8bbb79c4` (scraped from wordproject.org). The two were
  scraped from different sites, so they are independent. biblehub.com/amh could not be used: it
  returned 404 from this environment.
- **Cross-check result (30 verses):** 24 identical in both sources; 2 merged verses confirmed in
  both (Romans 8:4 is one sentence with 8:3, Philippians 3:8 with 3:9); and 4 marked
  `verified: false`:
  - **Deuteronomy 32:15, 33:26, 33:27**: the primary source keeps only the first poetic line of
    each verse. The full text was taken from the secondary source, which begins with exactly the
    primary's line. Each is therefore attested in full by one source only.
  - **Philippians 1:25**: merged with 1:26 in the Amharic text; the secondary source has this
    verse empty (its numbering slips at this point), so the primary text is unconfirmed.
  These four should be checked against a printed 1962 Amharic Bible before launch.
- **Amharic merged verses** keep the merged sentence under the later verse's reference, with a
  `note`. `passage()` does not repeat a sentence when a range covers both halves.
- **Amharic references** are formatted in the Ethiopian style (`ሮሜ 8፥1`).
- **Only the quoted verses are shipped.** The fetch script reads six book files at build time and
  writes 30 verses; nothing else from the Amharic Bible enters the repo.

## Original languages (verified)
Used on the hub and in the playground; the rooms verify their own chapter-card words the same way.

| Text | Where | Checked against |
| --- | --- | --- |
| θέλω | Romans 7:15, 7:19 (7:18 has the infinitive θέλειν) | SBLGNT, `github.com/LogosBible/SBLGNT` |
| τίς με ῥύσεται | Romans 7:24 | SBLGNT |
| וּמִתַּחַת זְרֹעֹת עוֹלָם | Deuteronomy 33:27 | Westminster Leningrad Codex, `github.com/openscriptures/morphhb` (cantillation marks removed, vowel points kept) |
| יְשֻׁרוּן | Deuteronomy 33:26 | Westminster Leningrad Codex |

Note for WRETCHED: the prompt pairs θέλω with Romans 7:18, where the Greek has θέλειν ("to will").
θέλω itself is in 7:15, 7:19 and 7:21; the chapter card should cite one of those.

## i18n
- **Amharic UI uses polite forms** (ይጀምሩ, ይመለሱ): warm, and also gender-neutral, which the bare
  imperative is not.
- **The wordmark and room titles stay in Latin capitals** in both languages; they are names.
- **The hub's intro line in Amharic** ("ማን ያድነኛል?") is the closing words of Romans 7:24 in the 1962
  text, quoted exactly.
- The Amharic strings were written with care but have not been reviewed by a second native reader.

## Design system
- **Fonts come from Fontsource packages**, importing only the subsets in use (Latin for Cormorant
  and Inter, Greek and Greek Extended, Hebrew, Ethiopic).
- **The display font is not preloaded with a `<link>`**: Vite hashes font filenames, so the fonts
  load through CSS with `font-display: swap` and metric-matched fallbacks instead.
- **The gold mark** is a descending ray meeting an open arc: light arriving from outside, into
  something held open. It is the favicon, the seal on completed portals and the loader's emblem.
- **Chapter transitions default to `dissolve`**; rooms choose `ink` or `light` per chapter.

## Core requests (merged after WRETCHED)
- **HeightFog program keys (WRETCHED #1, fixed).** `apply` now captures the material's key before
  patching (its own `customProgramCacheKey`, or else the source of its previous `onBeforeCompile`)
  and appends `+heightFog`, so materials with different prior patches compile separate programs.
- **Partial quotations (WRETCHED #3, done).** Partials are stored apart from full verses, several
  per reference, and never replace the verse. Read them with `partial(ref, n)` or
  `ui.scripture.show({ ref, partial: n })`.
- **A room line in the About panel (WRETCHED #2, skipped).** The rooms have no About panel yet:
  it lives only in the hub. Adding one to `Chrome` is a new feature (UI, i18n, focus handling),
  not a small fix, so it waits for a later core pass.
