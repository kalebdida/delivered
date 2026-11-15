import '@delivered/core/styles.css';
import './gain.css';
import { createApp, markComplete, registerScripture } from '@delivered/core';
import { LedgerChapter } from './chapters/ledger';
import { Threshold } from './chapters/threshold';
import { scripture } from './scripture';
import { registerGainStrings } from './strings';
import { World, type GainCtx } from './world/world';

registerGainStrings();
registerScripture(scripture);

const ctx = await createApp<GainCtx>({
  appId: 'gain',
  title: 'GAIN',
  reverb: 'smallCell',
  transition: 'dissolve',
  chapters: [new Threshold(), new LedgerChapter()],
  setup: (c, progress) => {
    c.world = new World(c);
    progress(1);
  },
  onFrame: (dt, c) => c.world.update(dt),
  onEnd: () => markComplete('gain'),
});

// Test hook for headless checks (never on a normal visit).
if (new URLSearchParams(location.search).has('test')) (globalThis as { __gain?: unknown }).__gain = ctx;
