# WRETCHED · Beauty Review

One review at the end of M5, by Kal's instruction: desktop (1440x900) for every chapter at its
`keyMomentAt`, mobile (390x844 @2x) for the three key moments only. Headless Chromium with
SwiftShader, medium tier (so no depth of field, and software-rendered bloom).

| Shot | First score | Problem | Fix | Final |
| --- | --- | --- | --- | --- |
| CH0 threshold, desktop | 4 | key frame landed after the verse, on plain black | `keyMomentAt` 12 → 10.5: the second line with τίς με ῥύσεται | 8 |
| CH1 want, desktop | 8 | the figure first read as a dark wooden mannequin | warmer emissive clay, stronger rim, a fill light from the camera side | 8 |
| CH2 corruption, desktop | 6 | the double lay under the camera, so only the chain showed | camera higher and further back; look point brought closer so the double stays in frame | 8 |
| CH2 corruption, mobile | 8 | | portrait follow offset (higher, further) | 8 |
| CH3 law, desktop | 9 | | monoliths, cold pools and the exposed double read clearly | 9 |
| CH4 wretched, desktop | 7 | stones read as black balls | paler, faceted stones | 8 |
| CH5 cry, desktop | 7 | the huge words sat on top of the light's halo | the line now sits in the upper third | 8 |
| CH6 deliverance, desktop | 5 | the cross was above the frame | camera looks up (lookOffset y 10.5) with a wider FOV: cross, beam and kneeling figure in one frame | 9 |
| CH6 deliverance, mobile | 9 | | | 9 |
| CH7 summit, desktop | 5 | the halo and a white fade swallowed the verse | halo shrinks near the light, fade 0.35 → 0.08, verse in the lower position, camera turned off-axis | 8 |
| CH7 summit, mobile | 6 | the figure filled the screen and covered the verse; one arm stuck out | portrait summit camera further back; summit pose without the reach | 8 |

Open points for M6: on real GPUs check bloom strength on the cross and the beacon (SwiftShader
renders bloom differently), and check the double's particle density on low-tier phones.

## Beauty pass 2 (desktop 1440x900, medium tier, SwiftShader)

Capture note: SwiftShader runs the scene at about 0.2x real time, so verses timed on the wall
clock had already faded by the key moment. The pass slowed page timers to match the scene clock.
The earlier "missing verse" frames came from this, not from the chapters.

| Shot | First score | Problem | Fix | Final |
| --- | --- | --- | --- | --- |
| Visitor figure | n/a | a jointed capsule mannequin | hooded cloak: shoulder mantle, flared skirt, peaked hood (double-sided cloth material) | n/a |
| CH0 threshold | 2 | black frame, verse already gone | verse now holds at the key moment; fade-in starts at 6.5 s | 7 |
| CH2 corruption | 5 | the double hidden under the camera | camera to the side and higher; the double flares visible at the betrayal | 8 |
| CH4 collapse | 5 | black stones; whisper sat on the figure | pale stones with a warm emissive; camera tilts down so the figure clears the whisper | 8 |
| CH6 deliverance | 5 | figure cropped, cross grey, chain gone before it read | reframed: figure, beam and cross in one shot; warmer cross; saturation lifts at the strike; gold links linger about 4 s | 8 |
| CH7 summit | 5 | mannequin under the verse | hooded figure; the look point moves left so the figure sits right of the verse | 8 |

Still open: CH0 has no visible figure at its key moment (the start of the path is unlit). On
CH6 the gold reads in the sparks but not yet in the links themselves, so it stays below the 9
target. Both need another round of shots.


## Final art direction (desktop 1440x900 and mobile 390x844, medium tier, SwiftShader)

Captured with `scripts/shots-slow.mjs` (one virtual clock for the page, so verses hold).

| Shot | Before | Problem | Fix | Final |
| --- | --- | --- | --- | --- |
| CH0 threshold, desktop | 7 | no figure behind the verse; in this pass's captures the frame was fully black | The black frame was a core bug, not the lighting: the chapter's instant fade to black became NaN on the first zero-length frame and never lifted (fixed in `postfx.ts`). Then: a faint warm key from above the left shoulder and a low kicker ahead, and a camera further back and tilted up, so the hooded figure stands in a pool of light under the verse with the far light above it. | 8 |
| CH6 deliverance, desktop | 8 | the gold read in the sparks, not in the links | The links are gold metal now (albedo and roughness turn with the light, a deeper gold kept under the clipping point so it stays gold and not white), each swells as it turns and holds its gold about 3 s before it lets go, each carries a soft halo, and a gold light travels down the chain. At the strike the camera comes down to the ground beside the chain: the gold links fill the foreground, the kneeling figure and the beam behind them, the cross above; then it rises again for the double. The iridescent attractors are hidden in this chapter. | 9 |
| CH6 deliverance, mobile | 9 | the new low shot cropped the figure and lost the cross in portrait | Portrait keeps its tall framing (no low shot), with the figure brought in from the corner: figure, beam and cross in one column. The touch controls sit over the lower part of the figure. | 8.5 |
| Visitor figure | n/a | a lit clay face inside the hood; a boxy waist | the hood opens onto shadow (as in the other rooms); the mantle falls into the skirt | n/a |

Re-shoot log (limit: two per frame):
- CH0 desktop: first shot black (the NaN fade); re-shoot 1 the figure stood behind the verse and
  was lit too flat; re-shoot 2 is the 8 above. The far light sits behind the end of the reference
  line, which costs it a little contrast.
- CH6 desktop: first shot too pale and the links too small to read; re-shoot 1 reframed wider
  with a deeper gold, links still tiny; re-shoot 2 is the low shot, the 9 above. The nearest
  links run out of the left edge of the frame.
- CH6 mobile: first shot cropped (the low camera in portrait); re-shoot 1 back to the tall
  framing with the figure in the corner; re-shoot 2 moves the figure in from the corner.
