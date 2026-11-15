# DELIVERED

One website, three interactive rooms, one word: deliverance.

| Room | Scripture | Theme |
| --- | --- | --- |
| **WRETCHED** | Romans 7:15 to 8:2 | delivered from yourself |
| **UNDERNEATH** | Deuteronomy 33:26-27 | caught when everything falls |
| **GAIN** | Philippians 1:12-25 | even death becomes gain |

A hub with three portals of light leads into the rooms. Everything is built with Three.js and is
fully procedural: no models, no textures, no audio files.

Made by Kaleb Dida.

## Run it

```bash
pnpm install
```

```bash
pnpm dev:hub
```

Other dev servers: `pnpm dev:wretched`, `pnpm dev:underneath`, `pnpm dev:gain`, and `pnpm dev:demo`
for the core playground.

```bash
pnpm build
```

builds every app into one `dist/`: the hub at `/`, the rooms at `/wretched/`, `/underneath/`,
`/gain/`, and the playground at `/demo/`. `pnpm preview` serves it the way Netlify will.

| Script | What it does |
| --- | --- |
| `pnpm test` | unit tests (vitest) |
| `pnpm lint` | eslint and a strict TypeScript check |
| `pnpm shots [app]` | screenshots of every chapter into `shots/` for the Beauty Review |
| `pnpm verify:scripture` | checks every English verse word for word against ebible.org |
| `pnpm fetch:web` / `pnpm fetch:amharic` | regenerate the scripture registry data |
| `pnpm og` | re-render the social card from the hub scene |

## How the repo is laid out

```
packages/core/        the shared engine and design system (README inside documents every module)
packages/core/demo/   a playground that exercises every module
apps/hub/             the landing page with the three portals, and the 404 page
apps/wretched/        room 1 (PROMPT.md describes it)
apps/underneath/      room 2
apps/gain/            room 3
scripts/              build, preview, screenshots, scripture tools
DESIGN.md             the design bible every room follows
CONVENTIONS.md        the rules for working in this repo
DECISIONS.md          why things are the way they are
BEAUTY.md             Beauty Review scores
```

## Scripture and credits

- English scripture: World English Bible (public domain).
- Amharic scripture: Revised Amharic Bible (1962), © United Bible Societies / Bible Society of
  Ethiopia. Used for non-commercial purposes. Only the verses the site quotes are included.
- Typefaces: Cormorant Garamond, Inter, Noto Serif, Noto Serif Hebrew, Noto Serif Ethiopic and
  Noto Sans Ethiopic, all under the SIL Open Font License.
- Built with three.js, postprocessing, Rapier, GSAP, troika-three-text, detect-gpu, tweakpane and
  stats-gl.

The site is non-commercial and collects nothing: no analytics, no cookies, no ads.

If you are carrying something heavy, please talk to someone you trust. [findahelpline.com](https://findahelpline.com)

## License

Code: MIT, Copyright (c) 2026 Kaleb Dida. Scripture texts remain under their own terms.
