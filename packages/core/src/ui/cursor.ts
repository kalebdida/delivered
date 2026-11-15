import { prefersReducedMotion } from '../safety';
import { h } from './dom';

const INTERACTIVE = 'a, button, [role="button"], input, select, label, [data-cursor]';

/**
 * Custom desktop cursor: a small bone dot with a slower trailing ring. It grows over
 * interactive elements and shows a one-word label from `data-cursor="drag"`. Hidden on touch.
 *
 * ```ts
 * const cursor = new Cursor();
 * cursor.setLabel('drag');   // force a label (e.g. while hovering a 3D object); null clears
 * ```
 */
export class Cursor {
  private dot: HTMLElement | null = null;
  private ring: HTMLElement | null = null;
  private label: HTMLElement | null = null;
  private x = -100;
  private y = -100;
  private rx = -100;
  private ry = -100;
  private raf = 0;
  private forced: string | null = null;
  private hoverLabel: string | null = null;
  private hovering = false;
  private readonly off: (() => void)[] = [];

  constructor() {
    if (typeof matchMedia === 'undefined' || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    this.dot = h('div', { class: 'dl-cursor is-hidden', 'aria-hidden': 'true' });
    this.label = h('span', {});
    this.ring = h('div', { class: 'dl-cursor__ring is-hidden', 'aria-hidden': 'true' }, this.label);
    document.body.append(this.ring, this.dot);
    document.documentElement.classList.add('dl-has-cursor');
    const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) => {
      document.addEventListener(type, fn, { passive: true });
      this.off.push(() => document.removeEventListener(type, fn));
    };
    on('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      this.x = e.clientX;
      this.y = e.clientY;
      this.dot!.classList.remove('is-hidden');
      this.ring!.classList.remove('is-hidden');
    });
    on('pointerover', (e) => {
      const target = (e.target as Element | null)?.closest?.(INTERACTIVE) as HTMLElement | null;
      this.hovering = !!target;
      this.hoverLabel = target?.closest<HTMLElement>('[data-cursor]')?.dataset.cursor ?? null;
      this.refresh();
    });
    on('pointerleave', () => {
      this.dot!.classList.add('is-hidden');
      this.ring!.classList.add('is-hidden');
    });
    const tick = () => {
      const k = prefersReducedMotion() ? 1 : 0.16;
      this.rx += (this.x - this.rx) * k;
      this.ry += (this.y - this.ry) * k;
      this.dot!.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
      this.ring!.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Force a label regardless of what is hovered (3D interactions). Pass null to release. */
  setLabel(label: string | null): void {
    this.forced = label;
    this.refresh();
  }

  private refresh(): void {
    if (!this.ring || !this.label || !this.dot) return;
    const text = this.forced ?? this.hoverLabel;
    this.label.textContent = text ?? '';
    this.ring.classList.toggle('has-label', !!text);
    this.ring.classList.toggle('is-active', this.hovering || !!text);
    this.dot.classList.toggle('is-active', this.hovering || !!text);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.off.forEach((fn) => fn());
    this.dot?.remove();
    this.ring?.remove();
    document.documentElement.classList.remove('dl-has-cursor');
  }
}
