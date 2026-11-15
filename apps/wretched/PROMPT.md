# DELIVERED · ROOM 1: WRETCHED
### Romans 7:15 to 8:2 · "Who will deliver me out of the body of this death?"

## 0. YOUR ROLE AND RULES
You are a senior creative technologist and WebGL engineer working at the craft level of studios like Active Theory, Lusion, and Bruno Simon.

Read `CLAUDE.md` and obey it completely, especially AUTHORSHIP: Kaleb Dida is the sole author, and no AI attribution (no `Co-Authored-By: Claude`, no "Generated with" lines) may appear in any commit, file, or page. Never change the git identity.

Then read `/CONVENTIONS.md`, `/DESIGN.md`, `/packages/core/README.md`, and the core demo in `/packages/core/demo`. Build everything with the shared core and follow DESIGN.md exactly: beauty is a first-class requirement. Run the Beauty Review (`pnpm shots`, score every key moment, fix anything below 8, log in BEAUTY.md) at every visual milestone.

- Work in the worktree folder `../delivered-wretched` on the branch `app/wretched`.
- Only touch files inside `apps/wretched/**`.
- If you need a core change, write it in `apps/wretched/CORE_REQUESTS.md` and implement a local version in `apps/wretched/src/local-core/`.
- Work autonomously. Make reasonable decisions without asking me and log them in `apps/wretched/DECISIONS.md`. Run `pnpm build` and `pnpm test` after every milestone, commit (no AI attribution), and push if a remote exists. Do not hand me manual steps. Do not spawn subagents.

## 1. ONE-SENTENCE PITCH
The visitor walks toward a distant light while chained at the ankle to a dark double of themselves, and the game's own controls start betraying them. They press forward and go backward. They try to break the chain and fail. Only when they stop struggling and cry out "who will deliver me?" does deliverance come from outside, and the controls become free.

## 2. THE MESSAGE
Romans 7 is Paul describing the war inside a person who wants good and keeps doing what they hate. The experience makes the visitor FEEL verse 19 through the controls, then feel Romans 8:1 through freedom.

The theology the mechanics must carry:
1. The desire is real (7:18, 7:22). The visitor genuinely wants to reach the light, and the game first lets them succeed, so the wanting is established.
2. The failure is real (7:15, 7:19). The controls betray them in ways they cannot fully predict.
3. The law is good, and it reveals (7:7, 7:12-13). Approaching the law makes the double fully visible and heavier. The law is never shown as evil; its light is holy and exposing.
4. Self-effort cannot cut the chain. Every attempt is allowed and every attempt fails.
5. Deliverance comes from outside, through Jesus Christ (7:25a). The visitor does not earn it; they cry out, and it comes.
6. Honest ending (7:25b, 8:1-2): the struggle still flickers in this life, but the chain is gone and there is no condemnation.

Reverence and care rules:
- The "body of this death" is a dark double made of shadow particles: same shape as the visitor, eyeless or with two faint ember points for eyes. It is heavy and sad, never gory, never a horror monster. No rotting, no blood.
- Christ is never shown with a face. Deliverance arrives as a descending cross of light and a beam that strikes the chain.
- The tone is grace-focused. The visitor is never shamed or mocked by text. "Wretched" is Paul's cry and is allowed to be felt, then answered.

Optional "behind the verse" card (one line, in the About panel, honest): some preachers connect "the body of this death" to an ancient punishment where a living person was bound to a corpse (described by Virgil in the Aeneid). Scholars debate whether Paul had this in mind. Present it as a possible background, not a fact.

Scripture: World English Bible only. Register every verse in the core scripture registry and run `pnpm verify:scripture`. References used: Romans 7:15, 7:18-19, 7:21-25, 8:1-2. Key texts (verify word for word against WEB):
- Romans 7:19: "For the good which I desire, I don't do; but the evil which I don't desire, that I practice."
- Romans 7:24-25: "What a wretched man I am! Who will deliver me out of the body of this death? I thank God through Jesus Christ, our Lord! So then with the mind, I myself serve God's law, but with the flesh, sin's law."
- Romans 8:1: "There is therefore now no condemnation to those who are in Christ Jesus, who don't walk according to the flesh, but according to the Spirit."

## 3. THE WORLD
- A vast, dim, quiet plain of pale ash-grey dust under a starless sky, with a slow-moving fog layer.
- Far away, on a hill, a single warm light: a tall vertical beam with a soft halo. It is always visible, always the goal.
- The ground is a large procedural terrain (fbm displacement) with footprints that stay (decal trail or a render-target trail texture).
- Scattered off the path: "temptation attractors", glowing objects with an oily, iridescent sheen that hum softly. They are abstract shapes (smooth orbs, twisted spires, mirrors), never explicit things.
- Palette: ash #9A968F · fog #2B2A2E · void #0C0B0E · light #FFD9A0 · double #050405 with ember eyes #FF6A3D · law light #E8F1FF (cold, holy white-blue) · deliverance gold #F5C76B.

