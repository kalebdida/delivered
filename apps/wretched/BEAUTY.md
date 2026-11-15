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
