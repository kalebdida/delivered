import { clamp } from '../math/easing';
import { Emitter } from '../storage';
import { arrowFor, cloneActions, emptyActions, type Actions, type ButtonAction } from './actions';
import { runFilters, type InputFilter } from './filters';
import { VirtualControls, type VirtualButton } from './virtual-controls';

export interface InputOptions {
  /** Element that receives pointer input (default window). */
  element?: HTMLElement;
  /** Create touch controls on touch devices (default true). */
  virtualControls?: boolean;
  /** Attach DOM listeners (default true; tests pass false and call `setRaw`). */
  listen?: boolean;
  lookSensitivity?: number;
}

const KEYS: Record<string, Partial<Record<'x' | 'y', number>> | ButtonAction> = {
  KeyW: { y: 1 }, ArrowUp: { y: 1 }, KeyS: { y: -1 }, ArrowDown: { y: -1 },
  KeyA: { x: -1 }, ArrowLeft: { x: -1 }, KeyD: { x: 1 }, ArrowRight: { x: 1 },
  Space: 'primary', KeyE: 'secondary', KeyF: 'secondary', Enter: 'confirm', Escape: 'cancel',
};

/**
 * Unified input. Pointer, touch, keyboard, gamepad and (optional) device tilt become semantic
 * actions. Every frame exposes BOTH what the visitor pressed (`raw`) and what gameplay receives
 * after the filter pipeline (`filtered`).
 *
 * ```ts
 * const input = new Input();
 * const remove = input.addFilter(invertFilter());
 * loop.onFrame((dt) => {
 *   input.update(dt);
 *   player.move(input.filtered.moveX, input.filtered.moveY);
 *   if (input.pressed('primary')) jump();
 *   hud.text = input.betrayalLine();   // "you pressed → · you went ←"
 * });
 * ```
 */
export class Input {
  /** What the visitor actually pressed this frame. */
  raw: Actions = emptyActions();
  /** What gameplay receives after every filter. */
  filtered: Actions = emptyActions();
  readonly events = new Emitter<{ filters: readonly InputFilter[]; device: 'keyboard' | 'touch' | 'gamepad' }>();
  /** Touch controls, present on touch devices. */
  virtual: VirtualControls | null = null;
  /** The device used most recently, for showing the right hints. */
  device: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';
  /** When false, `filtered` is all zeros (cut-scenes). `raw` still updates. */
  enabled = true;

  private filters: InputFilter[] = [];
  private prev: Actions = emptyActions();
  private prevRaw: Actions = emptyActions();
  private keys = new Set<string>();
  private pointerDown = false;
  private lookDelta = { x: 0, y: 0 };
  private tilt = { x: 0, y: 0, active: false };
  private custom: Record<string, boolean> = {};
  private injected: Partial<Actions> | null = null;
  private time = 0;
  private readonly sens: number;
  private readonly el: HTMLElement | Window;
  private readonly cleanup: (() => void)[] = [];

