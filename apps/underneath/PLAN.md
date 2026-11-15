# UNDERNEATH · plan

## The sky column
One continuous column, 2,400 world units tall (the altimeter shows units × 5, so 12,000 m at the
top). The visitor falls along the axis; everything else is placed by altitude.

| Layer | Altitude (units) | What draws it |
| --- | --- | --- |
| Golden Heights | 2,250 to 2,600 | floating islands at 2,400, a billboard cloud sea at 2,300 to 2,350, golden-hour `Sky` |
| The Storm | 1,500 to 1,900 | indigo cloud walls, rain streaks, lightning lit inside the clouds (flash-limited) |
| The Night | 950 to 1,300 | clear night, a star shell around the camera so stars sit below as well as above |
| The Fog | 200 to 750 | `HeightFog` whiteout plus streaming wisps, no horizon |
| Underneath | 0 to 200 | the arms of light across the floor of the world, fog parting from below |

Between layers everything blends: `layerAt(y)` (pure, tested) returns weights for the five layers
and the sky, fog, exposure and grade are mixed from them every frame. The 3D LUT is re-baked only
when the dominant layer changes.

## Clouds per tier
- **All tiers (first):** soft billboard `CloudField`s for the cloud sea and the storm walls, plus a
  streaming wisp layer of instanced billboards that recycles around the camera so the fall has
  speed. Counts come from `quality.budget`.
- **High tier (last, if time allows):** the cloud sea switches to the core raymarched `CloudField`
  as a backdrop; the billboards stay for flying through.

## The fall (CH3 + CH4), about 90 s
| t (s) | Altitude | Beat |
| --- | --- | --- |
| 0 | 2,380 | the last island drops away; tumble, then the visitor finds their body |
| 0 to 18 | 2,380 to 1,900 | golden air, through the cloud sea; first grabs (debris, a rope) |
| 18 to 40 | 1,900 to 1,300 | the Storm: rain, lightning, wind; "look up" whisper; CH4 begins when the visitor first looks up (or at 1,500) |
| 40 to 60 | 1,300 to 750 | the Night: stillness, stars below; the rider is closer each time they look |
| 60 to 85 | 750 to 200 | the Fog: heartbeat and wind; the rider passes and dives below |
| 85 to 90 | 200 to 40 | CH5 |

Speed is always between 18 and 36 units/s (spread slows, tuck speeds up) and a pacing floor makes
the fall reach the bottom within 110 s whatever the input: it cannot be stopped (unit tested).

## The catch (CH5)
| t (s) | Beat |
| --- | --- |
| 0 | the fog parts from below; the arms are visible across the whole floor |
| 0 to 6 | time eases to 0.15; the fall decelerates on a long ease-out to rest in the cradle |
| 3 to 7 | ribbons rise and close; the cloak settles; heartbeat slows; wind stops; one warm chord |
| 7 to 13 | "Underneath are the everlasting arms." word by word |
| 13 to 24 | the reveal: the camera rises up the whole column; the ghost path of the fall glows and lands in the arms at every layer |
