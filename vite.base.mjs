// Shared Vite config for every app in the monorepo.
import { defineConfig } from 'vite';
import { SITE_BASE } from './scripts/site-base.mjs';

/**
 * @param {string} base  Path of the app inside the site ('/', '/wretched/', ...). In production it is
 *   served under SITE_BASE (default '/delivered/', see scripts/site-base.mjs).
 * @param {import('vite').UserConfig} [extra]
 */
export function defineApp(base, extra = {}) {
  return defineConfig(({ command }) => ({
    base: command === 'build' ? SITE_BASE + base.replace(/^\/+/, '') : '/',
    build: {
      target: 'es2022',
      assetsInlineLimit: 2048,
      chunkSizeWarningLimit: 1400,
      sourcemap: false,
    },
    worker: { format: 'es' },
    server: { host: true },
    ...extra,
  }));
}
