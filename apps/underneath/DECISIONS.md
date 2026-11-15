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

## What this run did not do
- **Raymarched high-tier clouds** were not added. The core `CloudField` raymarch mode is a backdrop,
  and the visitor flies through the cloud sea, so it needs the billboard pass kept alongside it; that
  was left for a later pass to keep this run's scope.
- **Milestones landed as one commit** (M1 to M5) after the whole room ran end to end, then a review
  commit, instead of one commit per milestone.
- **Tested only in headless Chromium with SwiftShader.** No real GPU, no Firefox, Safari or Android
  yet; frame rates are unmeasured.
