// node scripts/shots-slow.mjs <spec.json | inline specs>
// The slowed-clock capture for the Beauty Review. Software WebGL (SwiftShader) renders far slower
// than real time, so anything on the wall clock (verse durations, gsap camera paths) has already
// finished by a chapter's key moment. This script replaces the page's clocks (performance.now,
// Date.now, setTimeout, setInterval, the rAF timestamp) with one virtual clock that advances a
// fixed 1/15 s per rendered frame, so verses, cameras and the scene all agree.
//
// Each spec: app:chapter:seconds[,seconds...]:viewport[:query]
//   node scripts/shots-slow.mjs wretched:6:10:desktop underneath:5:11,16.6,27:desktop "gain:3:4:desktop:leg=rome"
// `chapter` may be `-` for a page without chapters (the hub); seconds are then page seconds.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SITE_BASE } from './site-base.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const PATHS = { hub: '/', wretched: '/wretched/', underneath: '/underneath/', gain: '/gain/' };
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const specs = process.argv.slice(2).map((s) => {
  const [app, chapter, times, viewport = 'desktop', query = ''] = s.split(':');
  return { app, chapter, times: times.split(',').map(Number), viewport, query };
});
if (!specs.length || !existsSync(`${root}dist`)) {
  console.error('Usage: pnpm build && node scripts/shots-slow.mjs app:chapter:seconds:viewport[:query] ...');
  process.exit(1);
}

const port = Number(process.env.SHOTS_PORT ?? 4318);
const server = spawn(process.execPath, [`${root}scripts/preview.mjs`, String(port)], { stdio: 'ignore' });
const base = `http://localhost:${port}${SITE_BASE.slice(0, -1)}`;
await new Promise((r) => setTimeout(r, 700));

function virtualClock() {
  const { window, performance } = globalThis;
  const STEP = 1000 / 15;
  let now = 0;
  let seq = 1;
  const timers = new Map();
  const raf = window.requestAnimationFrame.bind(window);
  const epoch = Date.now();
  performance.now = () => now;
  Date.now = () => epoch + now;
  window.setTimeout = (fn, ms = 0, ...args) => (timers.set(seq, { at: now + Math.max(0, ms), fn, args }), seq++);
  window.setInterval = (fn, ms = 0, ...args) => (timers.set(seq, { at: now + Math.max(1, ms), fn, args, every: Math.max(1, ms) }), seq++);
  window.clearTimeout = window.clearInterval = (id) => void timers.delete(id);
  window.requestAnimationFrame = (cb) => raf(() => cb(now));
  const tick = () => {
    now += STEP;
    for (const [id, t] of [...timers]) {
      if (t.at > now || !timers.has(id)) continue;
      if (t.every) t.at += t.every;
      else timers.delete(id);
      try {
        if (typeof t.fn === 'function') t.fn(...t.args);
      } catch (e) {
        console.error(e);
      }
    }
    raf(tick);
  };
  raf(tick);
  globalThis.__virtualNow = () => now / 1000;
}

const exe = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio', '--hide-scrollbars'],
  ...(exe ? { executablePath: exe } : {}),
});
mkdirSync(`${root}shots`, { recursive: true });
const quality = process.env.SHOTS_QUALITY ?? 'medium';
try {
  for (const s of specs) {
    const context = await browser.newContext({ ...VIEWPORTS[s.viewport], reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`  ! ${s.app}: ${e.message}`));
    await page.addInitScript(virtualClock);
    const hasChapter = s.chapter !== '-';
    const q = [hasChapter ? `chapter=${s.chapter}&shot=1` : '', `quality=${quality}`, s.query].filter(Boolean).join('&');
    await page.goto(`${base}${PATHS[s.app]}?${q}`, { waitUntil: 'load' });
    try {
      if (hasChapter) await page.waitForFunction(() => globalThis.__delivered?.ready === true, null, { timeout: 120000 });
      for (const t of s.times) {
        await page.waitForFunction(
          ([t, ch]) => (ch ? globalThis.__delivered.elapsed : globalThis.__virtualNow()) >= t,
          [t, hasChapter],
          { timeout: 900000, polling: 250 },
        );
        const tag = s.query ? `-${s.query.replace(/[^a-z0-9]+/gi, '_')}` : '';
        const file = `shots/${s.app}-${hasChapter ? `ch${s.chapter}` : 'page'}${tag}-${String(t).replace('.', '_')}s-${s.viewport}.png`;
        await page.screenshot({ path: `${root}${file}` });
        console.log(file);
        if (process.env.SHOTS_EVAL) console.log('  =', JSON.stringify(await page.evaluate(process.env.SHOTS_EVAL)));
      }
    } catch (err) {
      console.log(`  ! ${s.app} ${s.chapter} ${s.viewport}: ${err.message.split('\n')[0]}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}
