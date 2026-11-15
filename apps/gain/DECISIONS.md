# GAIN · decisions

Choices made while building milestones M1 to M5, newest context first. M6 (mobile polish,
accessibility pass, Amharic strings, performance pass, final care-rule review) is a later run.

## Scope and build
- **No Rapier, at all.** GAIN never passes `physics: true`, and `apps/gain/vite.config.ts` aliases
  `@dimforge/rapier3d-compat` to `src/local-core/no-rapier.ts`, a stub that throws if anything
  ever calls it. The core's lazy Rapier chunk (about 1.67 MB gzipped) is therefore not even
  emitted into `dist/gain`. Every chain, rope and cloth in the room is core `Verlet`.
- **Payload.** Everything is procedural (masonry, flagstones, wool, the sea, the map). The only
  room files are three subset fonts for the 3D type (Cormorant Garamond italic and light, Noto
  Serif Greek, WOFF from Fontsource, 74 KB together). Every file in `dist/gain`, gzipped and
  summed, is 1.36 MB (that counts every core font file, of which a browser loads only a few), so
  the room is inside the 2 MB budget with room to spare.
- **3D type never fetches anything.** troika falls back to a CDN for glyphs its font lacks, so the
  sentence and the column labels only ever contain glyphs of the bundled fonts, and a word the
  visitor types goes through `sanitizeWord` (Latin, Greek, digits, a little punctuation; nothing
  is stored or sent). A word in another script becomes "…" on the papyrus.
- **The test hook** `?test` exposes the context as `globalThis.__gain`, like UNDERNEATH's.

## Look (M1, the film still)
- **The window is a slanted chute.** The moon is high and the wall is 0.42 m thick, so a straight
  opening lets no parallel light through (the first build had an invisible beam for exactly this
  reason). The opening is cut along the beam: the small barred window on the outer face, the
  inner opening moved along the light (`CHUTE` in `world/layout.ts`), four parallelogram sides.
- **The beam (high tier) is raymarched** inside an oriented box. Each sample is traced back along
  the (parallel) moonlight to the outer window and its bars, so the shaft carries the bars'
  shadows; slow two-octave noise gives it haze; a Henyey-Greenstein phase brightens it when the
  camera looks toward the window. Medium and low use the core `LightShaft` cone. Every tier has
  the same motes (only the ones inside the light are visible), a floor scatter decal, a spot light
  from outside the window (shadowed on medium and high, so the bars fall across the floor), a cool
  floor bounce, and a "scatter" light at the middle of the beam that rims the figure.
- **The cheap cone needed intensity 1.7, not the demo's 0.5**: its alpha is applied twice under
  additive blending, so at 0.5 it was invisible.
- **The inner opening glows** with the barred window's shape (an additive quad): from inside you
  would see bright sky through the chute only along the beam, and a film would show the window as
  a light source. This is the one cheat in the still.
- **The lamp sits on the ledge beside the visitor**, not in front: from the side it rims the
  figure and paints a warm pool on the masonry, which is what the still needed. It is the only
  warm light in the cell.
- **Masonry, flagstones and wool are baked at load** into 512² (256² for wool) DataTextures with
  normal and roughness maps; walls are damp low down and in streaks under the window (a roughness
  and albedo patch in `dampStone`), so the moon catches a wet sheen.
- **The visitor's cloak is Verlet cloth** (15×15) pinned at the shoulders, colliding with spheres
  on the body and with the ledge. The hood is an open shell over a dark inner sphere: there is no
  face. People in Philippi have a head and a head-covering; no faces are drawn.

## The sentence engine (M2)
- **The rule lives in `logic/sentence.ts`** and is unit-tested: every object and anything typed
  (even the word "Christ") gives LOSS; only stepping into the beam gives GAIN. A typed "Christ" is
  still something the visitor put in the blank themselves; the gain is not a word you find.
- **The fixed words are scripture partials** (`For to me to live is`, `and to die is`, `Christ`,
  `gain`) registered in `src/scripture.ts` and read back with `partial()`. "LOSS" is a UI string.
- **Each object fails its own way**: coins tarnish and slide off the stack one by one, dissolving
  as they fall into dark gold sand; the laurel's leaves brown and flutter down, then the twig
  gives; the cushion sighs flat and goes to dust in a slow puff; the credentials' seal cracks and
  drops, then the scroll splits into flakes; the burning heart cools to grey stone and breaks into
  falling chunks; the mirror fogs, cracks in a web, and runs out of its frame as sand; the
  visitor's own papyrus loses its ink, browns and flakes. Each has its own warm motif and its own
  collapsed, detuned version.
