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
