# WRETCHED · plan

## Chapters (one persistent world, chapters drive it)
| # | id | Greek card | Where on the path (z) | Ends when |
| --- | --- | --- | --- | --- |
| 0 | threshold | none: Romans 7:24 line by line, with τίς με ῥύσεται | 0 | verse read, figure faded in |
| 1 | want | θέλω · Romans 7:19 | 0 → -58 | chain snaps tight at ~20 s, then the visitor drags on |
| 2 | dont | οὐ … ποιῶ · Romans 7:19 | -58 → -100 | reached -100 (or 150 s safety) |
| 3 | law | νόμος · Romans 7:12 | -100 → -155 | past the last monolith |
| 4 | wretched | ταλαίπωρος · Romans 7:24 | arena at -165, cliff at x = 9 | 6 failed attempts or 90 s, then the collapse |
| 5 | cry | ῥύσεται · Romans 7:24 | same | the hold meter fills |
| 6 | thanks | εὐχαριστῶ · Romans 7:25 | same | ~24 s timeline, then a few free steps |
| 7 | no-condemnation | οὐδὲν … κατάκριμα · Romans 8:1 | -170 → summit -256 | Romans 8:1-2 and the closing line shown |
| end | | | | EndCard, postcard, `markComplete('wretched')` |

The world (terrain, sky, fog, the light on the hill, attractors, monoliths, visitor, double, chain)
is built once in `setup`. Every chapter calls `world.stage(...)` on enter, so `?chapter=N` lands in
a consistent state.

## The InputFilter
The core `corruptionFilter` (invert · delay 300-900 ms · redirect to the nearest attractor · drop ·
drift), with a live intensity:

    intensity = gentle * min(0.85, weight * (0.35 + 0.65 * progressTowardLight) + nearAttractor * 0.25)

`onBetray(kind)` fires a glitch burst, a stutter, a heartbeat skip and an ember flare. The HUD shows
`you pressed → · you went ←` from `input.arrows()` (raw vs filtered) while an episode runs.
Safety: speed never drops below 35 % of the walk, so progress is always possible.
CH6 removes it and adds `graceFilter(1.18)`; CH7 flickers a glitch twice but adds no corruption.

## Deliverance timeline (CH6, seconds)
- 0.0  silence; the sky cracks open above the hill (a seam of light widens)
- 1.5  the cross of light descends, vast and slow (6 s), swelling warm chord
- 7.0  a single beam strikes the link at the ankle; flash (limited), bell, trauma
- 7.5  that link turns to gold dust; the rope joint is removed
- 8-12 the other links follow, one by one toward the double, a rising bell each
- 12   the double stands, faces the light; its eyes go out gently
- 13   colour wave rolls outward from the visitor; monolith light warms to gold
- 13-18 the double dissolves into ash carried off by the wind
- 17   "I thank God through Jesus Christ, our Lord!"; grace filter; gold trails
- 24   the chapter ends once the visitor walks on
