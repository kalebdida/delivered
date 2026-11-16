# UNDERNEATH · Beauty Review

## Beauty pass (branch `beauty/underneath`)

`pnpm build && SHOTS_QUALITY=medium pnpm shots underneath`: desktop 1440x900 and mobile 390x844 at
every chapter's key moment, in headless Chromium with SwiftShader (software WebGL), so bloom,
anti-aliasing and god rays are weaker than on a real GPU. Extra frames for this review: the CH5
reveal (t = 27 s), the CH5 push-in (t = 16.6 s), and CH1 and CH5 on `?quality=high` (raymarched
cloud sea). The DESIGN.md bar is 8; CH1's opening and CH5's catch are meant to reach 10.

The earlier review's scores were generous. Re-scored honestly against the baseline screenshots,
CH1 was nearer 5 (flat haze sky, cone grass, a near-black slab for a figure), CH2 and CH3 nearer 4,
and the CH5 arms read as dust. The scores below are for this pass's frames.

| Chapter · moment | Before | Desktop | Mobile | What changed |
| --- | --- | --- | --- | --- |
| CH0 threshold · Yeshurun | 8 | 8 | 8 | unchanged (black, the word, a soft scrim) |
| CH1 opening frame | 5 | 9 | 8 | golden hour: the sun low in frame behind the figure (azimuth moved onto the island course), cumulus banks on the horizon with silver linings, cirrus above, an endless cloud sea below with sun glare, god rays; a hooded A-line cloak with a gold rim light; swaying blade grass with backlit warmth; rounded stone bridges; a wide opening camera (figure on the left third) that settles into play; portrait turns toward the sun so it stays in frame |
| CH2 crumbling islands | 4 | 8 | 7 | each Voronoi chunk redrawn as its piece of a round island (clipped to the circle, bevelled, grass on top, earthy sides); camera frames the course running into the sun; god rays |
| CH3 the fall (storm) | 4 | 8 | 7 | the Storm on the far dome: towering indigo walls with billowed structure, never black; lightning lands inside the view and lights the walls and the near billboards from inside, with a forked bolt and a soft one-second afterglow; heavier rain; cool rim on the figure. The key frame is captured during a strike (screenshot hook); between strikes the walls read as dim indigo structure, about a 7 |
| CH4 the rider (look up) | 5 | 8 | 7 | the rider is placed along the look-up line (it was overhead, out of frame) and has fanned light streaks; its wake parts the storm on the dome with lit edges; the look-up camera sees the figure in profile (from below it read as a face) |
| CH5 the catch | 5 | 9 | 8.5 | the arms are now a sculpted mesh of light: two cupped hands with the arms receding into a floor of mist, inner glow, fresnel rim, flowing bands, a faint gold mark at each wrist, ribbons wound on the surface and particles drifting along it; the catch line (which never appeared) now reveals word by word over a local scrim; CH5 keeps Underneath's grade on every screen |
| CH5 push-in (16.6 s) | – | 7 | – | the camera sinks into the palm and the figure is clearly held; the focal glow shrinks as it comes close, but the palm is still a low-contrast cream wash and the scrim behind the line reads as a grey patch on it |
| CH5 the reveal (27 s) | 7 | 7 | – | halos light at each layer as the ghost of the fall passes down through it, and the arms keep their light from far up the column; the frame is still a flat grey-mauve and the arms read thin from that height |
| CH1 opening, high tier | – | 9 | – | the raymarched cloud sea: real billows under the islands, lit gold with silver edges |
| CH5 catch, high tier | – | 9 | – | the denser particle current over the hands |
| CH6 dwelling | 6 | 8 | 8 | the far cloudscape behind it, warmer stone, pleated curtains, a room light and a stronger hearth, framing that shows the roof ring against the sky |
| CH7 playground | 5 | 8 | 7 | a clean midday grade and a blue sky with cloud banks and the sea below; the opening frames the swing and the balloon without the tower at the edge; softer, lumpier cloud ledges; the swing's arch no longer reads as a cross |

### Why CH1 and CH5 are 9 and not 10
- **CH1:** the figure is still a simple capsule body under the cloak, and in software rendering the
  god rays are faint. On a real GPU (full bloom, god rays, high-tier raymarched sea) the frame should
  be close to 10, but that is not what these screenshots show.
- **CH5:** the silhouette reads in one glance, but the far ends of the forearms still end in a soft
  rounded shape where they dive into the mist instead of fading over a long distance, and the
  visitor in the cradle is too small to see in the wide shot (the warm pool marks the spot, the
  push-in shows the figure).

### Still open
- **CH5 push-in and reveal (7):** neither is a chapter key moment, but both are part of the most
  important minute of the room. The push-in needs contrast inside the palm (darker valleys between
  the fingers, a smaller scrim); the reveal needs a darker, clearer column view so the arms and the
  halos carry it.
- The visitor is a simple capsule figure; from directly above (the fall camera) the streaming cloak
  reads as a flat dark shape around the head.
- The core virtual joystick stays visible on touch screens during CH5 even though input is off.
- The let-go hint still names the E key on touch devices.
- Frame rates on real devices are unmeasured; the dome adds a full-screen fbm pass on every tier
  (cheap next to the raymarch, but it should be measured on a mid-range phone).

## Earlier review (M5)

| Chapter · moment | Desktop | Mobile | Fixed in that review |
| --- | --- | --- | --- |
| CH0 threshold · Yeshurun | 8 | – | – |
| CH1 opening frame | 7 | 7 | islands were invisible (negative first-frame `dt`); black crumble slabs |
| CH2 crumbling islands | 6 | – | slab material |
| CH3 the fall (storm) | 6 | – | visitor framing; indigo storm walls |
| CH4 the rider (look up) | 6 | – | cloud-sea puffs hidden below 2,000; rider glow edge |
| CH5 the catch | 6 | 5 | dusk backdrop; hands close around the cradle; warm focal glow |
| CH5 the reveal | 7 | – | glowing ghost tube; column of light |
| CH6 dwelling | 7 | – | – |
| CH7 playground | 6 | 6 | camera start; finish door placement |
