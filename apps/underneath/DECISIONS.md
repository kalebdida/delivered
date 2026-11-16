# UNDERNEATH · decisions

## Scope of this run
- **Milestones M1 to M5.** M6 (mobile polish, accessibility pass, care-rule review, Amharic strings,
  performance pass, final review of every chapter) is not part of this run. Until then the core
  falls back to English for every `underneath.*` string.
- **One Beauty Review at the end**, with mobile screenshots only for three moments (CH1 opening,
  CH5 catch, CH7 playground). See `BEAUTY.md`.

## Hebrew (verified)
Checked against the Westminster Leningrad Codex, `github.com/openscriptures/morphhb` (`wlc/Deut.xml`),
cantillation removed, vowel points kept.

| Word | Verse | Result |
| --- | --- | --- |
| אֵין כָּאֵל | Deuteronomy 33:26 | matches |
| יְשֻׁרוּן | 33:26 | matches |
| רֹכֵב שָׁמַיִם | 33:26 | matches |
| בְעֶזְרֶךָ | 33:26 | the prompt had בְּעֶזְרֶךָ (with dagesh); the WLC has no dagesh in the bet here (it follows a vowel), so the card uses the WLC spelling |
| וּמִתַּחַת | 33:27 | matches |
| זְרֹעֹת עוֹלָם | 33:27 | matches |
| מְעֹנָה | 33:27 | matches |

## World and scale
- **The column is 2,400 units tall** and the altimeter shows units × 5. Float precision stays
  comfortable and the fall can run at readable speeds.
- **The camera is driven directly** (`rig.position` / `rig.target`) with offsets damped in the
  visitor's frame, so a 30 units/s fall never makes a spring lag behind.
- **The cloak is simulated in the visitor's local frame** (core Verlet cloth) with the airflow as
  wind, so it streams cleanly at any speed instead of being dragged through world space.
- **Rapier is loaded only in CH2** (`Physics.create()` in the chapter, disposed on exit) for the
  crumbling island slabs. Every other moving thing is Verlet or closed-form.
- **If the visitor slips off an island in CH2** before the last one, a gust lifts them back to the
  last island they stood on. They never fall by their own choice or by a missed jump; the only
  fall is the one where the ground gives way.

## Chapters
- **CH2's card uses יְשֻׁרוּן** (the prompt lists no word for it), CH3 uses בְעֶזְרֶךָ and CH7 uses
  זְרֹעֹת עוֹלָם, so every chapter opens with a verified word from 33:26-27. CH6 ends by returning to
  יְשֻׁרוּן as the prompt asks.
- **CH3 and CH4 share one fall model** (`world/fall.ts`), handed from one chapter to the next with a
  `cut` transition, so the fall never pauses. CH4 begins when the visitor first looks up in the storm
  (or at 1,420 units).
- **The fall cannot be stopped**: speed has a floor and a pacing floor guarantees arrival within
  100 s whatever the input (garbage input, holding every grab, steering out). Unit tested.
- **Every CH7 let-go is caught**: `CatchSystem` meets any airborne visitor below the ledge; landing
  on a cloud ledge after letting go also counts as a catch (the "bounce"), so the two counters always
  agree. Unit tested with 400 random let-gos.
- **CH5 runs on real time** while `loop.timeScale` eases to 0.15, so the descent curve and the camera
  stay smooth while the world slows.
- **The dwelling rises out of the light** piece by piece instead of the arms' particles morphing into
  it; a particle morph between two shapes is a later polish item.
- **The end card's support line** is appended under the core EndCard (it has no slot for it yet);
  the About panel line waits for the core (CORE_REQUESTS.md #2).

## Beauty pass (branch `beauty/underneath`)
- **The arms are a sculpted mesh first, particles second.** Each arm is one swept tube from a root in
  the mist to the knuckles, with four fingers and a thumb as jointed tubes. The mesh is built twice
  (open and closed, same topology) and blended on the GPU by `uClose`, so the fingers curl and the
  palms roll into a bowl with no per-frame CPU work. The shading is light, not a lit object: an inner
  (subsurface) glow where the form is thick, a fresnel rim, slow bands of light flowing toward the
  hands, a warm pool in the palms around the visitor, and aerial haze into a floor of mist the arms
  rise out of. The roots dissolve below the mist, so there are no shoulders and no body.
- **Ribbons are wound on the surface, not free Verlet strips.** Free strips read as loose lines next
  to a solid form; helical bands that follow the mesh (in both poses) read as light flowing along it.
  The Verlet ribbons are gone from the arms; Verlet is still used for the cloak, ropes and curtains.
- **Particles are sampled on the mesh** (area-weighted, hands weighted up), offset just above the
  skin, and drift along the surface toward the hands. Counts still come from the tier.
- **The hands are 1.4× the earlier size and the reach is shorter**, so the silhouette reads in one
  glance: two cupped hands with the arms receding behind them into the mist. The visitor rests where
  the two palms meet; the cradle follows the hands as they rise.
- **CH5 camera:** from the fall view (the arms seen from above) out to a wide three-quarter view
  (the key moment), then a slow push down into the palm, where the hands become a landscape around
  the small figure. The reveal starts two seconds later (at 17 s) to hold that close-up.
- **The CH5 line was never revealed** (the words were created and left invisible). It now reveals
  word by word from 7.4 s, and its scrim sits behind the words only instead of dimming the frame.
- **A far cloudscape on a dome (`world/cloudscape.ts`)** on every tier: high cirrus and altocumulus,
  cumulus banks on the horizon with silver linings toward the sun, an endless cloud sea below (its
  underside above once the visitor has fallen through), and in the Storm a wall of indigo cloud with
  billowed structure. Near clouds (billboards, or the raymarched sea) draw in front of it.
- **Raymarched high-tier clouds are in.** On high tier the cloud sea is the core `CloudField` in
  raymarch mode (self-shadowing, silver lining, aerial haze) as a backdrop, with the billboard sea
  kept in front of it for flying through, and the dome's sea beyond its extent.
- **Lightning lights the cloud from inside.** Each strike lands inside the view, lights the dome's
  walls (broken up by their own billows) and the near storm billboards (thick middles first), draws a
  forked bolt half hidden in the cloud, and catches the visitor's rim. The glow decays over about a
  second with a soft flicker instead of snapping off; every strike still goes through the flash
  limiter. The screenshot hook (`?shot`) times one strike to the storm's key moment.
- **The sun moved to azimuth 2.83** so it sits just right of the island course: CH1 and CH2 are now
  backlit, with god rays (medium and high tiers) from a sun glow occluded by the islands.
- **The visitor has a rim light** (fresnel, on the side facing the layer's light: the low sun, cool
  sky light in the storm and night, the arms' light from below, every lightning strike), a hood, and
  an A-line cloak shaped around the body (rest lengths from that shape, a torso capsule to keep it
  out of the body) instead of a flat sheet.
- **CH1 opens wide** (figure on the left third, sun ahead and right, more sky) and settles into the
  play camera when the visitor first moves or after 10 s. The movement hint waits until 8 s.
- **The CH7 swing arch now faces the ledge.** Seen edge-on against the swing's beam it formed a
  glowing cross; the room never uses a cross as decoration (DESIGN.md §10).

## What this run did not do
- **Milestones landed as one commit** (M1 to M5) after the whole room ran end to end, then a review
  commit, instead of one commit per milestone.
- **Tested only in headless Chromium with SwiftShader.** No real GPU, no Firefox, Safari or Android
  yet; frame rates are unmeasured.
