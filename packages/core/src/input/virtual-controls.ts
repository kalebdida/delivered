import { icons, type IconName } from '../ui/icons';

export interface VirtualButton {
  id: string;
  /** Accessible label (already translated). */
  label: string;
  icon?: IconName;
  /** Short text shown inside the button when there is no icon. */
  text?: string;
  size?: 'large' | 'small';
}

export interface VirtualState {
  moveX: number;
  moveY: number;
  buttons: Record<string, boolean>;
}

/**
 * Touch controls: a thin-ring joystick that appears under the left thumb, and action buttons in
 * the right thumb zone. Created automatically by `Input` on touch devices.
 */
export class VirtualControls {
  readonly state: VirtualState = { moveX: 0, moveY: 0, buttons: {} };
  readonly el: HTMLElement;
  private zone: HTMLElement;
  private ring: HTMLElement;
  private knob: HTMLElement;
  private buttonBar: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private readonly radius = 52;

  constructor(parent: HTMLElement = document.body, buttons: VirtualButton[] = DEFAULT_BUTTONS) {
    this.el = document.createElement('div');
    this.el.className = 'dl-vc';
    this.zone = document.createElement('div');
    this.zone.className = 'dl-vc__zone';
    this.ring = document.createElement('div');
    this.ring.className = 'dl-vc__ring';
    this.knob = document.createElement('div');
    this.knob.className = 'dl-vc__knob';
    this.ring.appendChild(this.knob);
    this.zone.appendChild(this.ring);
    this.buttonBar = document.createElement('div');
    this.buttonBar.className = 'dl-vc__buttons';
    this.el.append(this.zone, this.buttonBar);
    parent.appendChild(this.el);
    this.setButtons(buttons);

    this.zone.addEventListener('pointerdown', this.onDown);
    this.zone.addEventListener('pointermove', this.onMove);
    this.zone.addEventListener('pointerup', this.onUp);
    this.zone.addEventListener('pointercancel', this.onUp);
  }

  /** Replace the action buttons (rooms add their own, e.g. "look up"). */
  setButtons(buttons: VirtualButton[]): void {
    this.buttonBar.replaceChildren();
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `dl-vc__btn dl-vc__btn--${b.size ?? 'small'}`;
      el.setAttribute('aria-label', b.label);
      el.innerHTML = b.icon ? icons[b.icon] : `<span>${b.text ?? ''}</span>`;
      const set = (v: boolean) => (e: Event) => {
        e.preventDefault();
        this.state.buttons[b.id] = v;
        el.classList.toggle('is-down', v);
        if (v && (e as PointerEvent).pointerId !== undefined) el.setPointerCapture((e as PointerEvent).pointerId);
      };
      el.addEventListener('pointerdown', set(true));
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      this.buttonBar.appendChild(el);
    }
  }

  setVisible(v: boolean): void {
    this.el.classList.toggle('is-hidden', !v);
    if (!v) this.release();
  }

  private onDown = (e: PointerEvent) => {
    if (this.stickId !== null) return;
    this.stickId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    this.ring.style.left = `${e.clientX}px`;
    this.ring.style.top = `${e.clientY}px`;
    this.ring.classList.add('is-on');
    this.apply(0, 0);
  };
  private onMove = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      // The ring follows the thumb once it leaves the radius.
      const over = len - this.radius;
      this.origin.x += (dx / len) * over;
      this.origin.y += (dy / len) * over;
      this.ring.style.left = `${this.origin.x}px`;
      this.ring.style.top = `${this.origin.y}px`;
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.apply(dx, dy);
  };
  private onUp = (e: PointerEvent) => {
    if (e.pointerId !== this.stickId) return;
    this.release();
  };
  private release(): void {
    this.stickId = null;
    this.ring.classList.remove('is-on');
    this.apply(0, 0);
  }
  private apply(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    this.state.moveX = dx / this.radius;
    this.state.moveY = -dy / this.radius;
  }

  dispose(): void {
    this.el.remove();
  }
}

export const DEFAULT_BUTTONS: VirtualButton[] = [
  { id: 'secondary', label: 'Interact', size: 'small', icon: 'hand' },
  { id: 'primary', label: 'Action', size: 'large', icon: 'dot' },
];
