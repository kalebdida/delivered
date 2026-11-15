# DELIVERED · ROOM 3: GAIN
### Philippians 1:12-25 · "For to me to live is Christ, and to die is gain."

## 0. YOUR ROLE AND RULES
You are a senior creative technologist and WebGL engineer working at the craft level of studios like Active Theory, Lusion, and Bruno Simon.

Read `CLAUDE.md` and obey it completely, especially AUTHORSHIP: Kaleb Dida is the sole author, and no AI attribution (no `Co-Authored-By: Claude`, no "Generated with" lines) may appear in any commit, file, or page. Never change the git identity.

Then read `/CONVENTIONS.md`, `/DESIGN.md`, `/packages/core/README.md`, and the core demo in `/packages/core/demo`. Build everything with the shared core and follow DESIGN.md exactly: beauty is a first-class requirement. Run the Beauty Review (`pnpm shots`, score every key moment, fix anything below 8, log in BEAUTY.md) at every visual milestone.

- Work in the worktree folder `../delivered-gain` on the branch `app/gain`.
- Only touch files inside `apps/gain/**`.
- If you need a core change, write it in `apps/gain/CORE_REQUESTS.md` and implement a local version in `apps/gain/src/local-core/`.
- Work autonomously. Make reasonable decisions without asking me and log them in `apps/gain/DECISIONS.md`. Run `pnpm build` and `pnpm test` after every milestone, commit (no AI attribution), and push if a remote exists. Do not hand me manual steps. Do not spawn subagents.

## 1. ONE-SENTENCE PITCH
The visitor sits chained in a Roman prison cell at night and tries to finish the sentence "For to me to live is ___", and every answer they pick (money, fame, comfort, love) forces the second half to read "and to die is loss", until they step into the single beam of light, the sentence completes as "to live is Christ, and to die is gain", their chains start to preach, and they choose to remain for the sake of others.

## 2. THE MESSAGE
Paul wrote Philippians in chains, possibly facing execution. Philippians 1:21 is an equation: whatever you live for, death takes it away, unless what you live for is Christ, because death only brings you closer to Him.

The theology the mechanics must carry:
1. Whatever you live for decides what death means (1:21, 3:7-8). The sentence engine proves this mechanically.
2. Paul's chains became a megaphone (1:12-14). His limitation spread the gospel through the whole palace guard.
3. Paul was torn between two good things (1:23-24): departing to be with Christ, "far better", and remaining, "more needful for your sake".
4. Paul chose to remain, for fruitful labor and for others' "progress and joy in the faith" (1:22, 1:25). The experience ends on choosing LIFE and service.
5. Both paths end in the same Light. Christ is at the end of living and at the end of dying.

CARE RULES (mandatory, this room is about death):
- Never present death as an escape, a solution, or something the visitor can choose. The visitor can NEVER open the "depart" door. It is sealed with soft light and opens only on God's timing; its label reads "not yet".
- The experience's climax is choosing to REMAIN and serve others.
- No imagery of dying, wounds, execution, or suicide in any form.
- The About panel and end card include the quiet support line from the hub: "If you are carrying something heavy, please talk to someone you trust. findahelpline.com". It is calm and present, never preachy or alarming.
- If you are ever unsure whether something could be read as glamorizing death, cut it.

Scripture: World English Bible only. Register every verse in the core registry and run `pnpm verify:scripture`. References used: Philippians 1:12-14, 1:20-25, 3:7-8. Key text (verify word for word against WEB, and pull exact WEB wording for every other reference listed):
- Philippians 1:21: "For to me to live is Christ, and to die is gain."

Greek chapter cards (Noto Serif): verify each word against the Greek text of Philippians and log the source in DECISIONS.md.
- δεσμοί · desmoi · bonds, chains (1:13)
- τὸ ζῆν Χριστός · to zēn Christos · to live is Christ (1:21)
- κέρδος · kerdos · gain (1:21)
- ζημία · zēmia · loss (3:7)
- συνέχομαι · synechomai · I am hard pressed (1:23)
- ἀναλῦσαι · analysai · to depart (1:23; also used of a ship loosing its moorings or breaking camp)
- ἐπιμένειν · epimenein · to remain (1:24)

