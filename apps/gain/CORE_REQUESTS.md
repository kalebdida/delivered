# GAIN · core requests

1. **Amharic for Philippians 1:2.** CH3 shows the letter's real opening (1:1, a partial, and 1:2).
   1:2 is not in the core registry, so it is registered in `apps/gain/src/scripture.ts` in English
   (WEB, verified). Wish: add 1:1 and 1:2 to the core registry in both languages.
2. **Pointer position in `Input`.** GAIN grabs things in 3D (ledger objects, chain links, the reed
   pen) and needs the pointer in normalised device coordinates plus press/release edges. `Input`
   exposes actions and look deltas only. Local version: `src/world/pointer.ts`. Wish:
   `input.pointer = { ndc, px, down, justDown, justUp, travel, type }`.
3. **PCFSoftShadowMap is gone in three r187.** Every room logs "PCFSoftShadowMap has been removed.
   Using PCFShadowMap instead." once. Wish: `engine.ts` uses `PCFShadowMap` (or `VSMShadowMap`)
   directly.
4. **A slot for the support line on the end card** (same as UNDERNEATH): GAIN appends it to
   `.dl-end` itself for now.
5. **Room line in the About panel** (same as WRETCHED #2 and UNDERNEATH #2).
6. **troika fallback fonts.** troika fetches fallback glyph fonts from a CDN when a string has a
   character the given font lacks. GAIN avoids it by sanitising input. Wish: the core configures
   troika once (`configureTextBuilder`) so a missing glyph can never cause a third-party request,
   and ships the Ethiopic subset for 3D text.
