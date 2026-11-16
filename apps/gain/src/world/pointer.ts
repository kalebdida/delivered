// Pointer tracking on the canvas for grabbing things in 3D (the core Input exposes actions, not
// pointer positions; see CORE_REQUESTS.md #2). Mouse, pen and touch all arrive as pointer events.
import { Raycaster, Vector2, type PerspectiveCamera } from 'three';

export class Pointer {
  /** Normalised device coordinates (-1..1). */
  readonly ndc = new Vector2(-9, -9);
  /** CSS pixels. */
  readonly px = new Vector2();
  down = false;
  justDown = false;
  justUp = false;
  /** Pixels travelled since the press (to tell a tap from a drag). */
  travel = 0;
  /** True if the last press started on the canvas (not on UI). */
  onCanvas = false;
  type: string = 'mouse';
  private readonly ray = new Raycaster();
  private readonly off: (() => void)[] = [];

  constructor(private readonly el: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(t: EventTarget, name: K, fn: (e: WindowEventMap[K]) => void) => {
      t.addEventListener(name, fn as EventListener, { passive: true });
      this.off.push(() => t.removeEventListener(name, fn as EventListener));
    };
    on(el, 'pointerdown', (e) => {
      this.set(e);
      this.down = this.justDown = true;
      this.travel = 0;
      this.onCanvas = true;
      this.type = e.pointerType;
    });
    on(window, 'pointermove', (e) => {
      const x = this.px.x;
      const y = this.px.y;
      this.set(e);
      if (this.down) this.travel += Math.hypot(this.px.x - x, this.px.y - y);
      this.type = e.pointerType;
    });
    const up = () => {
      if (this.down) this.justUp = true;
      this.down = false;
    };
    on(window, 'pointerup', up);
    on(window, 'pointercancel', up);
  }

  private set(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.px.set(e.clientX - r.left, e.clientY - r.top);
    this.ndc.set((this.px.x / r.width) * 2 - 1, -(this.px.y / r.height) * 2 + 1);
  }

  raycaster(camera: PerspectiveCamera): Raycaster {
    this.ray.setFromCamera(this.ndc, camera);
    return this.ray;
  }

  /** Call once at the end of each frame. */
  endFrame(): void {
    this.justDown = this.justUp = false;
  }

  dispose(): void {
    for (const f of this.off.splice(0)) f();
  }
}
