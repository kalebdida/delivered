/** The semantic actions gameplay reads. Devices are unified into these by `Input`. */
export interface Actions {
  /** -1 (left) .. 1 (right) */
  moveX: number;
  /** -1 (back) .. 1 (forward) */
  moveY: number;
  /** Look delta this frame, in normalized units (roughly radians at default sensitivity). */
  lookX: number;
  lookY: number;
  primary: boolean;
  secondary: boolean;
  /** Space held, or a finger or mouse button held down. */
  hold: boolean;
  confirm: boolean;
  cancel: boolean;
  /** Room-defined extra buttons (for example UNDERNEATH's "lookUp"). */
  custom: Record<string, boolean>;
}

export type ButtonAction = 'primary' | 'secondary' | 'hold' | 'confirm' | 'cancel';

export const emptyActions = (): Actions => ({
  moveX: 0, moveY: 0, lookX: 0, lookY: 0,
  primary: false, secondary: false, hold: false, confirm: false, cancel: false, custom: {},
});

export const cloneActions = (a: Actions): Actions => ({ ...a, custom: { ...a.custom } });

/** Describe a movement vector as an arrow, for the "you pressed → · you went ←" HUD. */
export function arrowFor(x: number, y: number, deadzone = 0.25): string {
  if (Math.hypot(x, y) < deadzone) return '·';
  const a = Math.atan2(y, x);
  const i = Math.round(a / (Math.PI / 4));
  return ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][((i % 8) + 8) % 8]!;
}
