# WRETCHED · core requests

Status: 1 and 3 are in the core (the local workarounds are gone); 2 is logged in the root DECISIONS.md for a later pass.

1. **HeightFog program keys.** `HeightFog.apply` sets `customProgramCacheKey = () => 'heightFog'` on
   every material it patches, so two MeshStandardMaterials with different `onBeforeCompile` code can
   share one program. Wish: append to the existing key, e.g. `` `${prev?.() ?? ''}+heightFog` ``.
   Local workaround: the room re-keys its own materials after `apply` (`world/world.ts`).
2. **A room line in the About panel.** WRETCHED wants one honest "behind the verse" sentence there
   (`wretched.about`). Wish: `createApp({ about: () => Node[] })` or `ui.chrome.addAbout(node)`.
3. **Partial quotations that share a reference.** Registering a partial under `Romans 7:24` replaces
   the full verse. Wish: `registerScripture` keys partials by ref + text (or an `id`), and
   `ScriptureOverlay` accepts `{ ref, partial: n }`. Local workaround: `partial()` in `src/scripture.ts`.
