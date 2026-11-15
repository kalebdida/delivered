// pnpm build: builds every app and assembles one dist/.
//   hub → dist/            rooms → dist/<room>/            core demo → dist/demo/
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const apps = [
  ['apps/hub', ''],
  ['apps/wretched', 'wretched'],
  ['apps/underneath', 'underneath'],
  ['apps/gain', 'gain'],
  ['packages/core/demo', 'demo'],
];
rmSync(`${root}dist`, { recursive: true, force: true });
for (const [dir, out] of apps) {
  if (!existsSync(`${root}${dir}/index.html`)) continue;
  console.log(`\n── building ${dir} → dist/${out}`);
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', `${root}dist/${out}`, '--emptyOutDir', 'false'], {
    cwd: `${root}${dir}`,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
// The favicon lives with the hub and is shared by every room.
if (existsSync(`${root}apps/hub/public/favicon.svg`)) cpSync(`${root}apps/hub/public/favicon.svg`, `${root}dist/favicon.svg`);
console.log('\ndist/ assembled.');
