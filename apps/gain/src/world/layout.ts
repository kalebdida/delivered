// Where everything in the cell is. Units are metres; +Y up; the camera usually looks toward -Z.
import { Vector3 } from 'three';

export const CELL = { x0: -2.6, x1: 2.6, z0: -2.4, z1: 2.4, height: 4.2, wall: 0.42 } as const;

/**
 * The small barred window on the OUTER face of the back wall (centre, size, bars). The wall is
 * thick and the moon is high, so the opening is a slanted chute cut along the light: the inner
 * opening is the outer one moved along the beam (`WINDOW_INNER`).
 */
export const WINDOW = { x: -1.72, y: 3.62, w: 0.6, h: 0.46, bars: 3 } as const;

/** Moonlight is parallel: one direction for the whole beam (from the window into the cell). */
export const BEAM_DIR = new Vector3(1.75, -3.3, 1.55).normalize();
/** Offset from the outer opening to the inner one, through the wall along the beam. */
export const CHUTE = new Vector3(BEAM_DIR.x, BEAM_DIR.y, 0).multiplyScalar(CELL.wall / BEAM_DIR.z);
export const WINDOW_INNER = { x: WINDOW.x + CHUTE.x, y: WINDOW.y + CHUTE.y } as const;
/** Centre of the inner opening on the inner face of the back wall: where the beam enters. */
export const BEAM_ORIGIN = new Vector3(WINDOW_INNER.x, WINDOW_INNER.y, CELL.z0);
/** Where the centre of the beam meets the floor. */
export const BEAM_FLOOR = BEAM_ORIGIN.clone().addScaledVector(BEAM_DIR, -BEAM_ORIGIN.y / BEAM_DIR.y);
export const BEAM_LENGTH = BEAM_ORIGIN.distanceTo(BEAM_FLOOR);

/** The stone ledge the visitor sits on, and the seat point on it. */
export const BENCH = { x0: -2.6, x1: -0.55, z0: -2.4, z1: -1.8, height: 0.44 } as const;
export const SEAT = new Vector3(-1.62, BENCH.height, -1.98);

/** Iron rings in the back wall the two wrist chains are fixed to. */
export const RINGS = [new Vector3(-2.2, 1.0, CELL.z0 + 0.04), new Vector3(-1.02, 1.0, CELL.z0 + 0.04)] as const;

/** The oil lamp on the ledge beside the visitor. */
export const LAMP = new Vector3(-0.92, BENCH.height, -2.14);

/** The heavy door in the right wall (centre z, width, height). */
export const DOOR = { z: 0.55, w: 1.05, h: 2.15 } as const;

/** Where the visitor kneels when they step into the light. */
export const BEAM_KNEEL = new Vector3(BEAM_FLOOR.x - 0.12, 0, BEAM_FLOOR.z - 0.08);
