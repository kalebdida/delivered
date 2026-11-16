import '@delivered/core/styles.css';
import './gain.css';
import { createApp, createPostcard, getLanguage, markComplete, registerScripture, sharePostcard, t, toast, webChapterUrl } from '@delivered/core';
import { Chains } from './chapters/chains';
import { Doors } from './chapters/doors';
import { Labor } from './chapters/labor';
import { LedgerChapter } from './chapters/ledger';
import { Letter } from './chapters/letter';
import { Light } from './chapters/light';
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
  chapters: [new Threshold(), new LedgerChapter(), new Chains(), new Letter(), new Doors(), new Labor(), new Light()],
  setup: (c, progress) => {
    c.world = new World(c);
    progress(1);
  },
  onFrame: (dt, c) => c.world.update(dt),
  onEnd: () => void showEnd(),
});

async function showEnd(): Promise<void> {
  markComplete('gain');
  const { ui, director, world } = ctx;
  const shown = ui.end.show({
    title: 'GAIN',
    ref: 'Philippians 1:21',
    readUrl: webChapterUrl('Philippians', 1),
    readLabel: t('gain.read'),
    onReplay: () => {
      ui.end.hide();
      world.inCell = true;
      world.chainToWall();
      director.resetProgress();
      void director.goTo(0);
    },
    onShare: async () => {
      try {
        const blob = await createPostcard({ canvas: ctx.engine.renderer.domElement, title: 'GAIN', line: t('gain.postcard'), ref: 'Philippians 1:21', lang: getLanguage() });
        const r = await sharePostcard(blob, 'delivered-gain.png');
        if (r === 'downloaded') toast(t('core.postcard.saved'));
      } catch {
        toast(t('core.postcard.failed'));
      }
    },
  });
  await shown;
}

// Test hook for headless checks (never on a normal visit).
if (new URLSearchParams(location.search).has('test')) (globalThis as { __gain?: unknown }).__gain = ctx;
