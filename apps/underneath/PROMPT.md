# DELIVERED · ROOM 2: UNDERNEATH
### Deuteronomy 33:26-27 · "There is no one like God, Jeshurun, who rides on the heavens for your help... Underneath are the everlasting arms."

## 0. YOUR ROLE AND RULES
You are a senior creative technologist, WebGL engineer, and art director working at the craft level of studios like Active Theory, Lusion, and Bruno Simon. This room must be the most visually breathtaking of the trilogy: it is a sky.

Read `CLAUDE.md` and obey it completely, especially AUTHORSHIP: Kaleb Dida is the sole author, and no AI attribution may appear in any commit, file, or page. Then read `/CONVENTIONS.md`, `/DESIGN.md`, `/packages/core/README.md`, and the core demo in `/packages/core/demo`. Build everything with the shared core and follow DESIGN.md exactly.

- Work in the worktree folder `../delivered-underneath` on the branch `app/underneath`.
- Only touch files inside `apps/underneath/**`.
- If you need a core change, write it in `apps/underneath/CORE_REQUESTS.md` and implement a local version in `apps/underneath/src/local-core/`.
- Work autonomously. Make reasonable decisions without asking me and log them in `apps/underneath/DECISIONS.md`. Run `pnpm build` and `pnpm test` after every milestone, commit, and push if a remote exists. Do not hand me manual steps. Do not spawn subagents.

## 1. ONE-SENTENCE PITCH
The visitor stands on a floating island above golden clouds as everything they lean on crumbles beneath them, falls through every layer of the sky (gold, storm, night, fog) while something made of light rides down through the heavens faster than they fall, and lands in enormous arms of light that were underneath them the entire time, which then become a home, and then a playground where they can let go from anywhere and always be caught.

## 2. THE MESSAGE
Deuteronomy 33 is Moses' final blessing over Israel before he dies. Its last words describe a God with no equal, who rides the skies to help His people, who is their dwelling place, and whose everlasting arms are underneath them.

The theology the mechanics must carry:
1. There is none like God (33:26). Everything else people lean on eventually gives way.
2. He comes FOR YOUR HELP (33:26). The rider of the heavens is racing toward the visitor to rescue, never to condemn.
3. Underneath (33:27). The arms are below the lowest point of the fall. The visitor discovers they were falling INTO them the whole time.
4. Dwelling place (33:27, and Psalm 90:1, a prayer of Moses). Being caught is the doorway into being at home.
5. Jeshurun ("upright one") is a tender name God gives to a people who often were NOT upright (compare Deuteronomy 32:15 and Isaiah 44:2). God names them by grace.

Christ connection (be honest that these are Christian readings, presented with care):
- The rider who comes down from heaven "for your help" is read by many Christians as fulfilled in Christ, who came down from heaven (John 6:38).
- The everlasting arms echo John 10:28: "no one will snatch them out of my hand."
- A devotional detail: the arms of light carry a faint gold mark at each wrist, a quiet nod to the cross. Never explain it in on-screen text; mention it once in the About panel as a devotional touch.

CARE RULES (mandatory, this room involves falling):
- The visitor NEVER chooses to jump in the story. The first fall happens because the ground gives way.
- No cliff-edge despair imagery, no "standing on a ledge looking down" framing, nothing that resembles self-harm.
- The playground mode (CH7) is joyful daylight play: letting go from swings, kites, balloons, and cloud ledges, like a child jumping into a parent's arms. Bright, warm, funny.
- The quiet support line from the hub appears in the About panel and the end card.
- If anything could read as glamorizing a dangerous fall, cut it.

Reverence: God is never given a face or a body. The rider is a moving storm of light. The arms are vast flowing forms of light and ribbon, more like a landscape than a body.

