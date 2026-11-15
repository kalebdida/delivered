# GAIN · Beauty Review

One review, at the end of M5, as asked for this run. Headless Chromium with SwiftShader (software
WebGL), `?quality=high`, desktop 1440x900 for every chapter's key moment and for the interactive
moments, mobile 390x844 for CH1, CH4 and CH6 only. Scored 1 to 10 against DESIGN.md §11 (focal
point, three depth layers, key + rim + atmosphere, palette, type, legibility, no banding, no
default-looking UI, intentional mobile layout).

Two capture caveats. Software rendering runs far slower than real time, and two things run on
the wall clock rather than the scene clock: the core camera paths (gsap, with lag smoothing) and
the scripture overlay's duration. So in captures a camera path can lag behind where it would be,
and a verse can already have faded. Neither happens in a real browser.

## M1 · the film still (before moving on from M1)
The bar: deep shadows, one strong volumetric beam, visible dust motes, the warm lamp as the only
counter-light. Scored on the cell's still framing.

| Pass | Score | What was wrong · what changed |
| --- | --- | --- |
| 1 | 3 | Beam invisible: a parallel beam cannot pass a 0.42 m wall at that angle. Cut the window as a slanted chute along the light. |
| 2 | 5 | Beam present but the room black, the beam a streaky curtain, the figure a capsule mannequin. Softer haze, a cool floor bounce, exposure up. |
| 3 | 6 | Window read as nothing. Added the glowing barred opening (the one cheat). Figure: Verlet wool cloak, hood, wool texture. |
| 4 | 7 | Straw double-darkened by instance colours; figure had no rim. Fixed the straw; a scatter light in the beam rims the figure; lamp moved onto the ledge beside the visitor. |
| 5 | **8** | Motes brighter and larger, hood reads as a hood, masonry less regular, framing tightened so the window, the beam, the pool of moonlight, the visitor and the lamp all sit in one frame. Medium tier checked too (cone needed 3.4x the demo intensity). |

## Final review (desktop)

| Chapter · moment | Score | Notes and fixes made in this review |
| --- | --- | --- |
| CH0 threshold, 4.5 s | 8 | Black, one line in Cormorant italic, the blank breathing in moonlight blue. |
| CH1 ledger, 9 s | 8 | The sentence floats clear of the window; the seven things float in the lamp's light around the visitor; the beam stays in the corner; ζημία column on the left wall. Fixed: sentence moved off the window, objects into the warm light, a warm fill that dies with the lamp, the heart moved off the visitor's head, a cool light on the column. |
| CH1 a life (laurel, keyboard) | 8 | "fame" writes in warm ink, the lamp swells, years flicker, the lamp dies, the leaves fall, LOSS writes in grey. Fixed: the life now plays on a stage in front of the visitor with a camera push-in, so each failure reads. |
| CH1 the reveal | 9 | The visitor rises, walks into the moonbeam and kneels lit by it; "Christ" writes in light; the beam brightens and warms as the lamp dies; GAIN in gold; the LOSS column cracks along gold seams beside a column of light. Fixed: the κέρδος column was a blown-out solid (now edge-lit with rising threads) and covered the sentence (moved toward the camera); leftover objects now dissolve with gold edges; reveal framing pulled back. |
| CH2 chains in the cell | 8 | Gold links glowing in the dark against the warm lamp pool. |
| CH2 the palace guard | 7 | Waves spread, guards light one by one, counter climbs. Fixed: lit guards were flat gold candles (emissive cut to a warm glow), the wave band was a wide white stripe (thinner, dimmer), the courtyard and city were black (moonlight up; per-scene fog, see below). Still open: the guards' silhouette is simple. |
| CH3 the desk, 8 s | 8 | Papyrus, lamp, reed pen and chain on the ledge in a warm pool. Fixed: the desk camera pointed at the floor; the gold ink was too pale on lamp-lit papyrus (now gold over a dark bronze edge). |
| CH3 the flight | 7 | Rooftops, the moonlit sea with the coastlines, the house in Philippi filling with light. Fixed: the scene kept the cell's dense dark fog at kilometre scale, which turned the land and the city black (each scene now sets its own air); the camera flew too low over the land; the Rome leg had no lit windows. |
| CH4 the two doors, 9 s | 8 | The sealed arch of light (cool, still) and the ordinary door (warm light spilling under it), the visitor between them, chains dragging. Fixed: the veil was blown out (now soft folds); the remain door was dark (warm spill); the follow camera started inside the left wall. |
| CH5 the courtyard, 14 s | 7 | A sunlit courtyard, people in groups, the garden. Fixed: the camera started inside a house (black frame); every outdoor surface used the cell's 2% stone albedo and read black (texture generators now take a base colour); the paving joints were cartoon-thick. Still open: the houses and people are simple blocks; this chapter needs a modelling pass. |
| CH6 the same Light, 16 s | 8 | Two paths of light over the dark sea rising to one radiant point; the verse word by word in the lower third. Fixed: the Light's quad showed as a square; the land was black (fog); the verse sat over the Light. |

## Mobile (CH1, CH4, CH6)

| Chapter | Score | Notes and fixes |
| --- | --- | --- |
| CH1 | 8 | Fixed: the sentence's words fell off the left edge (portrait layout: four centred rows, placed in the camera's upper third, drawn over the scene); the touch joystick sat over the objects on the left half (hidden outside the walking chapters). |
| CH4 | 8 | Fixed: the visitor filled the frame (taller field of view in portrait); the hint now says "walk with the joystick" on touch. |
| CH6 | 8 | The Light, both paths and the verse all fit. |

## Open items for M6
- CH2's guards and CH5's houses and people are simple blocks; both deserve a modelling pass.
- CH3's flight leg over Rome is short and dark; more of the city should catch the letter's light.
- The figure's hands and the capsule legs still read as a mannequin up close.
- Medium tier: a dark ellipse appears under the window in one framing (not on high).
- Real-GPU, Firefox, Safari and Android checks; performance on a mid-range phone.
