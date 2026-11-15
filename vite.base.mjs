// Shared Vite config for every app in the monorepo.
import { defineConfig } from 'vite';

/**
 * @param {string} base  Public path the app is served from in production ('/', '/wretched/', ...).
 * @param {import('vite').UserConfig} [extra]
 */
export function defineApp(base, extra = {}) {
  return defineConfig(({ command }) => ({
    base: command === 'build' ? base : '/',
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
