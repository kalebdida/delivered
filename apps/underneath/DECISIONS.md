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
