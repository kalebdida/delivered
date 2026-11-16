# DELIVERED · Beauty Review (Phase 1)

Scored against the DESIGN.md checklist: focal point clear · three depth layers · key plus rim plus
atmosphere · palette on-brand · typography from DESIGN.md · text readable · no banding · no
default-looking UI · mobile layout intentional. Anything below 8 is fixed before the milestone is
done. Screenshots: `pnpm build && pnpm shots` (desktop 1440x900, mobile 390x844).

These scores were given from screenshots rendered with software WebGL at the medium tier, so they
show billboard clouds and no depth of field. The high tier (raymarched clouds) has not been seen on
real hardware yet and should be reviewed on a laptop before the rooms rely on it.

## Hub

| Screenshot | Score | Notes |
| --- | --- | --- |
| hub · desktop | 9 | Wordmark, intro and three lit arches read in one glance. Dust in front, portals mid, aurora behind. |
| hub · mobile | 8 | Three arches fit side by side in portrait; footer reduced to one row. The arches are small at 390 px wide. |
| 404 · desktop | 8 | One lantern, one line, one link. |

Fixes made during the review:
- Round 1 (5): portals overlapped the reference line and the footer; preview worlds were unreadable.
  Recomputed the camera from the aspect ratio so the arches take a third of the height.
- Round 2 (7): UNDERNEATH's clouds were missing (the billboard far-fade used view depth, so a camera
  above the layer faded everything out). Fixed in the core: the fade now uses horizontal distance.
  GAIN's beam pointed into the wall; WRETCHED's figure was unlit. Both corrected.
- Round 3 (8 to 9): touch controls no longer appear on the hub; hover labels cleared the footer.

## Core playground

| Screenshot | Score | Notes |
| --- | --- | --- |
| demo · light · desktop | 8 | Orb under the moonbeam, rope, standing stones in silhouette, stars. The stones are close to black. |
| demo · light · mobile | 8 | |
| demo · weight · desktop | 8 | Warm key, cool rim, long shadows. The ragdoll comes to rest lying down, so the pose is luck. |
| demo · weight · mobile | 8 | |
| demo · sky · desktop | 8 | Floating rock above a cloud sea at golden hour. The figure is a plain capsule. |
| demo · sky · mobile | 8 | |
| demo · will · desktop | 8 | Figure, long shadow, the distant light. Deliberately stark. |
| demo · will · mobile | 8 | |

Fixes made during the review:
- Round 1 (3 to 5 across the board): frames were muddy with coarse grain and lifted blacks. Cause:
  the grade pass assumed display space but ran in linear. Fixed in the core.
- Round 1: the light shaft and dust were invisible (shaft falloff too steep, dust sized in the
  wrong units). Both fixed in the core.
- Round 2: the island was a faceted blob; rebuilt from displaced noise. Lights rebalanced so every
  scene has a readable key and rim.

## Placeholder rooms

| Screenshot | Score | Notes |
| --- | --- | --- |
| wretched · desktop / mobile | 8 / 8 | Title, verse and reference on a slow gradient in the room palette. |
| underneath · desktop / mobile | 8 / 8 | |
| gain · desktop / mobile | 8 / 8 | |

## Known weak spots, for honesty
- The playground's figures are capsules. It demonstrates modules; it is not a room.
- The hub's preview worlds are small and simple by design (cheap render targets). They are worth a
  second pass once the real rooms exist and their look is known.

## Final art direction (branch `final-polish`)

One pass over the whole work after the three room beauty passes were merged. Captured with
`pnpm build && pnpm shots:slow …` (`scripts/shots-slow.mjs`): headless Chromium, SwiftShader,
medium tier, desktop 1440x900 and mobile 390x844, with the page's clocks replaced by one virtual
clock so verses and camera moves are where they would be on real hardware. CSS transitions still
run on the wall clock, so in these captures the DOM is always a little ahead of the scene.

### The hub's first two seconds
| Frame | Before | After | What changed |
| --- | --- | --- | --- |
| loading screen | 5 | 9 | The title, line and count sat about 420 px right of centre on a desktop (the full-width line stretched the grid column). Centred now, in every room. |
| the opening (2.7 s) | 6 | 9 | Before: the loader faded to black, then the scene faded in, with the wordmark already sitting there. Now the loader's title does not fade: it rises and becomes the wordmark, the scene comes up under the fading loader (no held black frame, in any room), the camera eases in, the aurora swells, and the three arches catch light left to right with a flare of bloom that settles. Labels and footer arrive after. |
| hub · desktop, settled | 8 | 8.5 | The preview figures were capsules; they are now the hooded visitor (below). WRETCHED's window shows the figure facing the far light with its dark double behind it; GAIN's shows the hooded prisoner at the edge of the beam. |
| hub · mobile, settled | 8 | 8 | Same figures; the arches sit a little higher. Still small at 390 px wide. |

### One visitor
The visitor had three different bodies. It now has one silhouette language everywhere: **a hood
drawn back to a soft point and opening onto shadow (no face), a mantle over the shoulders, a long
cloak**. Each room keeps its own dye: clay-light in WRETCHED, dusk blue in UNDERNEATH, dark wool in
GAIN. UNDERNEATH gained the peaked hood, the mantle and the shadowed face; WRETCHED's face went
into shadow and its mantle now falls into the skirt without a waist; the hub's three previews use
the same shape.

### One interface
- The end card carries the same quiet support line in every room (it was hand-appended in two
  rooms, centred in one, missing in WRETCHED).
- The word-by-word lines share one rhythm in all three rooms (1100 ms, 12 px rise, same sizes).
- Roof tiles are at a human scale everywhere they appear (Rome, Philippi, the courtyard).

### Leftover frames
Scores and the re-shoot log are in each room's `BEAUTY.md`. Summary:

| Frame | Before | After |
| --- | --- | --- |
| WRETCHED CH0 | 7 (in captures: black) | 8 |
| WRETCHED CH6 | 8 | 9 |
| UNDERNEATH CH5 push-in | 7 | 7.5 (logged, re-shoot limit reached) |
| UNDERNEATH CH5 reveal | 7 | 8 |
| GAIN CH3 Rome leg | 7 | 8 |
| GAIN CH3 Philippi house | 7 | 8 |
| GAIN CH1 mobile | 6 (found in this pass) | 8 |

### A bug this pass found
`PostFX.fadeTo(colour, 1, 0)` followed by a zero-length frame computed `Infinity * 0 = NaN`, and
the fade stayed NaN, so the frame stayed black for the rest of the session. `createApp` renders
exactly one zero-length frame after entering the first chapter, and WRETCHED's CH0 starts with an
instant fade to black, so WRETCHED could open on a black screen that never lifted. Fixed in the
core (an instant fade is applied without multiplying by the frame time).

### Still open, honestly
- UNDERNEATH CH5 push-in is the one frame still under 8.
- The hub's UNDERNEATH window shows the clouds and the falling visitor but the arms of light
  under them barely read.
- The custom cursor's ring shows in headless captures at the centre of the page; it is not there
  on touch devices and follows the mouse on desktop.
- Nothing here has been seen on a real GPU. Bloom, in particular, is softer in SwiftShader.