## 3. THE WORLD
- A Roman prison cell at night: rough stone walls with procedural masonry, damp sheen, straw on the floor, a heavy wooden door, and one small high window.
- Through the window falls a single beam of moonlight, rendered as volumetric god-rays with dust motes floating in it. The beam is the only true light source in the cell.
- The visitor is a seated figure chained at the wrists (core Verlet or Rapier chain), with an oil lamp, a reed pen, and a sheet of papyrus nearby.
- Beyond the cell (revealed later): torch-lit corridors, a barracks of the palace guard, the night city of Rome, and far across the sea, Philippi.
- Palette: stone #3A3530 · shadow #0E0C0B · moonbeam #CFE0FF · lamp #FFB25C · papyrus #E9D9B5 · ink-gold #F5C76B · loss grey #6E6A66 · Christ light #FFFFFF to #FFE9B0.

## 4. THE CHAPTERS
Each chapter is a core `Chapter` subclass with a ChapterCard (Greek word, transliteration, English, reference).

### CH0 · THRESHOLD
- Black screen, the sound of dripping water and a chain shifting.
- The words "For to me to live is ____" appear with a blinking blank.
- Begin button unlocks audio.

### CH1 · ζημία · THE LEDGER (Philippians 1:21, 3:7-8)
THE SENTENCE ENGINE. This is the heart of the room.
- The sentence floats in the cell as large 3D text (troika): "For to me to live is ____, and to die is ____."
- Around the cell, in the lamp's warm light, float objects representing what people live for: a stack of coins (money), a laurel crown (fame), a soft cushion (comfort), a scroll of credentials (success), a burning heart shape (love of someone), a mirror (self), plus a "write your own" papyrus where the visitor can type anything (it never leaves the device).
- The visitor grabs an object and drops it into the first blank. The second blank then auto-completes, and a short life plays out in fast-forward around the object:
  - The object glows and grows, the lamp brightens, warm music.
  - Time accelerates: the lamp flickers through years, the papyrus ages.
  - Then the lamp goes out. The object cracks, greys, and crumbles into dust in the visitor's hands.
  - The second blank fills in grey: "and to die is LOSS."
  - The ash slides into a carved stone column on the wall labeled ζημία, LOSS.
