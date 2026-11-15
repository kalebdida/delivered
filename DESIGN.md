# DELIVERED · the design bible

Every room follows this file. It is not a mood board; it is the rulebook, and `packages/core`
implements it so that following it is the easy path.

**North star:** every single frame should look like a still from a film, and every interaction
should feel like touching something expensive. If a screenshot of any moment would not look good
as a phone wallpaper, it is not finished.

Where the rules live in code: CSS tokens and components in `packages/core/src/styles/`, the same
palette for WebGL in `tokens.ts`, the grade and film treatment in `postfx.ts`. The playground
(`pnpm dev:demo`) shows all of it running.

## 1. Composition and light
- One clear focal point per frame. Generous negative space.
- Depth in three layers in every scene: foreground particles or haze (`Dust`, billboard
  `CloudField`), a midground subject, a background atmosphere (`Sky`, `HeightFog`, clouds).
- Every scene has a key light, a rim light, and atmospheric fog. Flat lighting is banned.
- Never use pure `#000000` or pure `#FFFFFF`. Darkest black is ink `#07070A`, brightest white is
  bone `#F7F3EA`. The LUT enforces this at the end of the pipeline (`gradeColor` maps 0..1 into
  ink..bone), so even a clipped highlight lands on bone.
- Each room has its own color grade via a 3D LUT (`GRADES.<room>` or your own `GradeParams`), plus
  2 to 4% film grain, a soft vignette, and dithering on all gradients. PostFX applies grain,
  vignette and dither by default; custom shaders with gradients add `glsl.dither`.
- Bloom is selective and restrained. Glow means something; it never washes the frame. Bloom only
  catches HDR values above the threshold, so make the *meaningful* light emissive above 1.0 and
  leave everything else below it. Use `postfx.setBloomSelection([...])` for strict selection.

## 2. Color system
Shared accents across the trilogy:

| Token | Hex | Use |
| --- | --- | --- |
| `--gold` | `#F5C76B` | the accent: deliverance, focus, the mark |
| `--gold-light` | `#FFE9B0` | highlights, pressed and active states |
| `--ink` | `#07070A` | the darkest value anywhere |
| `--bone` | `#F7F3EA` | the brightest value anywhere, body text |
| `--mist` | `#8E8A93` | secondary lines, quiet UI |

- Each room defines its own palette in its PROMPT.md and maps it to the **same token names**
  (`--ink`, `--surface`, `--mist`, `--accent`, `--accent-light`) under `[data-room='<room>']`, so
  every shared component restyles itself. `createApp` sets `data-room` for you. The mappings for
  the three rooms are already in `tokens.css` and `roomPalettes`.
- Text on 3D scenes always sits on a soft local scrim (a blurred radial darkening, class
  `dl-scrim`) so it stays readable at WCAG AA contrast. `ScriptureOverlay`, `ChapterCard` and
  `Whisper` do this already.

## 3. Typography
- Display: **Cormorant Garamond** (light and regular; italic for quoted scripture), tracking
  -0.01em at large sizes. Classes `dl-display`, `dl-title`, `dl-verse`.
- UI: **Inter** (variable). Tabular numerals in data (`dl-tabular`), oldstyle numerals in prose and
  HUD (the default).
- Original languages: Noto Serif (Greek, `dl-greek`), Noto Serif Hebrew (`dl-hebrew`, right to
  left). Amharic: Noto Serif Ethiopic for scripture, Noto Sans Ethiopic for UI.
- Fluid scale with `clamp()`:

| Role | Token | Range |
| --- | --- | --- |
| display | `--fs-display` | 56 to 112 px |
| title | `--fs-title` | 32 to 48 px |
| verse | `--fs-verse` | 22 to 34 px |
| body | `--fs-body` | 16 to 18 px |
| caption | `--fs-caption` | 12 to 13 px |
| label | `--fs-label` | 11 to 12 px, uppercase, 0.24em, Inter medium (`dl-label`) |

- Verse references in small caps (`dl-ref`).
- Line length 28 to 60 characters for scripture; balanced line breaks (`text-wrap: balance`).
- Amharic gets its own scale (`:root:lang(am)`): slightly larger sizes, more line height, no
  italics, no uppercase, no wide tracking. Ethiopic glyphs need the room.
- Fonts are self-hosted and subset (Fontsource, only the subsets used). `font-display: swap` with
  metric-matched fallbacks so nothing jumps.
- At most **2 lines of text on screen at once during gameplay.**

