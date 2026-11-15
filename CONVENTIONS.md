# DELIVERED · conventions

Rules for everyone (human or agent) building in this repo. Short on purpose; all of it is binding.

## 1. Authorship
Obey `CLAUDE.md`. Kaleb Dida is the sole author. No AI attribution anywhere: not in commit
messages, PR text, code comments, docs, package.json or the site. Never change the git identity.

## 2. Where you work
- Each room is built in its own worktree folder on its own branch, and touches only its own app:

| Room | Folder | Branch | May edit |
| --- | --- | --- | --- |
| WRETCHED | `../delivered-wretched` | `app/wretched` | `apps/wretched/**` |
| UNDERNEATH | `../delivered-underneath` | `app/underneath` | `apps/underneath/**` |
| GAIN | `../delivered-gain` | `app/gain` | `apps/gain/**` |

- Never edit `packages/core`, another room, the hub, or root config (`package.json`,
  `pnpm-workspace.yaml`, `vite.base.mjs`, `tsconfig*.json`, `netlify.toml`, `scripts/`).
- Never edit or delete any `apps/*/PROMPT.md`.
- A room may add dependencies only to its own `apps/<room>/package.json`. Prefer what the core
  already ships (three, gsap, postprocessing, Rapier, troika-three-text).

## 3. Needing something from the core
Do not wait and do not edit the core. Write the request in `apps/<room>/CORE_REQUESTS.md` (what,
why, the API you wish existed) and implement a local version under `apps/<room>/src/local-core/`
so you are never blocked. Requests are merged into the core after the rooms land.

## 4. Commits
- Prefixes: `[core]`, `[hub]`, `[repo]`, `[wretched]`, `[underneath]`, `[gain]`.
- Short, clear, imperative. No trailers of any kind.
- After each milestone: `pnpm build` and `pnpm test` must pass, then commit and push if a remote
  exists.
- Before finishing: `git log --format=%B | grep -i -E "claude|co-authored|generated with"` must
  print nothing.

## 5. Design
`DESIGN.md` is mandatory. The Beauty Review is mandatory at every visual milestone: `pnpm shots
<room>`, score every screenshot, fix anything under 8, log it in `apps/<room>/BEAUTY.md`.

## 6. Reverence
- Never depict the face of Jesus or of God. Represent the divine with light, abstract forms, and
  silhouettes of light.
- No gore, no jump scares, no horror imagery.
- At most 2 lines of text on screen at once during gameplay.
- Text never shames or mocks the visitor.

## 7. Scripture
- English: World English Bible (WEB) only, verified. Every verse the three PROMPT.md files list is
  already in the core registry in English and Amharic: use `verse('Romans 7:19')`,
  `passage('Romans 7:24-25')`, or `ui.scripture.show({ ref })`. Never type scripture into a string
  in your own code.
- A shorter quotation (part of a verse) is registered by the room in
  **`apps/<room>/src/scripture.ts`**, a plain data module with no imports:

  ```ts
  export const scripture = [
    { ref: 'Romans 7:24', lang: 'en', translation: 'WEB', text: 'Who will deliver me', partial: true, verified: true, source: 'https://ebible.org/Scriptures/eng-web_usfm.zip' },
  ];
  ```
  then `registerScripture(scripture)` at startup. `pnpm verify:scripture` reads that file and
  checks every entry against ebible.org word for word; it must pass before a milestone is done.
- A verse that is not in the registry at all: add it the same way with the full WEB text
  (copy it from ebible.org, then let `pnpm verify:scripture` prove it), and note it in
  `CORE_REQUESTS.md` so the Amharic text can be added to the core.
- Amharic scripture comes only from the core registry (Revised Amharic Bible 1962, © United Bible
  Societies / Bible Society of Ethiopia, used for non-commercial purposes). Never paste Amharic
  Bible text from elsewhere, and never ship more than the verses quoted. If a verse has no Amharic
  entry the registry falls back to English.
- Greek and Hebrew words on chapter cards must be checked against a reliable source text (SBLGNT
  or Nestle-Aland for Greek, the Westminster Leningrad Codex for Hebrew) and logged with the source
  in `apps/<room>/DECISIONS.md`.
- Scripture texts stay under their own terms; the MIT license covers the code only.
- The site is non-commercial: no ads, no paid features, no analytics, no tracking cookies, no
  collection of personal data.

## 8. Performance, accessibility, safety
- Read budgets from `ctx.quality.budget` (particles, instances, shadows, post FX level, raymarch
  steps, cloud mode, bodies). Never hard-code a count that ignores the tier. Targets: 60 fps on a
  mid-range laptop with integrated graphics, 30 fps or better on a 3 to 4 year old mid-range
  Android phone.
- Everything a chapter creates goes under `this.root` or through `this.own()`, so `exit()` leaves
  GPU memory at baseline. The dev build warns in the console when a chapter leaks.
- Anything that flashes goes through the flash limiter (at most 2 flashes per second). `postfx.flash`,
  fast `postfx.fadeTo` and `postfx.glitchBurst` already do; custom effects call
  `flashLimiter.request(delta)`.
- Honor `prefersReducedMotion()`: movement becomes a gentle crossfade.
- Everything interactive is reachable by keyboard, has a visible focus ring, and announces itself
  (`announce()`, `aria-live`). Every action has touch, keyboard and gamepad paths through `Input`.
- Total room payload under 2 MB gzipped. Everything procedural: no large models, textures or
  audio files.

## 9. Namespaces
- localStorage: `delivered:<app>:*` (use `ctx.store`). Shared keys the core owns:
  `delivered:core:*`, `delivered:complete:<appId>`.
- i18n keys: `wretched.*`, `underneath.*`, `gain.*`, `hub.*` (the core owns `core.*`). Every string
  a visitor can read gets an Amharic translation, written naturally and warmly, never word for word.

## 10. Every room
- Boots with `createApp({ appId, ... })` and builds chapters as `Chapter` subclasses.
- Opens every chapter with a `ChapterCard`.
- Calls `markComplete(appId)` at its end and links back to the hub (`EndCard` does the link).
- Keeps `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm verify:scripture` passing for the whole
  repo.
