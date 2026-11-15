// pnpm og: renders the hub scene at 1200x630 into apps/hub/public/og.jpg (the social card).
// Run after `pnpm build`. The image is committed, so this only needs re-running when the hub changes.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 4318;
const server = spawn(process.execPath, [`${root}scripts/preview.mjs`, String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const executablePath = process.env.PW_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--mute-audio'],
  ...(executablePath ? { executablePath } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/?og=1&shot=1&quality=high`, { waitUntil: 'load' });
  await page.waitForFunction(() => globalThis.__delivered?.ready === true && globalThis.__delivered.elapsed > 4.5, null, { timeout: 120000 });
  await page.screenshot({ path: `${root}apps/hub/public/og.jpg`, type: 'jpeg', quality: 88 });
  console.log('apps/hub/public/og.jpg');
} finally {
  await browser.close();
  server.kill();
}