  constructor(opts: InputOptions = {}) {
    this.sens = opts.lookSensitivity ?? 0.0025;
    this.el = opts.element ?? (typeof window !== 'undefined' ? window : (undefined as never));
    if (opts.listen === false || typeof window === 'undefined') return;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, o);
      this.cleanup.push(() => t.removeEventListener(type, fn as EventListener, o));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      if (e.code in KEYS) {
        this.keys.add(e.code);
        this.setDevice('keyboard');
        if (e.code === 'Space' || e.code.startsWith('Arrow')) {
          const t = e.target as HTMLElement | null;
          if (!t || !['BUTTON', 'A', 'INPUT', 'SELECT'].includes(t.tagName)) e.preventDefault();
        }
      }
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(this.el, 'pointerdown', (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.closest?.('.dl-vc, .dl-ui, button, a, input, select')) return;
      this.pointerDown = true;
      if (e.pointerType === 'touch') this.setDevice('touch');
    });
    on(window, 'pointerup', () => (this.pointerDown = false));
    on(window, 'pointercancel', () => (this.pointerDown = false));
    on(this.el, 'pointermove', (e: PointerEvent) => {
      if (this.pointerDown || document.pointerLockElement) {
        this.lookDelta.x += e.movementX * this.sens;
        this.lookDelta.y += e.movementY * this.sens;
      }
    }, { passive: true });

    const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (touch && (opts.virtualControls ?? true)) {
      this.virtual = new VirtualControls();
      this.setDevice('touch');
    }
  }

  private setDevice(d: 'keyboard' | 'touch' | 'gamepad'): void {
    if (this.device === d) return;
    this.device = d;
    this.events.emit('device', d);
  }

  /** Add a filter to the pipeline. @returns a function that removes it. */
  addFilter(filter: InputFilter): () => void {
    this.filters.push(filter);
    this.filters.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    this.events.emit('filters', this.filters);
    return () => this.removeFilter(filter.id);
  }
  removeFilter(id: string): void {
    this.filters.filter((f) => f.id === id).forEach((f) => f.reset?.());
    this.filters = this.filters.filter((f) => f.id !== id);
    this.events.emit('filters', this.filters);
  }
  clearFilters(): void {
    this.filters.forEach((f) => f.reset?.());
    this.filters = [];
    this.events.emit('filters', this.filters);
  }
  getFilters(): readonly InputFilter[] {
    return this.filters;
  }

  /** Replace the touch buttons (ids map to `primary`, `secondary`, `hold`, or a custom action). */
  setVirtualButtons(buttons: VirtualButton[]): void {
    this.virtual?.setButtons(buttons);
  }

  /** Set a custom action from your own UI. */
  setCustom(name: string, value: boolean): void {
    this.custom[name] = value;
  }

  /** Inject raw actions directly (tests, replays, the screenshot tool). Pass null to stop. */
  setRaw(actions: Partial<Actions> | null): void {
    this.injected = actions;
  }

  /**
   * Ask for device tilt (iOS needs a permission prompt, so call this from a tap).
   * Off by default; resolves false when unavailable or denied.
   */
  async enableTilt(): Promise<boolean> {
    try {
      const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
      if (!D) return false;
      if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return false;
      const fn = (e: DeviceOrientationEvent) => {
        this.tilt.active = true;
        this.tilt.x = clamp((e.gamma ?? 0) / 30, -1, 1);
        this.tilt.y = clamp(-((e.beta ?? 45) - 45) / 30, -1, 1);
      };
      window.addEventListener('deviceorientation', fn);
      this.cleanup.push(() => window.removeEventListener('deviceorientation', fn));
      return true;
    } catch {
      return false;
    }
  }
  disableTilt(): void {
    this.tilt.active = false;
    this.tilt.x = this.tilt.y = 0;
  }

  /** Sample devices and run the filter pipeline. Call once per frame before reading actions. */
  update(dt: number): void {
    this.time += dt;
    this.prev = this.filtered;
    this.prevRaw = this.raw;
    const a = emptyActions();
    // keyboard
    for (const code of this.keys) {
      const m = KEYS[code];
      if (typeof m === 'string') a[m] = true;
      else if (m) {
        a.moveX += m.x ?? 0;
        a.moveY += m.y ?? 0;
      }
    }
    if (this.keys.has('Space')) a.hold = true;
    if (this.pointerDown) a.hold = true;
    // touch
    const v = this.virtual?.state;
    if (v) {
      a.moveX += v.moveX;
      a.moveY += v.moveY;
      for (const [id, down] of Object.entries(v.buttons)) {
        if (!down) continue;
        if (id === 'primary' || id === 'secondary' || id === 'hold' || id === 'confirm' || id === 'cancel') a[id] = true;
        else a.custom[id] = true;
        if (id === 'primary') a.hold = true;
      }
    }
    // gamepad
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const dz = (n: number | undefined) => (Math.abs(n ?? 0) < 0.18 ? 0 : (n ?? 0));
      const mx = dz(pad.axes[0]);
      const my = -dz(pad.axes[1]);
      if (mx || my || pad.buttons.some((b) => b.pressed)) this.setDevice('gamepad');
      a.moveX += mx;
      a.moveY += my;
      a.lookX += dz(pad.axes[2]) * dt * 2.2;
      a.lookY += dz(pad.axes[3]) * dt * 2.2;
      if (pad.buttons[0]?.pressed) a.primary = a.hold = a.confirm = true;
      if (pad.buttons[2]?.pressed || pad.buttons[1]?.pressed) a.secondary = true;
      if (pad.buttons[1]?.pressed) a.cancel = true;
      if (pad.buttons[9]?.pressed) a.confirm = true;
      if (pad.buttons[12]?.pressed) a.moveY += 1;
      if (pad.buttons[13]?.pressed) a.moveY -= 1;
      if (pad.buttons[14]?.pressed) a.moveX -= 1;
      if (pad.buttons[15]?.pressed) a.moveX += 1;
    }
    if (this.tilt.active) {
      a.moveX += this.tilt.x;
      a.moveY += this.tilt.y;
    }
    a.lookX += this.lookDelta.x;
    a.lookY += this.lookDelta.y;
    this.lookDelta.x = this.lookDelta.y = 0;
    Object.assign(a.custom, this.custom);
    if (this.injected) Object.assign(a, this.injected, { custom: { ...a.custom, ...this.injected.custom } });
    // normalize diagonal movement
    const len = Math.hypot(a.moveX, a.moveY);
    if (len > 1) {
      a.moveX /= len;
      a.moveY /= len;
    }
    this.raw = a;
    this.filtered = this.enabled ? runFilters(a, this.filters, dt, this.time) : emptyActions();
  }

  /** True on the frame a (filtered) button went down. */
  pressed(action: ButtonAction): boolean {
    return this.filtered[action] && !this.prev[action];
  }
  /** True on the frame a (filtered) button was released. */
  released(action: ButtonAction): boolean {
    return !this.filtered[action] && this.prev[action];
  }
  /** True on the frame the visitor physically pressed a button, ignoring filters. */
  rawPressed(action: ButtonAction): boolean {
    return this.raw[action] && !this.prevRaw[action];
  }
  customPressed(name: string): boolean {
    return !!this.filtered.custom[name] && !this.prev.custom[name];
  }

  /** True when the filters changed the visitor's movement noticeably this frame. */
  get betrayed(): boolean {
    return Math.hypot(this.raw.moveX - this.filtered.moveX, this.raw.moveY - this.filtered.moveY) > 0.35;
  }

  /** Arrows for the HUD: `{ pressed: '→', went: '←' }`. */
  arrows(): { pressed: string; went: string } {
    return { pressed: arrowFor(this.raw.moveX, this.raw.moveY), went: arrowFor(this.filtered.moveX, this.filtered.moveY) };
  }

  /** Snapshot both action sets (for the debug visualizer). */
  snapshot(): { raw: Actions; filtered: Actions } {
    return { raw: cloneActions(this.raw), filtered: cloneActions(this.filtered) };
  }

  dispose(): void {
    this.cleanup.forEach((fn) => fn());
    this.cleanup.length = 0;
    this.virtual?.dispose();
    this.virtual = null;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