## 4. Motion
- Nothing moves linearly. Easing tokens: `--ease-out-expo` for entrances, `--ease-in-out-quart`
  for camera and panels, the "breath" sine (`--ease-breath`, `breath()` in TS) for idle loops.
  The same curves for gsap are in `motion` (`'expo.out'`, `'quart.inOut'`).
- Durations: micro 160 ms, UI 420 ms, text reveals 900 to 1400 ms, camera moves 2 to 8 s.
- Text reveals: each line rises 12 px from behind a mask with a slight blur-to-sharp, staggered
  60 ms per line (`splitLines` + `.dl-line`, or `.dl-rise` for blocks). Default opacity fades alone
  are banned.
- Stagger lists 40 to 60 ms per item (`style="--i: n"`).
- Idle life everywhere: dust drifts, light breathes, fabric sways. No scene is ever fully frozen
  unless silence is the point.
- Respect reduced motion: replace movement with gentle crossfades. `prefersReducedMotion()` in
  code; the CSS does it for every core component; the camera rig drops shake, parallax and FOV
  kicks; transitions become plain fades.

## 5. Interface details
- No generic glassmorphism and no Bootstrap-looking buttons. Panels (`dl-panel`) use ink at 72%
  opacity with a 1 px hairline border at 14% bone, and a 24 px backdrop blur only where it helps
  legibility.
- Buttons (`button()`): pill or text, with a hairline underline that draws in on hover, magnetic
  hover (the button eases a few px toward the cursor), a soft gold inner glow on press.
- Custom cursor on desktop (`Cursor`): a small bone dot with a slower trailing ring; it grows over
  interactive elements and shows a one-word label ("drag", "enter", "hold") from `data-cursor` or
  `cursor.setLabel()`. Hidden on touch.
- Selection color: gold at 30%. Scrollbars hidden where scrolling is not needed.
- Icons: the tiny custom set in `ui/icons.ts`, drawn as 1.5 px strokes. Add to it in the same
  style in your own room folder if you need more. No emoji anywhere in the UI. No stock icon packs.
- Focus states are as designed as hover states (`--focus-ring`: an ink gap, a gold ring, a glow).
- Touch targets are at least 44 px.

## 6. Transitions
- Between chapters: shader transitions chosen per room for meaning. `dissolve` (noise, neutral),
  `ink` (ink bleeding in: descent, loss), `light` (a wipe of light: arrival, deliverance). Set
  `transitionIn` on a Chapter. No hard cuts (`cut`) unless the cut is deliberate drama.
- Between hub and rooms: the camera flies through the portal, the portal's light fills the screen,
  the new page loads behind that light, and the room fades in from the same color
  (`setArrivalColor` in the hub, picked up automatically by `createApp`'s loader). The visitor
  never sees a blank white page.

## 7. UI sound
Every interactive element has a sound, mixed very low: hover is a soft airy tick, click a warm
muted thunk, open a gentle rising chime, close a falling one. All procedural (`audio.ui.*`), wired
to every link and button by `bindUISounds` (done in `createApp`). Muted when sound is off.

## 8. Loading
The loading screen (`LoadingScreen`) is a designed moment: a single gold line draws itself across
the screen while the percentage counts in oldstyle numerals, and the room title assembles letter
by letter. Shaders compile during loading. Minimum display time 1.2 s so it never flickers.

## 9. Mobile beauty
- Design portrait first, then desktop. Respect safe areas (`--safe-*`). Primary actions sit in the
  thumb zone. Body text never smaller than 15 px.
- The virtual joystick (thin ring, soft glow, follows the thumb) lives on the left half; action
  buttons on the right.
- Light haptics (`haptic()`) on key moments, never constant.

## 10. Banned looks
Default Three.js grey materials, OrbitControls-style camera feel, unstyled HTML, emoji in UI, stock
icon packs used as-is, pure black and pure white, harsh drop shadows, centered-everything layouts,
gradient banding, Comic or "Christian clip-art" styling, rotating 3D crosses as decoration, walls
of text.

## 11. The Beauty Review (required at every visual milestone)
1. `pnpm build && pnpm shots <app>`.
2. Look at every screenshot (desktop 1440x900 and mobile 390x844) and score it 1 to 10 against:
   focal point clear · three depth layers present · lighting has key plus rim plus atmosphere ·
   palette on-brand · typography from this file · text readable · no banding · no default-looking
   UI · mobile layout intentional.
3. Anything below 8 gets fixed before the milestone is called done. Log scores and fixes in
   `BEAUTY.md` (rooms: `apps/<room>/BEAUTY.md`).

Set each chapter's `keyMomentAt` (seconds) to the moment it looks its best; that is when the
screenshot is taken.
