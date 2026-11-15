// The core playground: living documentation for the room agents. Every button below calls one
// public core API, so reading this file next to the README shows how each module is used.
import '@delivered/core/styles.css';
import './demo.css';
import {
  LANGUAGES, LoadingScreen, button, createApp, createPostcard, getLanguage, h, registerStrings, scale, setLanguage, sharePostcard,
  t, webChapterUrl, type CoreContext, type ReverbName, type SoundHandle,
} from '@delivered/core';
import { LightChapter, SkyChapter, WeightChapter, WillChapter, demoState } from './chapters';

registerStrings('en', { 'demo.title': 'Playground', 'demo.closing': 'Every module, one small room.' });
registerStrings('am', { 'demo.title': 'መለማመጃ', 'demo.closing': 'ሁሉም ክፍሎች በአንድ ትንሽ ክፍል።' });

const ctx = await createApp({
  appId: 'demo',
  title: 'PLAYGROUND',
  chapters: [new LightChapter(), new WeightChapter(), new SkyChapter(), new WillChapter()],
  physics: true,
  reverb: 'stoneHall',
  begin: true,
  home: '../',
});
buildPanel(ctx);

function buildPanel(ctx: CoreContext): void {
  const { postfx, audio, ui, loop, director, rig } = ctx;
  const panel = h('aside', { class: 'demo-panel dl-panel', 'aria-label': 'Playground controls' });
  const toggleBtn = button({ label: 'Controls', variant: 'pill', onClick: () => panel.classList.toggle('is-open') });
  toggleBtn.classList.add('demo-toggle');
  document.body.append(panel, toggleBtn);

  const section = (title: string, ...items: HTMLElement[]) => {
    const body = h('div', { class: 'demo-grid' }, ...items);
    panel.appendChild(h('section', {}, h('h3', { class: 'dl-label' }, title), body));
    return body;
  };
  const act = (label: string, fn: () => void) => {
    const b = h('button', { class: 'demo-chip', type: 'button' }, label);
    b.addEventListener('click', fn);
    return b;
  };
  const flip = (label: string, fn: (on: boolean) => void) => {
    const b = h('button', { class: 'demo-chip', type: 'button', 'aria-pressed': 'false' }, label);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      fn(on);
    });
    return b;
  };

  // Chapters (Director + transitions)
  const tabs = director.chapters.map((c, i) => act(c.id, () => void director.goTo(i, (['dissolve', 'ink', 'light', 'dissolve'] as const)[i])));
  section('Chapters', ...tabs);
  const mark = () => tabs.forEach((b, i) => b.setAttribute('aria-pressed', String(i === director.index)));
  director.events.on('chapter', mark);
  mark();

  // PostFX: every pass
  section(
    'PostFX',
    flip('bloom+', (on) => (postfx.params.bloom = on ? 1.3 : 0.55)),
    flip('heat haze', (on) => (postfx.params.heat = on ? 0.7 : 0)),
    flip('glitch', (on) => (postfx.params.glitch = on ? 0.6 : 0)),
    flip('rgb split', (on) => (postfx.params.split = on ? 0.004 : 0)),
    flip('radial blur', (on) => (postfx.params.radialBlur = on ? 0.6 : 0)),
    flip('depth of field', (on) => (postfx.params.dof = on)),
    flip('greyscale', (on) => (postfx.params.saturation = on ? 0 : 1)),
    flip('heavy grain', (on) => (postfx.params.grain = on ? 0.09 : 0.03)),
    flip('vignette+', (on) => (postfx.params.vignette = on ? 0.95 : 0.55)),
    flip('white-out', (on) => postfx.fadeTo('white', on ? 1 : 0, 1.2)),
    flip('black-out', (on) => postfx.fadeTo('black', on ? 1 : 0, 1.2)),
    act('flash', () => postfx.flash(0.8)),
    act('glitch burst', () => postfx.glitchBurst(0.9, 0.35)),
  );

  // Time and camera
  section(
    'Time and camera',
    flip('slow motion', (on) => (loop.timeScale = on ? 0.2 : 1)),
    act('shake', () => rig.addTrauma(0.7)),
    act('fov kick', () => rig.kickFov(9)),
    flip('letterbox', (on) => rig.letterbox(on)),
  );

  // Physics and input (act on the chapter that owns them)
  section(
    'Physics · weight',
    act('break chain', () => demoState.breakChain()),
    act('new ragdoll', () => demoState.dropRagdoll()),
    act('crumble', () => demoState.crumble()),
  );
  section(
    'Input · will',
    flip('corrupt input', () => void demoState.toggleCorruption()),
    flip('grace', () => void demoState.toggleGrace()),
  );

  // Audio: every procedural sound
  const s = scale('D3', 'dorian');
  const sustained = (label: string, start: () => SoundHandle) => {
    let handle: SoundHandle | null = null;
    return flip(label, (on) => {
      if (on) handle = start();
      else handle?.stop(1.2);
    });
  };
  const reverbs: ReverbName[] = ['stoneHall', 'smallCell', 'vastDesert', 'openSky'];
  let rv = 0;
  const reverbBtn = act('reverb: stoneHall', () => {
    rv = (rv + 1) % reverbs.length;
    audio.setReverb(reverbs[rv]!);
    reverbBtn.textContent = `reverb: ${reverbs[rv]}`;
    audio.pluck(s.freq(4));
  });
  section(
    'Audio',
    sustained('drone warm', () => audio.drone(s.freq(-7), 'warm')),
    sustained('drone dark', () => audio.drone(55, 'dark')),
    sustained('glass tone', () => audio.drone(880, 'glass', { level: 0.25 })),
    sustained('choir pad', () => audio.drone(s.freq(0), 'choir', { level: 0.4 })),
    act('lyre', () => [0, 2, 4, 7, 4, 6].forEach((d, i) => audio.pluck(s.freq(d + 7), { when: i * 0.28 }))),
    act('flute', () => [7, 9, 8, 4].forEach((d, i) => audio.flute(s.freq(d + 7), { when: i * 1.1, duration: 1.3 }))),
    act('horn', () => audio.horn(s.freq(0))),
    act('bell', () => audio.bell(s.freq(7))),
    act('chord', () => audio.chord(s.chord([0, 2, 4, 7]), { duration: 5 })),
    sustained('wind', () => {
      const w = audio.wind(0.2);
      setTimeout(() => w.setSpeed(1, 3), 1500);
      return w;
    }),
    sustained('rain', () => audio.rain(0.6)),
    sustained('fire', () => audio.fire()),
    sustained('crowd', () => audio.crowd()),
    sustained('breathing', () => audio.breathing(16)),
    sustained('heartbeat', () => audio.heartbeat(72)),
    act('thunder', () => audio.thunder({ distance: 0.3 })),
    act('gallop', () => void audio.gallop(104, 6)),
    act('impact', () => audio.impact(0.8)),
    act('chain', () => audio.chainRattle(0.7)),
    sustained('stone scrape', () => {
      const sc = audio.stoneScrape();
      sc.setLevel(0.6, 0.3);
      return sc;
    }),
    act('crumble sfx', () => audio.crumble(0.7)),
    act('stutter', () => audio.stutter()),
    act('duck', () => audio.duck(0.25, 2)),
    reverbBtn,
  );

  // UI components
  section(
    'Interface',
    act('scripture', () => void ui.scripture.show({ ref: 'Romans 7:24', duration: 6, position: 'center', original: { text: 'τίς με ῥύσεται;', lang: 'grc' } })),
    act('scripture he', () => void ui.scripture.show({ ref: 'Deuteronomy 33:27', duration: 7, position: 'lower', original: { text: 'וּמִתַּחַת זְרֹעֹת עוֹלָם', lang: 'he' } })),
    act('chapter card', () => void ui.card.show({ word: 'θέλω', lang: 'grc', translit: 'thelō', english: 'I want', ref: 'Romans 7:18', number: 1 })),
    act('whisper', () => ui.whisper.show(t('core.whisper.hold'), { duration: 4 })),
    act('hud', () => {
      ui.hud.set('top-left', 'attempts: 7');
      ui.hud.set('top-right', '03 · 08');
      setTimeout(() => ui.hud.clear(), 4000);
    }),
    act('settings', () => ui.settings.open()),
    act('end card', () =>
      void ui.end.show({
        title: 'PLAYGROUND', ref: 'Romans 8:1', line: t('demo.closing'), readUrl: webChapterUrl('Romans', 8),
        onReplay: () => {
          ui.end.hide();
          void director.goTo(0);
        },
        onShare: () => void postcard(),
      }),
    ),
    act('postcard', () => void postcard()),
    act('loader', () => {
      const l = new LoadingScreen({ title: 'DELIVERED' });
      let p = 0;
      const id = setInterval(() => l.setProgress((p += 0.07)), 90);
      setTimeout(() => {
        clearInterval(id);
        void l.finish();
      }, 1500);
    }),
    act('language', () => {
      const i = LANGUAGES.findIndex((l) => l.code === getLanguage());
      setLanguage(LANGUAGES[(i + 1) % LANGUAGES.length]!.code);
    }),
  );

  async function postcard(): Promise<void> {
    const blob = await createPostcard({ canvas: ctx.engine.renderer.domElement, title: 'Playground', line: t('demo.closing'), ref: 'Romans 8:1', lang: getLanguage() });
    await sharePostcard(blob, 'delivered-playground.png');
  }
}
