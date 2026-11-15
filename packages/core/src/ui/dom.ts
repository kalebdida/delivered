import { prefersReducedMotion } from '../safety';
import { icons, type IconName } from './icons';

type Child = Node | string | null | undefined | false;

/** Tiny DOM builder: `h('div', { class: 'x', 'aria-label': 'y' }, child, 'text')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

let uiRoot: HTMLElement | null = null;
/** The shared DOM layer above the canvas. Every component mounts here. */
export function getUIRoot(): HTMLElement {
  if (!uiRoot || !uiRoot.isConnected) {
    uiRoot = h('div', { class: 'dl-ui' });
    document.body.appendChild(uiRoot);
  }
  return uiRoot;
}

/** Wait for the next frame, so a freshly inserted element can transition in. */
export const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface ButtonOptions {
  label: string;
  /** 'pill' (default), 'primary' (pill with accent), 'text' (underline draws in), 'icon' (round). */
  variant?: 'pill' | 'primary' | 'text' | 'icon';
  icon?: IconName;
  href?: string;
  /** Opens `href` in a new tab. */
  external?: boolean;
  /** One-word label the custom cursor shows on hover. */
  cursor?: string;
  onClick?: (e: MouseEvent) => void;
}

/**
 * A DESIGN.md button: pill or text, hairline underline, magnetic hover, gold glow on press.
 * Hover and click sounds come from `bindUISounds`.
 */
export function button(opts: ButtonOptions): HTMLElement {
  const variant = opts.variant ?? 'pill';
  const cls = `dl-btn${variant === 'pill' ? '' : ` dl-btn--${variant}`}`;
  const content = variant === 'icon' ? '' : `<span>${escapeHtml(opts.label)}</span>`;
  const el = opts.href
    ? h('a', { class: cls, href: opts.href, target: opts.external ? '_blank' : undefined, rel: opts.external ? 'noopener noreferrer' : undefined })
    : h('button', { class: cls, type: 'button' });
  el.innerHTML = (opts.icon ? icons[opts.icon] : '') + content;
  if (variant === 'icon') el.setAttribute('aria-label', opts.label);
  if (opts.cursor) el.dataset.cursor = opts.cursor;
  if (opts.onClick) el.addEventListener('click', opts.onClick as EventListener);
  magnetic(el);
  return el;
}

/** Make an element ease a few pixels toward the pointer while hovered. */
export function magnetic(el: HTMLElement, strength = 0.22, max = 7): void {
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength;
    el.style.setProperty('--mx', `${Math.max(-max, Math.min(max, x))}px`);
    el.style.setProperty('--my', `${Math.max(-max, Math.min(max, y))}px`);
  });
  el.addEventListener('pointerleave', () => {
    el.style.setProperty('--mx', '0px');
    el.style.setProperty('--my', '0px');
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Split an element's text into real rendered lines for the line-mask reveal. The element must
 * be in the document. Each line becomes `<span class="dl-line"><span style="--i:n">…</span></span>`.
 * @returns the number of lines.
 */
export function splitLines(el: HTMLElement, startIndex = 0): number {
  const text = el.textContent ?? '';
  const words = text.split(/\s+/).filter(Boolean);
  el.textContent = '';
  const spans = words.map((w) => {
    const s = document.createElement('span');
    s.textContent = w + ' ';
    s.style.display = 'inline-block';
    s.style.whiteSpace = 'pre';
    el.appendChild(s);
    return s;
  });
  const lines: string[][] = [];
  let top = -Infinity;
  for (const s of spans) {
    if (Math.abs(s.offsetTop - top) > 2) {
      lines.push([]);
      top = s.offsetTop;
    }
    lines[lines.length - 1]!.push(s.textContent!.trim());
  }
  el.textContent = '';
  el.setAttribute('aria-label', text);
  lines.forEach((ws, i) => {
    const inner = h('span', { style: `--i:${startIndex + i}` }, ws.join(' '));
    el.appendChild(h('span', { class: 'dl-line', 'aria-hidden': 'true' }, inner));
  });
  return lines.length;
}

/** A brief message at the bottom of the screen. */
export function toast(message: string, ms = 2600): void {
  const el = h('div', { class: 'dl-toast dl-panel', role: 'status' }, message);
  document.body.appendChild(el);
  void nextFrame().then(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 500);
  }, ms);
}
