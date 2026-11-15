# WRETCHED · decisions

## Scope of this pass
- **Milestones M1 to M5 are built; M6 is deferred** by Kal's instruction (tight usage budget):
  mobile control polish, reduced-motion and flash audits, the optional microphone cry, the Amharic
  room strings, and a performance pass on real phones. Until then every `wretched.*` string falls
  back to English (the core does this). The "gentle corruption" switch is already in Settings
  because it cost a few lines.
- **The "behind the verse" line** (Virgil, the body bound to a corpse) is written in `strings.ts`
  (`wretched.about`) but not yet shown: the core About panel has no room slot. See CORE_REQUESTS.md.
- **One Beauty Review, at the end**, desktop for every chapter (low and medium tier) and mobile for
  the three key moments only (CH2 corruption, CH6 deliverance, CH7 summit), by Kal's instruction.

## Greek on the chapter cards (checked)
Greek checked against SBLGNT (`github.com/LogosBible/SBLGNT`, `data/sblgnt/text/Rom.txt`), except
7:25 (below).

| CH | Word | Ref | Note |
| --- | --- | --- | --- |
| 1 | θέλω | Romans 7:19 | Phase 1 fix: 7:18 has the infinitive θέλειν. θέλω is in 7:15, 7:19, 7:21; 7:19 chosen. |
| 2 | οὐ … ποιῶ | Romans 7:19 | "οὐ γὰρ ὃ θέλω ποιῶ ἀγαθόν": the two words are not adjacent, so the card uses an ellipsis. |
| 3 | νόμος | Romans 7:12 | "ὁ μὲν νόμος ἅγιος" |
| 4 | ταλαίπωρος | Romans 7:24 | first word of the verse |
| 5 | ῥύσεται | Romans 7:24 | "τίς με ῥύσεται" (also shown in CH0 above the verse) |
| 6 | εὐχαριστῶ | Romans 7:25 | **SBLGNT reads χάρις τῷ θεῷ.** εὐχαριστῶ τῷ θεῷ is the Byzantine Majority Text reading (Robinson-Pierpont, `github.com/byztxt/byzantine-majority-text`, ROM.csv), which the WEB follows ("I thank God"). The card follows the English the visitor reads. |
| 7 | οὐδὲν … κατάκριμα | Romans 8:1 | "Οὐδὲν ἄρα νῦν κατάκριμα": ellipsis for the two words between. |

CH0 has no chapter card: it *is* Romans 7:24, line by line, with τίς με ῥύσεται above the second line.

## Scripture
- Full verses (7:12, 7:19, 7:24, 8:1, 8:2) come from the core registry.
- Partial quotations (7:24 in two halves, 7:25a, 7:25b) live in `src/scripture.ts` and are **not**
  passed to `registerScripture`: they share a reference with the full verse and would replace it in
  the registry. The UI reads them through `partial(ref, i)` and the `text` option of the overlay;
  `pnpm verify:scripture` still checks them (35/35 match).
- The prompt's "the commandment is holy, righteous, and good" is not WEB's wording; CH3 shows the
  whole of Romans 7:12 instead.

## Physics and the chain
- **Rapier only for the double's ragdoll, loaded lazily.** `createApp` is called with
  `physics: false`; `World.loadPhysics()` starts the code-split WASM download during CH0 and CH1
  awaits it. Ground collision is a coarse 1 m trimesh around the path, built from the same height
  function as the terrain.
- **The visible chain is the core Verlet rope** (15 points, 14 iron links in one InstancedMesh).
  The physical coupling is a single Rapier rope joint from a kinematic body at the visitor's ankle
  to the ragdoll's right forearm. Cheap, and it drags the ragdoll convincingly.
- **Self-effort can never succeed:** the rope joint has no break threshold, the Verlet chain is
  pinned at both ends, the strain meter only collapses, the struck link only heats, and the double
  is pushed back from the cliff edge (and clamped above the terrain every step). Only CH6 removes
  the joint.
- **Posture** (lying, sitting, standing) is done with damped upward impulses on the pelvis, chest
  and head, so the double sits up and later stands while staying a real ragdoll.
- **The double's particles are skinned on the GPU**: 11 bone matrices as uniforms, each particle
  stores its part and a point on that capsule. 30k / 12k / 5k by tier (capped by the budget).

## World and look
- One persistent world built in `setup`; each chapter calls `stage()` so `?chapter=N` lands in a
  consistent state.
- `HeightFog.apply` gives every patched material the same program cache key (`heightFog`); the
  room's own patched materials (terrain, clay, iridescent, chain) are re-keyed afterwards so three.js
  never shares a program between different shaders. Logged in CORE_REQUESTS.md.
- Footprints and the chain groove are stamped into a CPU `DataTexture` (4 texels per metre, RG8)
  uploaded at most five times a second, rather than a render-target trail: no extra pass.
- The follow camera sits high and back (1.8, 3.6, 7.8) so the double, lying behind the visitor,
  stays in frame; on portrait screens it is higher and further.
- The figure has no face; the double has two faint ember eyes. Christ is never shown: deliverance
  is a seam of light, a descending cross of light and one beam.

## Payload
- About 262 KB gzipped for the room's JS plus about 1.67 MB for the lazily loaded Rapier chunk
  (plus fonts): right at the 2 MB budget. Rapier is the cost of the ragdoll the prompt asks for.

## Not verified here
- Only headless Chromium with SwiftShader. Firefox, Safari iOS and Android Chrome, the 30 fps
  target on a phone, and "no memory growth over 3 full replays" are not measured yet (M6).
