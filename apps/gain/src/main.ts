import '@delivered/core/styles.css';
import { createApp, markComplete } from '@delivered/core';
import { Still } from './chapters/still';
import { World, type GainCtx } from './world/world';

const ctx = await createApp<GainCtx>({
  appId: 'gain',
  title: 'GAIN',
  reverb: 'smallCell',
  transition: 'dissolve',
  chapters: [new Still()],
  setup: (c, progress) => {
    c.world = new World(c);
    progress(1);
  },
  onFrame: (dt, c) => c.world.update(dt),
  onEnd: () => markComplete('gain'),
});

// Test hook for headless checks (never on a normal visit).
if (new URLSearchParams(location.search).has('test')) (globalThis as { __gain?: unknown }).__gain = ctx;
