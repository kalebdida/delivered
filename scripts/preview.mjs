// pnpm preview [port]: serves the assembled dist/ the way Netlify will (with the 404 fallback).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};
createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  let status = 200;
  if (!existsSync(file)) {
    file = join(dist, '404.html');
    status = 404;
    if (!existsSync(file)) {
      res.writeHead(404).end('Not found');
      return;
    }
  }
  res.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`DELIVERED preview on http://localhost:${port}`));
