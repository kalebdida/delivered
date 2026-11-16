# GAIN · plan

Philippians 1:12-25. Milestones M1 to M5 in this run (M6, the mobile, accessibility, Amharic and
performance pass, is a later run). No Rapier: the room never passes `physics: true`, and every
chain is core `Verlet`.

## Chapters
| # | id | Card | What happens |
| --- | --- | --- | --- |
| 0 | `threshold` | none | Black, a drip, a chain shifts. "For to me to live is ____" with a blinking blank. The cell fades up behind it. |
| 1 | `ledger` | ζημία · 3:7 | The sentence engine (below). Ends with GAIN and Philippians 1:21. |
| 2 | `chains` | δεσμοί · 1:13 | The chains glow. Drag or shake them: each rattle sends a gold wave through the wall, the corridor, the barracks (instanced guards light up, counter N / 300), then the night city. |
| 3 | `letter` | τὸ ζῆν Χριστός · 1:21 | Drag the reed pen: gold strokes resolve into the opening of the letter. The scroll rolls, flies out of the window, over Rome and a low-poly sea to a house in Philippi that fills with light. |
| 4 | `doors` | συνέχομαι · 1:23 | Two doorways in the right wall. On the visitor's left, ἀναλῦσαι: a doorway of light sealed with a veil that pushes back gently and says "not yet". On the right, ἐπιμένειν: the cell's own heavy door; it opens and ends the chapter. |
| 5 | `labor` | ἐπιμένειν · 1:24 | The Philippian courtyard at morning. Sit with people and they light up; the garden grows. 1:25. |
| 6 | `light` | κέρδος · 1:21 | The camera rises over the whole journey. Two lines of light, living and departing, rise and meet in one Light. 1:21 word by word; "Either door, the same Light." |
| end | | | End card, support line, postcard, `markComplete('gain')`. |

## The sentence engine (CH1)
- Pure logic in `src/logic/sentence.ts`: `complete(choice)` returns the two fills. Every
  `LedgerObject` (coins, laurel, cushion, credentials, heart, mirror, a typed word) returns
  `LOSS`; only the `beam` choice returns `Christ` / `GAIN`. Unit-tested for every object and for
  arbitrary typed words (including the typed word "Christ": it is still something you wrote and
  put in the blank yourself, so it is still loss; the gain comes only from stepping into the
  light).
- In the scene: the sentence is troika 3D text built from registered partial quotations of
  Philippians 1:21. Drag (or tap, or arrow keys + Enter) an object into the first blank. Its life
  plays out (`src/world/objects.ts`, one `life()` per object: glow, lamp brightens, years flicker,
  the lamp dies, the object fails in its own way), the second blank fills grey, the ash slides
  into the ζημία column. Attempt 3 brings the whisper; attempt 5 sends the beam's motes drifting
  toward the visitor. Stepping into the beam (click it, walk to it, or choose it from the keyboard
  list) plays the same life with the lamp dying while the beam grows; the blank fills gold.

## The two doors and their safety (CH4)
- `src/logic/doors.ts` holds the rule as data, not as scene code: the left door's state is a
  constant `sealed`; `request('depart')` always answers `not-yet` and never changes state. The
  visitor's position goes through `resolveVeil(prev, next)`, which reflects any step that would
  cross the veil plane (including teleports, huge `dt` and NaN), so no input or physics
  exploit can reach the far side.
- `apps/gain/test/doors.test.ts` asserts: the state is `sealed` after 10,000 random requests and
  steps; the position never crosses the plane for random walks, huge velocities, NaN and
  teleports; there is no code path that opens it (the module exports no `open`).

## Look
- One strong cool beam (high tier: a raymarched volume with window-bar shadows and drifting
  noise; medium and low: the cone-and-motes version), visible dust in it, a warm lamp as the only
  counter-light, deep shadows, procedural masonry with a damp sheen.
- Grade: `GRADES.gain`. Transitions: `ink` into loss, `light` into the reveal and the finale.
