import '@delivered/core/styles.css';
import './underneath.css';
import { createApp, createPostcard, getLanguage, markComplete, registerScripture, sharePostcard, t, toast, webChapterUrl } from '@delivered/core';
import { Threshold, Lean, GiveWay } from './chapters/heights';
import { Fall, Rider, resetFall } from './chapters/fall';
import { Underneath, Dwelling } from './chapters/home';
import { Playground } from './chapters/play';
import { registerUnderneathStrings } from './strings';
import { World, type UnderCtx } from './world/world';
import { scripture } from './scripture';

registerUnderneathStrings();
registerScripture(scripture);

const ctx = await createApp<UnderCtx>({
  appId: 'underneath',
  title: 'UNDERNEATH',
  reverb: 'openSky',
  transition: 'dissolve',
  chapters: [new Threshold(), new Lean(), new GiveWay(), new Fall(), new Rider(), new Underneath(), new Dwelling(), new Playground()],
  setup: (c, progress) => {
    c.world = new World(c);
    if (new URLSearchParams(location.search).has('test')) (globalThis as { __uworld?: unknown }).__uworld = c;
    progress(0.7);
    c.world.easyIslands = c.store.get('easy', false);
    c.ui.settings.addSwitch({
      label: c.t('underneath.easy'),
      get: () => c.world.easyIslands,
      set: (v) => {
        c.world.easyIslands = v;
        c.store.set('easy', v);
      },
    });
    progress(1);
  },
  onFrame: (dt, c) => c.world.update(dt),
  onEnd: () => void showEnd(),
});

async function showEnd(): Promise<void> {
  markComplete('underneath');
  const { ui, director, world } = ctx;
  const n = world.lets;
  const c = world.catches;
  const shown = ui.end.show({
    title: 'UNDERNEATH',
    ref: 'Deuteronomy 33:26-27',
    line: t('underneath.closing'),
    readUrl: webChapterUrl('Deuteronomy', 33),
    readLabel: t('underneath.read'),
    onReplay: () => {
      ui.end.hide();
      resetFall(ctx);
      world.lets = world.catches = 0;
      director.resetProgress();
      void director.goTo(0);
    },
    onShare: async () => {
      try {
        const blob = await createPostcard({
          canvas: ctx.engine.renderer.domElement, title: 'UNDERNEATH', line: t('underneath.postcard', { n, c }), ref: 'Deuteronomy 33:27', lang: getLanguage(),
        });
        const r = await sharePostcard(blob, 'delivered-underneath.png');
        if (r === 'downloaded') toast(t('core.postcard.saved'));
      } catch {
        toast(t('core.postcard.failed'));
      }
    },
  });
  await shown;
}

// Test hook for the headless playthrough checks (never on a normal visit).
if (new URLSearchParams(location.search).has('test')) (globalThis as { __underneath?: unknown }).__underneath = ctx;
