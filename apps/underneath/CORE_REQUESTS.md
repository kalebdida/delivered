# UNDERNEATH · core requests

1. **Negative frame delta on the first tick.** `Loop.start` sets `last = performance.now()`, but the
   first `requestAnimationFrame` timestamp can be earlier than that when the start follows a long
   blocking task (shader compiles in headless Chromium: about -1.5 s). Chapters then receive a
   negative `dt`, which launched the visitor into the sky. Wish: `Math.max(0, …)` on `delta` in
   `Loop.start`. **Done in the core:** `clampFrameDt` clamps every frame delta to `[0, 0.1]` s, so
   the local `Math.max(0, dt)` in the chapters and `World.update` has been removed.
2. **Room line in the About panel** (same as WRETCHED #2): UNDERNEATH wants its devotional note
   (`underneath.about`: the gold mark at each wrist, Jeshurun) and the support line there.
   Until then the support line is on the end card only through the core's own `core.support`.
