// GAIN never loads Rapier: its chains are core Verlet. The room's Vite config points the Rapier
// package at this stub, so the 1.65 MB WASM chunk is not even emitted into the GAIN build.
const refuse = (): never => {
  throw new Error('GAIN does not use Rapier (createApp is called without physics).');
};
export const init = refuse;
export default { init: refuse };