Scripture: English is World English Bible only; Amharic comes through the core registry with credit. Register every verse and run `pnpm verify:scripture`. References used: Deuteronomy 33:26-27, Deuteronomy 32:15 (About panel only), Psalm 18:10, Psalm 90:1, Isaiah 44:2, John 10:28. Key texts (verify word for word against WEB):
- Deuteronomy 33:26-27: "There is no one like God, Jeshurun, who rides on the heavens for your help, in his excellency on the skies. The eternal God is your dwelling place. Underneath are the everlasting arms. He thrust out the enemy from before you, and said, 'Destroy!'"
- Psalm 90:1: "Lord, you have been our dwelling place for all generations."
- John 10:28: "I give eternal life to them. They will never perish, and no one will snatch them out of my hand."

Hebrew chapter cards (Noto Serif Hebrew): verify each word against a reliable Hebrew Bible text (for example the Westminster Leningrad Codex) and log the source in DECISIONS.md.
- אֵין כָּאֵל · ein ka'el · there is no one like God (33:26)
- יְשֻׁרוּן · Yeshurun · upright one (33:26)
- רֹכֵב שָׁמַיִם · rokhev shamayim · rider of the heavens (33:26)
- בְּעֶזְרֶךָ · be'ezrekha · for your help (33:26)
- וּמִתַּחַת · umitachat · and underneath (33:27)
- זְרֹעֹת עוֹלָם · zero'ot olam · everlasting arms (33:27)
- מְעֹנָה · me'onah · dwelling place, refuge (33:27)

## 3. THE WORLD
A vertical world. The whole room is one continuous column of sky, roughly 12 km tall, with distinct layers the visitor falls through:

| Layer | Look |
| --- | --- |
| Golden Heights | floating islands of pale stone and grass above a sea of sunlit clouds at golden hour |
| The Storm | dark indigo cloud walls, rain streaks, lightning inside the clouds, violent wind |
| The Night | the clouds open into a clear night sky where stars appear BELOW as well as above, disorienting and vast |
| The Fog | thick soft white-grey, no direction, no sound but wind and heartbeat |
| Underneath | the fog parts onto the arms of light spread across the whole floor of the world |

- Volumetric clouds from the core Atmosphere module are the hero of this room. On high tier, raymarched clouds with silver linings and light scattering. On medium and low, layered soft billboards with depth fade. Both must look gorgeous.
- Palette: dawn gold #F2B866 · cloud cream #F4EBDD · sky blue #7FA6C9 · storm indigo #1B1F3A · lightning #DDE6FF · night #0A0D1F · star white #F7F3EA · fog #C9C6C2 · arms white-gold #FFF4DA with gold #F5C76B.
- Color grade (LUT): warm and luminous in the Heights, cold and crushed in the Storm, deep blue in the Night, flat and pale in the Fog, then the warmest grade of the whole trilogy at Underneath.

## 4. THE VISITOR
- A small figure in a flowing cloak (Verlet cloth for the cloak, so it streams beautifully in the wind), with a soft inner glow.
- On islands: third-person platforming movement with a satisfying jump, coyote time, and a ledge-grab.
- In freefall: skydiving control. Tilt and steer with movement input; spread out to slow slightly, tuck to speed up. The cloak and wind audio react to speed.
- Camera: third-person follow on islands; during the fall, a dynamic camera that can look DOWN (default) or UP (when the visitor holds the "look up" action).

## 5. THE CHAPTERS
Each chapter is a core `Chapter` subclass with a ChapterCard (Hebrew word, transliteration, English, reference).

### CH0 · THRESHOLD
- Black screen. A whisper of wind. A single word appears in Hebrew, then in English: "Yeshurun." then "upright one."
- Then: "There is no one like God."
- Begin button unlocks audio.

### CH1 · אֵין כָּאֵל · THERE IS NO ONE LIKE GOD
- The visitor wakes on a small floating island at golden hour above the cloud sea. The view is breathtaking: the Beauty Review for this frame must score 10.
- Around them float other islands, each holding something people lean on, shown as monumental abstract sculptures: a tower of gold coins, a crown on a pedestal, a great mirror, a pillar of stacked books and diplomas, a throne, a statue of an idol with an empty hollow face.
- Mechanic: LEAN. The visitor can walk up to each sculpture and lean on it (hold the primary action). Each one holds for a moment, then fails in its own beautiful way: the coins slide and pour into the clouds, the crown's island tilts, the mirror cracks into falling sand, the books blow away page by page, the throne sinks, the idol's hollow face crumbles inward with a dull echo (Psalm 115:5 energy, no text needed).
- After each failure, text stays minimal. After the last one, Deuteronomy 33:26a appears: "There is no one like God."