- **The life is played on a small stage in front of the visitor** with a camera push-in, so each
  failure is large enough to read.
- **The moonbeam is never pointed at.** It is the last item in the keyboard list (it has to be
  reachable), but no highlight, label or hint draws attention to it until the whisper after three
  tries, and the motes only drift toward the visitor after five.
- **What is left when the sentence completes dissolves quietly with a gold edge** (3:8, "count
  them nothing but refuse"), so the reveal has one focus.

## Chapters
- **CH2's chains are dragged by grabbing the nearest link on screen** (or shaken with Space or the
  action button); a rattle is a velocity threshold on the Verlet chain, with a cooldown. After
  three rattles a gold flash follows the wave through the door to the praetorium. Outside, every
  rattle sends a wave from the cell window across the courtyard (about 8 to light all 300 guards),
  then further out over the city; if the visitor stops, a gentle wave goes on its own every 6 s.
- **CH3's writing is a CanvasTexture** over the papyrus: the visitor's strokes in gold fade as the
  real words (1:1 partial, 1:2, then 1:21) are revealed in proportion to how much they have
  written. Philippians 1:2 is not in the core registry: it is registered in `src/scripture.ts`
  and noted in `CORE_REQUESTS.md` for the Amharic text.
- **The flight changes scale twice**, hidden by a white flash and a fade: Rome's roofs at metre
  scale, the Mediterranean at 1 km = 0.02 units (coastlines hand-simplified from real
  coordinates; the road goes over the Apennines to Brundisium, across to Dyrrachium and along the
  Via Egnatia), then the house in Philippi at metre scale.
- **CH4's two doors are in the right wall**: the depart doorway of light is new, to the visitor's
  left; the remain door is the cell's own heavy door, to the right. The chains stay on the wrists
  but their wall ends come loose so the visitor can walk; they drag behind.
- **The depart door's safety is data, not scene code** (`logic/doors.ts`): its state is a frozen
  constant, `request('depart')` always answers "not-yet", the module has no function that opens
  anything, and every step goes through `resolveVeil`. The forbidden region is the veil's
  half-disc plus everything behind the wall. The first version of the test caught that a teleport
  far behind the wall was "outside the disc"; fixed by including the half-plane.
- **CH5: sitting with someone is a kneel beside them** (the figure has no bench out there). People
  light up, the sun warms, the garden grows with the share lit; "go on" appears after four or
  after 40 s, and lighting everyone ends the chapter on its own.
- **CH6 draws two tubes of light** on the map: living (the letter's road, through Philippi, then
  up) and departing (straight up from the cell), meeting in one radiant point. 1:21 then appears
  word by word, and "Either door, the same Light."
- **The support line** is appended to the core end card (the core has no slot for it yet), like
  UNDERNEATH. The rooms have no About panel yet (core request, same as WRETCHED #2).

## Greek (verified)
Checked against SBLGNT (`github.com/LogosBible/SBLGNT`, `data/sblgnt/text/Phil.txt`):

| Card word | In the text | Note |
| --- | --- | --- |
| δεσμοί | 1:13 τοὺς δεσμούς μου | nominative plural of the accusative in 1:13 |
| τὸ ζῆν Χριστός | 1:21 τὸ ζῆν Χριστὸς | the final grave becomes acute when the phrase stands alone |
| κέρδος | 1:21 κέρδος | exact |
| ζημία | 3:7 ζημίαν | nominative of the accusative in 3:7 |
| συνέχομαι | 1:23 συνέχομαι | exact |
| ἀναλῦσαι | 1:23 εἰς τὸ ἀναλῦσαι | exact |
| ἐπιμένειν | 1:24 τὸ δὲ ἐπιμένειν | exact |

The full Greek of 1:21 shown with the verse in CH1 (`ἐμοὶ γὰρ τὸ ζῆν Χριστὸς καὶ τὸ ἀποθανεῖν
κέρδος.`) is SBLGNT, with the initial capital of the sentence lowered as SBLGNT prints it.

## Not done in this run
- M6: Amharic strings (the core falls back to English), a dedicated mobile layout pass, the
  performance pass on a real phone, and the final care-rule review.
- Browsers: exercised in headless Chromium with software WebGL only.
- The Beauty Review was run once, at the end (see `BEAUTY.md`).
