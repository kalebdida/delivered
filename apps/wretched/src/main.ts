import '@delivered/core/styles.css';
import './wretched.css';
import { createApp, createPostcard, getLanguage, markComplete, sharePostcard, toast, webChapterUrl } from '@delivered/core';
import { Threshold, Want, Dont, Law } from './chapters/early';
import { Cry, Wretched } from './chapters/struggle';
import { NoCondemnation, Thanks } from './chapters/finale';
import { registerWretchedStrings } from './strings';
import { World, type WretchedCtx } from './world/world';

registerWretchedStrings();

const ctx = await createApp<WretchedCtx>({
  appId: 'wretched',
  title: 'WRETCHED',
  reverb: 'vastDesert',
  transition: 'dissolve',
  chapters: [new Threshold(), new Want(), new Dont(), new Law(), new Wretched(), new Cry(), new Thanks(), new NoCondemnation()],
  setup: (c, progress) => {
    c.world = new World(c);
    progress(0.6);
    c.world.gentle = c.store.get('gentle', false);
    c.ui.settings.addSwitch({
      label: c.t('wretched.gentle'),
      get: () => c.world.gentle,
      set: (v) => {
        c.world.gentle = v;
        c.store.set('gentle', v);
      },
    });
    progress(1);
  },
  onFrame: (dt, c) => c.world.update(dt),
  onEnd: () => void showEnd(),
});

async function showEnd(): Promise<void> {
  markComplete('wretched');
  const { ui, director, world, t } = ctx;
  const n = Math.max(world.attempts, 1);
  await ui.end.show({
    title: 'WRETCHED',
    ref: 'Romans 8:1',
    line: t('wretched.closing'),
    readUrl: webChapterUrl('Romans', 7),
    readLabel: t('wretched.read'),
    onReplay: () => {
      ui.end.hide();
      world.trail.clear();
      world.sparks.clear();
      world.attempts = 0;
      director.resetProgress();
      void director.goTo(0);
    },
    onShare: async () => {
      try {
        const blob = await createPostcard({
          canvas: ctx.engine.renderer.domElement, title: 'WRETCHED', line: t('wretched.postcard', { n }), ref: 'Romans 7:24-25', lang: getLanguage(),
        });
        const r = await sharePostcard(blob, 'delivered-wretched.png');
        if (r === 'downloaded') toast(t('core.postcard.saved'));
      } catch {
        toast(t('core.postcard.failed'));
      }
    },
  });
}

// Test hook for the headless playthrough checks (never on a normal visit).
if (new URLSearchParams(location.search).has('test')) (globalThis as { __wretched?: unknown }).__wretched = ctx;
