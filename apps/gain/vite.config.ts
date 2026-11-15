import { fileURLToPath } from 'node:url';
import { defineApp } from '../../vite.base.mjs';

// GAIN uses core Verlet only: alias Rapier to a stub so it never ships with this room.
export default defineApp('/gain/', {
  resolve: { alias: { '@dimforge/rapier3d-compat': fileURLToPath(new URL('./src/local-core/no-rapier.ts', import.meta.url)) } },
});
