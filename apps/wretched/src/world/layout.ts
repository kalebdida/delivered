// Where things are along the path. The visitor walks from z = 0 toward the light at PATH.light.
export const PATH = {
  start: 0,
  /** CH1 ends here. */
  want: -58,
  /** CH2 ends here. */
  dont: -100,
  /** Monoliths stand between dont and law. CH3 ends here. */
  law: -155,
  /** The struggle arena (CH4 to CH6). */
  arena: -165,
  /** x of the cliff edge in the arena. */
  cliffX: 9,
  /** The summit where the visitor steps into the light. */
  summit: -254,
  /** The light on the hill. */
  light: -262,
  /** Length of the chain in metres. */
  chain: 3.4,
} as const;

/** Temptation attractors: [x, z, kind] with kind 0 orb, 1 spire, 2 mirror. */
export const ATTRACTORS: [number, number, number][] = [
  [-7, -48, 0], [8.5, -58, 1], [-10, -70, 2], [6.5, -80, 0], [-6, -90, 1], [11, -99, 2],
  [-12, -118, 0], [13, -136, 1], [-9, -182, 2], [10, -205, 0],
];

/** Law monoliths: [x, z, height]. Their pools of light sit across the straight path. */
export const MONOLITHS: [number, number, number][] = [
  [-3.2, -104, 7.5], [3.4, -113, 8.5], [-3.6, -122, 9.5], [3.1, -131, 8.8], [-3.3, -140, 10], [3.5, -149, 9],
];
