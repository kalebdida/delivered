// The two doors of CH4 (Philippians 1:22-24), as rules rather than scene code.
//
// CARE RULE: the visitor can never open the "depart" door. It is sealed with soft light and opens
// only on God's timing; its answer is always "not yet". There is deliberately no function here
// that opens it, its state is a frozen constant, and every position the visitor could reach goes
// through `resolveVeil`, which keeps them on this side of the veil whatever the input, the frame
// time, or a teleport.

export type DoorId = 'depart' | 'remain';

/** The depart door's state. Frozen: nothing can change it. */
export const DEPART = Object.freeze({ id: 'depart' as const, state: 'sealed' as const });

/** Asking to go through a door. Depart always answers "not yet". */
export function request(door: DoorId): 'not-yet' | 'open' {
  return door === 'remain' ? 'open' : 'not-yet';
}

export interface Point2 {
  x: number;
  z: number;
}

/**
 * The veil in front of the depart door: a half-disc (on the room side of the wall) that the
 * visitor can come near but never enter. `center` is the middle of the doorway at the wall;
 * `radius` how far the veil reaches into the room; the wall is at z = center.z and the room is
 * z > center.z.
 */
export interface Veil {
  center: Point2;
  radius: number;
  /** Which side of the wall the room is on: +1 (z > center.z, default) or -1 (z < center.z). */
  room?: 1 | -1;
}

/** True if a point is inside the veil, or anywhere beyond the wall the door is set in. */
export function insideVeil(v: Veil, p: Point2): boolean {
  const dx = p.x - v.center.x;
  const dz = (p.z - v.center.z) * (v.room ?? 1);
  return !(dz > 0) || dx * dx + dz * dz < v.radius * v.radius;
}

/**
 * Where the visitor may actually be, given where they were (`prev`, always allowed) and where
 * movement, physics or anything else would put them (`next`). Any step into the veil is pushed
 * back to its edge with a little extra, so the push reads as a gentle "not yet". Non-finite
 * input keeps the previous position; an invalid previous position falls back to `safe`.
 * Returns the resolved point and whether the veil pushed back.
 */
export function resolveVeil(v: Veil, prev: Point2, next: Point2, safe: Point2, margin = 0.04): { p: Point2; pushed: boolean } {
  const ok = (q: Point2) => Number.isFinite(q.x) && Number.isFinite(q.z);
  const from = ok(prev) && !insideVeil(v, prev) ? prev : safe;
  if (!ok(next)) return { p: { x: from.x, z: from.z }, pushed: false };
  if (!insideVeil(v, next)) return { p: { x: next.x, z: next.z }, pushed: false };
  // Push out along the line from the veil's centre; if exactly at the centre, push into the room.
  const side = v.room ?? 1;
  let dx = next.x - v.center.x;
  let dz = (next.z - v.center.z) * side;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    dx = 0;
    dz = 1;
    d = 1;
  }
  const r = v.radius + margin;
  let x = v.center.x + (dx / d) * r;
  let lz = (dz / d) * r;
  // Never behind the wall either: the edge point on the wall side goes into the room.
  if (lz <= 0) lz = margin;
  let z = v.center.z + lz * side;
  if (insideVeil(v, { x, z })) {
    x = from.x;
    z = from.z;
  }
  return { p: { x, z }, pushed: true };
}
