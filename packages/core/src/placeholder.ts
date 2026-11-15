import './styles/index.css';
import { getLanguage, onLanguageChange, t } from './i18n';
import { formatRef, passage } from './scripture';
import { prefersReducedMotion } from './safety';
import { roomPalettes, type RoomId } from './tokens';
import { button, h, nextFrame, splitLines } from './ui/dom';
import { markSvg } from './ui/icons';
import { Cursor } from './ui/cursor';
import { takeArrivalColor } from './ui/loading';

export interface PlaceholderOptions {
  room: Exclude<RoomId, 'hub'>;
  /** e.g. 'WRETCHED' */
  title: string;
  /** A registered scripture reference shown under the title. */
  ref: string;
}

/**
 * The page a room shows before its agent has built it: the room title in the DESIGN.md type
 * system over a slow, living gradient in the room's palette. Canvas 2D only, so it is tiny.
 * Replace the call in `apps/<room>/src/main.ts` with `createApp(...)` when building the room.
 */
export function mountPlaceholder(opts: PlaceholderOptions): void {
  const pal = roomPalettes[opts.room];
  document.documentElement.dataset.room = opts.room;
  document.body.classList.add('dl-stage');

  // Arriving through a hub portal: start from the portal's light and let the room fade in from it.
  const arrival = takeArrivalColor();
  if (arrival) {
    const veil = h('div', { 'aria-hidden': 'true', style: `position:fixed;inset:0;z-index:90;background:${arrival};transition:opacity 1600ms cubic-bezier(0.76,0,0.24,1);pointer-events:none` });
    document.body.appendChild(veil);
    setTimeout(() => (veil.style.opacity = '0'), 120);
    setTimeout(() => veil.remove(), 1900);
  }

  const canvas = h('canvas', { class: 'dl-canvas', 'aria-hidden': 'true' });
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d')!;
  let w = 0;
  let hgt = 0;
  const resize = () => {
    // The gradient is soft, so a small buffer scaled up is indistinguishable and nearly free.
    w = canvas.width = Math.max(2, Math.round(window.innerWidth / 6));
    hgt = canvas.height = Math.max(2, Math.round(window.innerHeight / 6));
  };
  resize();
  window.addEventListener('resize', resize);

  const blobs = [
    { c: pal.accent, r: 0.55, sx: 0.05, sy: 0.07, px: 0.0, py: 1.3, a: 0.34 },
    { c: pal.light, r: 0.42, sx: 0.07, sy: 0.045, px: 2.1, py: 0.4, a: 0.22 },
    { c: pal.surface, r: 0.8, sx: 0.03, sy: 0.04, px: 4.0, py: 2.6, a: 0.9 },
    { c: pal.mist, r: 0.5, sx: 0.045, sy: 0.06, px: 5.2, py: 3.9, a: 0.16 },
  ];
  const hexA = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  // Dither tile hides banding in the slow gradient.
  const noise = document.createElement('canvas');
  noise.width = noise.height = 96;
  const ng = noise.getContext('2d')!;
  const img = ng.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 16;
  }
  ng.putImageData(img, 0, 0);
  const grainEl = h('div', { 'aria-hidden': 'true', style: `position:fixed;inset:0;z-index:1;pointer-events:none;mix-blend-mode:overlay;opacity:.5;background:url(${noise.toDataURL()})` });
  document.body.appendChild(grainEl);

  const draw = (time: number) => {
    const s = prefersReducedMotion() ? 20 : time / 1000;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = pal.ink;
    g.fillRect(0, 0, w, hgt);
    g.globalCompositeOperation = 'screen';
    for (const b of blobs) {
      const x = (0.5 + 0.38 * Math.sin(s * b.sx + b.px)) * w;
      const y = (0.55 + 0.32 * Math.cos(s * b.sy + b.py)) * hgt;
      const r = b.r * Math.max(w, hgt) * (0.9 + 0.1 * Math.sin(s * 0.11 + b.px));
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, hexA(b.c, b.a));
      grad.addColorStop(1, hexA(b.c, 0));
      g.fillStyle = grad;
      g.fillRect(0, 0, w, hgt);
    }
    // Vignette toward ink keeps the focal point in the lower left third with the type.
    g.globalCompositeOperation = 'source-over';
    const v = g.createRadialGradient(w * 0.38, hgt * 0.6, 0, w * 0.5, hgt * 0.5, Math.max(w, hgt) * 0.85);
    v.addColorStop(0, hexA(pal.ink, 0));
    v.addColorStop(1, hexA(pal.ink, 0.86));
    g.fillStyle = v;
    g.fillRect(0, 0, w, hgt);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  const ui = h('main', {
    class: 'dl-ui',
    style: 'display:grid;align-content:end;justify-items:start;gap:1.2rem;padding-bottom:calc(var(--pad) + var(--safe-bottom) + 9vh);padding-left:calc(var(--pad) + var(--safe-left) + 4vw)',
  });
  document.body.appendChild(ui);
  const render = () => {
    const lang = getLanguage();
    const title = h('h1', { class: 'dl-display', style: 'letter-spacing:0.14em;margin-right:-0.14em;font-size:clamp(2.6rem, 1.4rem + 7.4vw, 7rem)' }, h('span', { class: 'dl-line' }, h('span', { style: '--i:2' }, opts.title)));
    const verse = h('p', { class: 'dl-verse', lang }, passage(opts.ref, lang));
    ui.replaceChildren(
      h('div', { class: 'dl-label dl-rise', style: '--i:0;display:flex;align-items:center;gap:.7rem;color:var(--accent)', html: `${markSvg(18)}<span>Delivered</span>` }),
      title,
      verse,
      h('div', { class: 'dl-ref dl-rise', style: '--i:9' }, formatRef(opts.ref, lang)),
      h('p', { class: 'dl-caption dl-rise', style: '--i:11;margin:0.6rem 0 0' }, t('core.placeholder.line')),
      (() => {
        const b = button({ label: t('core.placeholder.back'), variant: 'text', icon: 'back', href: '../' });
        b.classList.add('dl-rise');
        b.style.setProperty('--i', '13');
        return b;
      })(),
    );
    splitLines(verse, 5);
    ui.classList.remove('is-in');
    void nextFrame().then(() => ui.classList.add('is-in'));
  };
  render();
  onLanguageChange(render);
  void document.fonts?.ready.then(render);
  new Cursor();
  (globalThis as { __delivered?: Record<string, unknown> }).__delivered = { app: opts.room, chapter: 0, chapterCount: 1, keyMomentAt: 2.5, ready: true, placeholder: true };
}