## 4. THE VISITOR AND THE DOUBLE
- The visitor: a third-person humanoid figure made of soft matte clay-light (subtle subsurface glow), animated with a simple procedural walk cycle and an inverse-kinematics foot plant. Camera: close third-person follow with the core CameraRig.
- The double: a Rapier ragdoll (core ragdoll helper) wrapped in a shadow-particle shader: points sampled from the ragdoll's surface, trailing dark smoke. It lies on the ground and gets dragged, then later sits up, then later pulls.
- The chain: a breakable-looking but UNBREAKABLE-BY-THE-VISITOR Rapier chain (about 14 links) from the visitor's ankle to the double's wrist. Heavy iron with a cold PBR material. Dragging it over the ground leaves a groove and plays a scrape sound.
- The double's "weight" is a single number (0 to 1) that every chapter drives. Weight controls: drag force, how often inputs get corrupted, how desaturated the world is, the bass rumble level.

## 5. THE CHAPTERS
Each chapter is a core `Chapter` subclass. Every chapter opens with a ChapterCard (the Greek word, its transliteration, the English, the reference).

### CH0 · THRESHOLD
- Black screen. Romans 7:24 appears line by line: "What a wretched man I am! Who will deliver me...?"
- A Begin button unlocks audio.
- The figure fades in, standing. The double lies unseen in the dust behind it, chain buried.

### CH1 · θέλω · "I WANT" (Romans 7:18, 7:22)
- Controls work perfectly. The visitor walks toward the light. The music is hopeful: a soft rising drone.
- After about 20 seconds, the chain pulls tight out of the dust with a sharp metallic snap. The camera turns: the double is revealed lying in the dust, attached.
- The visitor can keep walking, but now drags it. The drag is noticeable but manageable (weight 0.2).

### CH2 · οὐ ποιῶ · "BUT I DON'T" (Romans 7:15, 7:19)
THE CORE MECHANIC. Register a core `InputFilter` that corrupts movement:
- Corruption chance rises with weight AND with distance-to-light shrinking (the closer to the goal, the worse it gets).
- Corruption types, mixed unpredictably: invert (press forward, go backward), delay (input arrives 300 to 900 ms late), redirect (movement bends toward the nearest temptation attractor), drop (input ignored), drift (a slow sideways pull).
- When an input is betrayed: a brief glitch pass (RGB split plus block displacement), the double's ember eyes flare, and a faint HUD line at the bottom shows "you pressed → · you went ←" using the raw and filtered actions from core Input.
- The visitor can still make progress, slowly. Temptation attractors pull harder; walking close to one makes the double sit up and grow heavier.
- Verse 7:19 appears once, halfway through, two lines maximum.

