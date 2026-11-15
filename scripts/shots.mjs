// pnpm shots [app ...]
// Opens every app in headless Chromium, jumps to every chapter with ?chapter=N, waits for the
// chapter's key moment (Chapter.keyMomentAt) and saves desktop (1440x900) and mobile (390x844)
// screenshots into shots/. Used for the Beauty Review (DESIGN.md, BEAUTY.md).
//
//   pnpm build && pnpm shots            every app
//   pnpm shots gain                     one app
//   SHOTS_URL=http://localhost:5173 pnpm shots wretched    against a running dev server
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const ALL = { hub: '/', wretched: '/wretched/', underneath: '/underneath/', gain: '/gain/', demo: '/demo/' };
const wanted = process.argv.slice(2).filter((a) => a in ALL);
const apps = wanted.length ? wanted : Object.keys(ALL);
const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

let server = null;
let base = process.env.SHOTS_URL;
if (!base) {
  if (!existsSync(`${root}dist`)) {
    console.error('dist/ not found. Run `pnpm build` first (or set SHOTS_URL to a dev server).');
    process.exit(1);
  }
  const port = 4317;
  server = spawn(process.execPath, [`${root}scripts/preview.mjs`, String(port)], { stdio: 'ignore' });
  base = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 700));
}

const GPU = ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];
const SOFT = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
const COMMON = ['--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars'];
// Use Playwright's own Chromium (`pnpm exec playwright install chromium` once), or point
// PW_CHROMIUM at any Chrome/Chromium binary. Some CI and cloud images ship one at a fixed path.
const EXECUTABLE = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
async function launch() {
  for (const flags of [GPU, SOFT]) {
    const browser = await chromium.launch({ args: [...flags, ...COMMON], ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}) });
    const page = await browser.newPage();
    const ok = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
    await page.close();
    if (ok) {
      console.log(`WebGL2 via ${flags === GPU ? 'GPU' : 'SwiftShader (software)'}`);
      return browser;
    }
    await browser.close();
  }
  throw new Error('No WebGL2 available in headless Chromium.');
}

const browser = await launch();
mkdirSync(`${root}shots`, { recursive: true });
const problems = [];
try {
  for (const app of apps) {
    let count = 1;
    for (let chapter = 0; chapter < count; chapter++) {
      for (const [name, viewport] of Object.entries(VIEWPORTS)) {
        const context = await browser.newContext({ ...viewport, reducedMotion: 'no-preference' });
        const page = await context.newPage();
        page.on('console', (m) => m.type() === 'error' && problems.push(`${app}#${chapter} ${name}: ${m.text()}`));
        page.on('pageerror', (e) => problems.push(`${app}#${chapter} ${name}: ${e.message}`));
        const url = `${base}${ALL[app]}?chapter=${chapter}&shot=1${process.env.SHOTS_QUALITY ? `&quality=${process.env.SHOTS_QUALITY}` : ''}`;
        await page.goto(url, { waitUntil: 'load' });
        try {
          await page.waitForFunction(() => globalThis.__delivered?.ready === true, null, { timeout: 60000 });
          const info = await page.evaluate(() => globalThis.__delivered);
          count = info.chapterCount ?? 1;
          const until = (info.keyMomentAt ?? 3) * 1000;
          // Software rendering can run slower than real time, so wait on the page's own clock.
          if (typeof info.elapsed === 'number') {
            await page
              .waitForFunction((s) => globalThis.__delivered.elapsed >= s, until / 1000, { timeout: until * 12 + 20000 })
              .catch(() => page.waitForTimeout(until));
          } else await page.waitForTimeout(until);
          await page.waitForTimeout(300);
          const file = `shots/${app}-${String(chapter).padStart(2, '0')}-${info.chapterId ?? 'main'}-${name}.png`;
          await page.screenshot({ path: `${root}${file}` });
          console.log(file);
        } catch (err) {
          problems.push(`${app}#${chapter} ${name}: ${err.message.split('\n')[0]}`);
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of [...new Set(problems)]) console.log('  ' + p);
  process.exitCode = 1;
}