- Every object produces LOSS, including what the visitor types. Make each crumble unique and beautiful in a sad way (coins tarnish and dissolve, the crown's leaves fall, the mirror fogs and shatters into sand).
- The moonbeam stays in the corner the whole time, never highlighted. A Whisper appears only after 3 attempts: "there is one thing you have not tried." After 5 attempts: the dust motes in the beam start drifting toward the visitor.
- When the visitor finally moves INTO the moonbeam (instead of picking an object), the first blank fills with light: "Christ". The life plays out again: the lamp goes out, and this time the moonbeam grows brighter as the lamp dies. The second blank fills in gold: "and to die is GAIN."
- The LOSS column cracks along gold seams. A second column of light appears beside it, labeled κέρδος, GAIN.
- Philippians 1:21 appears in full.

### CH2 · δεσμοί · CHAINS THAT PREACH (Philippians 1:12-14)
- The visitor's chains now glow faintly gold.
- Mechanic: drag or shake the chains. Every rattle sends a wave of gold light pulsing out of the chains, through the stone, through the door, and down the corridors.
- The camera follows a wave out of the cell: the waves reach the palace guard barracks, where instanced soldier figures (about 300) light up one by one as each wave touches them.
- Keep rattling: the light spreads through the barracks, then through the night city of Rome, and the brothers in the city light up too (1:14, bolder to speak).
- The visitor's limitation is the source of the spread. A counter in the HUD corner: "the whole palace guard: N / 300".

### CH3 · THE LETTER (Philippians 1 to 4)
- Back in the cell. The visitor writes: drag the reed pen across the papyrus and gold ink flows in handwritten strokes (render-target painting). Whatever they scribble, the strokes resolve into the real opening words of the letter in elegant script, ending with 1:21.
- The papyrus rolls itself, rises to the window, and flies out as a streak of light.
- The camera follows it: over the rooftops of Rome, across a stylized 3D Mediterranean (low-poly coastline, moonlit sea), about 1,200 km to Philippi.
- It lands in a small house where a few people sit around a lamp. As they unroll it, their house fills with gold light.

### CH4 · συνέχομαι · HARD PRESSED BETWEEN THE TWO (Philippians 1:22-24)
- The cell is now split by light into two doorways:
  - LEFT, ἀναλῦσαι, "to depart and be with Christ, which is far better": radiant white-gold light, beautiful, peaceful. It is SEALED with a soft veil of light. When the visitor approaches, the veil gently pushes them back and a calm line appears: "not yet." It cannot be opened. Ever.
  - RIGHT, ἐπιμένειν, "to remain... for your sake": a warm, ordinary door. Through it, the faint sound of people talking, children, footsteps. It opens.
- The visitor stands between the two while 1:23-24 appears.
- The visitor walks through the right door.

### CH5 · FRUITFUL LABOR (Philippians 1:22, 1:25)
- Through the door: the Philippian church in the morning. A small courtyard, people sitting in groups, some lit, many dim.
- Mechanic: walk to each person and sit with them. Each one lights up warmly (progress and joy in the faith). Some groups are small, some are on the edges. Lighting everyone is optional, but the courtyard visibly grows warmer with each one.
- A garden in the courtyard grows as more people light up (procedural flowers and vines blooming).
- Philippians 1:25 appears.

### CH6 · THE SAME LIGHT (finale)
- The camera rises slowly above the courtyard, above Philippi, above the sea, until the visitor can see the whole journey from above: the cell in Rome, the path of the letter, the courtyard.
- From above, two lines of light become visible: the path of LIVING (through the right door, through the courtyard, onward) and the sealed path of DEPARTING (the left door). Both lines rise, curve, and meet at the same point of Light high above.
- Philippians 1:21 appears one final time, word by word.
- Final original line: "Either door, the same Light."

### END CARD
- Philippians 1:21 at the top.
- Buttons: Replay · Back to DELIVERED · Read Philippians 1 (WEB text on ebible.org in a new tab) · Share.
- The support line, quietly: "If you are carrying something heavy, please talk to someone you trust. findahelpline.com".
- Postcard line: "Everything else went in the LOSS column. Philippians 1:21".
- Call `markComplete('gain')`.

## 5. AUDIO
- Cell: dripping water, distant footsteps, the chain, a low stone-room drone, the "small cell" reverb from the core.
- CH1: each object's life gets its own short warm motif that collapses into a dissonant, fading version as it crumbles. The moonbeam has a faint high shimmer the whole time. When "Christ" fills the blank, every motif returns at once, resolved into one chord.
- CH2: each chain rattle is a bell-like tone; as more guards light up, the tones layer into a growing chord.
- CH3: wind over the sea, a gentle flute line.
- CH4: two textures in stereo: the left door a pure, high, still tone; the right door warm human sounds.
- CH5: morning birds, soft conversation, the music growing as people light up.
- CH6: full resolution, warm and calm.

## 6. CONTROLS
- Desktop: mouse to grab and drop objects, drag to rattle chains and write, WASD or arrows to walk in CH4 and CH5.
- Mobile: touch drag for everything, core virtual joystick for walking.

## 7. PERFORMANCE
- Volumetric moonbeam on high tier, a cheaper cone-and-dust-billboard version on medium and low.
- Guards and church members are instanced.
- Mediterranean flight uses a simple low-poly coastline and a cheap ocean shader.
- Total room payload under 2 MB gzipped. Everything procedural.

## 8. MILESTONES
After each milestone: `pnpm build`, `pnpm test`, fix everything, commit with the `[gain]` prefix.
- M1: The cell (masonry, volumetric moonbeam, lamp, chains, seated figure), camera, atmosphere.
- M2: CH0 and CH1, the full sentence engine with every object's unique crumble and the moonbeam reveal (spend extra time here: this is the core idea).
- M3: CH2 chains that preach, out to the guard and the city.
- M4: CH3 the letter, the flight, and Philippi.
- M5: CH4 the two doors (with the sealed left door), CH5 fruitful labor, CH6 finale, end card, postcard.
- M6: Mobile polish, accessibility, Amharic UI strings, performance pass, a final review of every care rule.

## 9. DEFINITION OF DONE
- A full run plays end to end with zero console errors.
- Every object in CH1 produces LOSS, and only the moonbeam produces GAIN.
- The left door can never be opened by any input or physics exploit. Add a unit test that asserts this.
- No memory growth across 3 full replays.
- Works on Chrome, Firefox, Safari (iOS 16+), and Android Chrome.
- All scripture verified against WEB, Greek verified and sourced.
- The whole repo still builds.

## 10. DO NOT
- Do not depict death, dying, execution, or self-harm in any form.
- Do not let the visitor choose or open the "depart" door.
- Do not give Christ a face. Christ is the Light.
- Do not preach in walls of text.
- Do not stop to ask me questions.

## START
Write `apps/gain/PLAN.md` (short: chapter list, the sentence engine design, the two-door logic and its safety test), then start Milestone 1 immediately.