### CH3 · νόμος · THE LAW (Romans 7:7-13)
- Tall monoliths of pale stone rise along the path, carved with glowing lines of abstract script (no readable commandments, just luminous carved marks).
- Their light is cold and holy (#E8F1FF). When the visitor walks into their light, the double becomes FULLY visible: its silhouette sharpens, its particles stop hiding in fog. Its weight jumps.
- The law is good and the light is beautiful. It simply exposes. Text: "the commandment is holy, righteous, and good" (7:12).
- Mechanic: the visitor can walk around the monoliths (staying in the dark keeps the double hidden but the path is longer) or through their light (faster but heavier). Either way, the weight rises.

### CH4 · ταλαίπωρος · WRETCHED (self-effort)
- The visitor tries to free themselves. A struggle prompt appears: "break the chain".
- Tools and actions, each failing with satisfying physics and sound:
  - Mash the primary button to strain against the chain (a struggle meter fills, the chain stretches, sparks, then the meter collapses).
  - Pick up a stone and strike the links (stones shatter into Rapier debris; the link only glows red-hot and cools).
  - Run at full speed away from the double (the chain yanks the visitor off their feet; ragdoll fall, get up).
  - Drag the double toward a cliff and try to push it off (it climbs back; the chain pulls the visitor to the edge).
  - Try to outrun it toward the light (the corruption filter peaks).
- A counter in the HUD corner: "attempts: N".
- With every failure: stamina drops, the world desaturates further, the drone darkens, the double's grip climbs from the ankle chain to wrap the visitor's wrist with a second shadow-tendril.
- After enough attempts (or 90 seconds), the visitor collapses to their knees. All movement input stops working at all. Silence, except breathing and the faint scrape of the chain.

### CH5 · ῥύσεται · "WHO WILL DELIVER ME?" (Romans 7:24)
- A Whisper appears: "hold to cry out" (hold Space, or press and hold the screen on mobile). An optional mic mode in Settings lets the visitor speak or shout instead; it is OFF by default and the audio never leaves the device.
- While holding: the camera slowly tilts up to the sky, the figure lifts its head, the light on the hill grows, and the verse appears word by word, huge: "Who will deliver me out of the body of this death?"
- Holding to the end triggers the deliverance.

### CH6 · εὐχαριστῶ · "I THANK GOD THROUGH JESUS CHRIST" (Romans 7:25a)
- The sky splits. A cross of light descends from above, vast and slow, and a single beam strikes the chain at the link nearest the visitor's ankle.
- That link dissolves into gold. The chain falls away, link by link, each one turning into gold dust.
- The double does not explode. It slowly stands, faces the light, and dissolves into ash that the wind carries away. Its ember eyes go out gently.
- Color floods back into the world in a wave moving outward from the visitor. The monoliths' cold light warms to gold: the law is fulfilled (Romans 8:4), never destroyed.
- The InputFilter is removed. Then a NEW filter is added: "grace", which makes movement smoother, lighter, and slightly faster than it was even in CH1, with soft gold trails behind the feet.
- Text: "I thank God through Jesus Christ, our Lord!"

### CH7 · οὐδὲν κατάκριμα · NO CONDEMNATION (Romans 7:25b to 8:2)
- The visitor runs freely up the hill toward the light. Music rises into a full warm chord.
- HONEST DETAIL: once or twice during the climb, a tiny glitch still flickers (7:25b: the struggle remains in this life). This time, every flicker is instantly absorbed by a gold pulse around the visitor, and the input is never actually corrupted.
- At the summit, the visitor steps into the light. Romans 8:1 appears, then 8:2.
- Final original line: "The chain is gone. The fight is not yours to win alone."

### END CARD
- Romans 8:1 at the top.
- Buttons: Replay · Back to DELIVERED · Read Romans 7 (opens the WEB text on ebible.org in a new tab) · Share.
- Postcard line: "I tried N times to free myself. Then I cried out. Romans 7:24-25".
- Call `markComplete('wretched')`.

## 6. AUDIO
- Base: a low, heavy drone whose pitch and filter darken with weight.
- The chain: rattle and scrape sounds tied to physics speed.
- Corrupted inputs: a short digital stutter plus a heartbeat skip.
- The law monoliths: a high, cold, pure tone, like a glass harmonica.
- CH4: breathing that gets heavier, strain grunts as soft filtered noise (never cartoonish).
- CH5: silence, then a single sustained voice-like tone rising while the visitor holds.
- CH6: a massive warm chord, bells, and a choir-like pad.
- Reverb: the "vast desert" impulse response from the core.

## 7. CONTROLS
- Desktop: WASD or arrow keys to move, mouse to look (optional), Space for primary, E to pick up or interact.
- Mobile: the core virtual joystick and action buttons.
- Gamepad supported by the core.
- Accessibility setting "gentle corruption": lowers corruption intensity for visitors who find the mechanic too frustrating, without removing the experience.

## 8. PERFORMANCE
- Follow the core Quality budgets. Shadow particles for the double: 30k high / 12k medium / 5k low.
- Terrain: one mesh with LOD, footprints in a render-target trail texture.
- Total room payload under 2 MB gzipped. Everything procedural, no large models.

## 9. MILESTONES
After each milestone: `pnpm build`, `pnpm test`, fix everything, commit with the `[wretched]` prefix.
- M1: World (terrain, fog, sky, the light on the hill), the visitor with walk cycle and follow camera, the double ragdoll with shadow particles, the chain.
- M2: CH0, CH1, CH2 with the full corrupting InputFilter and the raw-vs-filtered HUD.
- M3: CH3 law monoliths and CH4 self-effort with every failing tool.
- M4: CH5 cry-out and CH6 deliverance (the most important visual moment: make it unforgettable).
- M5: CH7, end card, postcard, audio polish.
- M6: Mobile controls polish, accessibility (gentle corruption, reduced motion, flash limits), Amharic UI strings, performance pass.

## 10. DEFINITION OF DONE
- A full run plays end to end with zero console errors.
- The corruption feels unfair but never broken: the visitor can always make some progress in CH2 and CH3.
- No memory growth across 3 full replays.
- Works on Chrome, Firefox, Safari (iOS 16+), and Android Chrome. At least 30 fps on a mid-range Android phone.
- All scripture verified against WEB.
- The whole repo still builds.

## 11. DO NOT
- Do not make the double scary in a horror way, and add no jump scares.
- Do not shame the visitor in any text.
- Do not show the law as evil or destroy it.
- Do not let self-effort ever succeed, even by exploiting physics. Clamp it.
- Do not stop to ask me questions.

## START
Write `apps/wretched/PLAN.md` (short: chapter list, the InputFilter design, the deliverance sequence timeline), then start Milestone 1 immediately.