### CH2 · THE GROUND GIVES WAY
- The visitor's own island begins to crack (core platform-crumble helper).
- A platforming sequence: the visitor runs and jumps from island to island, and every island crumbles a few seconds after landing. Ledge-grabs, close calls, wind rising, stones falling past into the clouds. It should feel thrilling, not hopeless.
- Every path eventually runs out. On the last island, the ground drops out from under the visitor's feet. They did not jump; the world gave way.

### CH3 · THE FALL
- A long, continuous freefall through the layers: Golden Heights, then into the Storm, then out into the Night, then into the Fog. Total about 90 seconds, paced by the visitor's steering (they cannot stop it).
- An altimeter in the HUD counts down in oldstyle numerals.
- Things to grab: debris, branches, ropes from broken islands, a kite string. The visitor can steer into them and grab. Each one snaps, tears, or slips. Nothing holds.
- In the Storm: lightning flashes inside the clouds (flash-limited), rain streaks across the camera, the wind roars, the cloak whips. In the Night: total stillness, stars above and below, the visitor's own glow the brightest thing in the sky. In the Fog: no direction, sound fades to wind and a heartbeat.
- A Whisper appears in the Storm: "look up".

### CH4 · רֹכֵב שָׁמַיִם · THE RIDER OF THE HEAVENS (overlaps CH3)
- When the visitor holds "look up" during the fall, the camera turns skyward, and they see it: far above, something of white-gold light is tearing down through the clouds, riding the storm, faster than they fall. The clouds part in a wake behind it. Thunder rolls in a rhythm like hoofbeats (core thunder shaped into a gallop). Psalm 18:10 imagery: "He rode on a cherub, and flew."
- Every time the visitor looks up, it is closer.
- Looking up also changes the fall: the heartbeat slows, the wind softens a little, the camera steadies. Looking down brings the fear back. (Never explained in text. The visitor discovers it.)
- Deuteronomy 33:26 appears in full once the rider is close: "...who rides on the heavens for your help."
- The rider never touches the visitor during the fall. It passes them in the Fog and dives BELOW them, into the white.

### CH5 · וּמִתַּחַת · UNDERNEATH
THE MOST IMPORTANT MOMENT OF THE ROOM.
- The fog parts from below. Spread across the entire floor of the world are vast arms of light, made of flowing particles and luminous ribbons (Verlet ribbons plus GPU particles), the scale of mountain ranges, open and waiting. The rider's light has become part of them.
- The catch: no impact. Time slows (timeScale down to 0.15), the fall decelerates over several seconds in a long soft curve, the arms rise and close gently around the visitor. The cloak settles. The heartbeat slows to resting. The wind stops. A single warm chord.
- "Underneath are the everlasting arms." appears, word by word.
- THE REVEAL: the camera pulls back and up through the whole column of sky, and a ghost replay of the visitor's fall path shows the arms were directly beneath them at every layer, even in the Storm, even in the Night. They were falling INTO the arms the whole time.

### CH6 · מְעֹנָה · DWELLING PLACE
- The arms slowly fold and rise into a dwelling: an open sanctuary-home of light and warm stone, floating in a calm dawn sky above the clouds. A hearth, a table, an open doorway, curtains moving in a soft breeze.
- The visitor walks in freely. Inside is quiet and warm. Interacting with the hearth, the table, and the window each shows one line: Deuteronomy 33:27a ("The eternal God is your dwelling place"), Psalm 90:1, and John 10:28.
- Before leaving, a final ChapterCard returns to the first word: יְשֻׁרוּן · Yeshurun · upright one. One line beneath it: "He named you by grace before you lived up to it."

### CH7 · LET GO (the playground)
- The dwelling opens onto a bright, joyful sky playground: floating swings, kites, hot-air balloons, cloud ledges, a giant rope swing, a tall bell tower.
- Mechanic: the visitor can let go from ANYTHING at any height, and the arms of light always catch them, with playful variations: a gentle cradle, a toss back up into the air like a parent tossing a child, a spin, a slide down a ribbon, a bounce onto a cloud.
- HUD counter: "let go: N · caught: N".
- Sound and visuals are bright, warm, and funny here. This is the toy people will share.
- A small "finish" door returns to the end card at any time.

### END CARD
- Deuteronomy 33:26-27 at the top.
- Final original line: "You were falling into His arms the whole time."
- Buttons: Replay · Back to DELIVERED · Read Deuteronomy 33 (WEB text on ebible.org in a new tab) · Share.
- The quiet support line from the hub.
- Postcard line: "I let go N times. Caught N times. Deuteronomy 33:27".
- Call `markComplete('underneath')`.

## 6. AUDIO
- Heights: open-sky wind, distant birds, a warm drone, the "open sky" reverb.
- Leaning failures: each sculpture has its own collapse sound (coins pouring, glass to sand, pages fluttering, a hollow stone echo).
- Crumbling islands: deep stone cracks, gravel falling, rising wind.
- The fall: wind roar mapped to speed, cloak flutter, rain and thunder in the Storm, near silence in the Night, heartbeat in the Fog.
- The rider: thunder in a galloping rhythm, growing closer, with a rising choir-like pad.
- The catch: every sound drops away into one sustained warm chord and a slowing heartbeat.
- Dwelling: hearth crackle, curtains, a soft harp (core Karplus-Strong).
- Playground: bright plucked melodies, laughter-like bells on every catch, all procedural.

## 7. CONTROLS
- Desktop: WASD or arrows to move and steer, Space to jump, E or the primary action to lean, grab, and let go, Shift (or right mouse) to look up.
- Mobile: core virtual joystick, jump and action buttons, a dedicated "look up" button. Optional device tilt for steering during the fall (permission-gated, off by default).
- Accessibility: an "easy islands" option slows the crumble timing in CH2.

## 8. PERFORMANCE
- Cloud rendering per core Quality tier. Raymarch step counts from the budget table.
- The arms: about 300k particles on high, 80k medium, 25k low, plus ribbon meshes.
- Islands and sculptures are procedural (no large models). Total room payload under 2.5 MB gzipped.

## 9. MILESTONES
After each milestone: `pnpm build`, `pnpm test`, Beauty Review where visual, fix everything, commit with the `[underneath]` prefix (no AI attribution), push if a remote exists.
- M1: The sky column with all five layers and their grades, the visitor with cloak and movement, the follow camera. Beauty Review on every layer.
- M2: CH0, CH1 lean mechanic with every sculpture's unique failure, CH2 crumbling platforming.
- M3: CH3 freefall with grabs, layers, and the altimeter; CH4 the rider and the look-up mechanic.
- M4: CH5 the catch and the reveal (spend extra time here; this frame must be unforgettable), CH6 the dwelling.
- M5: CH7 the playground with all catch variations, end card, postcard.
- M6: Mobile polish, accessibility, care-rule review, Amharic strings, performance pass, final Beauty Review of every chapter.

## 10. DEFINITION OF DONE
- A full run plays end to end with zero console errors.
- The visitor can never stop the first fall by any input or exploit, and in CH7 every let-go is always caught (unit test both).
- No memory growth across 3 full replays.
- Works on Chrome, Firefox, Safari (iOS 16+), and Android Chrome. At least 30 fps on a mid-range Android phone.
- Every chapter's key moment scores 8 or higher in BEAUTY.md; CH1's opening frame and CH5's catch score 10.
- All scripture verified; Hebrew verified and sourced.
- The whole repo still builds. No AI attribution in any commit.

## 11. DO NOT
- Do not make the visitor choose to jump in the story.
- Do not give God or the rider a face or human body.
- Do not use cliff-edge despair framing or anything resembling self-harm.
- Do not preach in walls of text.
- Do not stop to ask me questions.

## START
Write `apps/underneath/PLAN.md` (short: the sky column layout, cloud rendering per tier, the fall pacing timeline, the catch sequence timeline), then start Milestone 1 immediately.
