import '@delivered/core/styles.css';
import './strings';
import { Cursor, button, h, prefersReducedMotion, t } from '@delivered/core';

// A single lantern in the void. Canvas 2D: this page must be tiny and never fail.
document.body.classList.add('dl-stage');
const canvas = h('canvas', { class: 'dl-canvas', 'aria-hidden': 'true' });
document.body.appendChild(canvas);
const g = canvas.getContext('2d')!;
const motes = Array.from({ length: 60 }, (_, i) => ({ a: i * 2.399, r: 0.05 + ((i * 0.618) % 1) * 0.42, s: 0.2 + ((i * 0.37) % 1) * 0.8 }));

function draw(now: number): void {
  const dpr = Math.min(devicePixelRatio, 2);
  const w = (canvas.width = innerWidth * dpr);
  const hgt = (canvas.height = innerHeight * dpr);
  const time = prefersReducedMotion() ? 0 : now / 1000;
  const cx = w * 0.5;
  const cy = hgt * 0.4 + Math.sin(time * 0.6) * 6 * dpr;
  const u = Math.min(w, hgt);
  g.fillStyle = '#07070A';
  g.fillRect(0, 0, w, hgt);
  const flick = 1 + Math.sin(time * 7) * 0.02 + Math.sin(time * 17) * 0.012;
  const glow = g.createRadialGradient(cx, cy, 0, cx, cy, u * 0.62 * flick);
  glow.addColorStop(0, 'rgba(255,214,140,0.34)');
  glow.addColorStop(0.18, 'rgba(245,199,107,0.13)');
  glow.addColorStop(0.5, 'rgba(120,90,60,0.035)');
  glow.addColorStop(1, 'rgba(7,7,10,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, hgt);
  // Dust turning slowly in the lantern light.
  for (const m of motes) {
    const a = m.a + time * 0.05 * m.s;
    const x = cx + Math.cos(a) * m.r * u;
    const y = cy + Math.sin(a * 1.3) * m.r * u * 0.7;
    g.fillStyle = `rgba(255,233,176,${0.5 * (1 - m.r / 0.47) * (0.5 + 0.5 * Math.sin(time * m.s + m.a))})`;
    g.beginPath();
    g.arc(x, y, (0.6 + m.s) * dpr, 0, 6.283);
    g.fill();
  }
  // The lantern: a hanging line, a cap, a glass, a flame. 1.5px strokes like the icon set.
  const s = u * 0.045;
  g.lineWidth = 1.5 * dpr;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(247,243,234,0.5)';
  g.beginPath();
  g.moveTo(cx, 0);
  g.lineTo(cx, cy - s * 1.9);
  g.stroke();
  g.strokeStyle = '#F5C76B';
  g.beginPath();
  g.moveTo(cx - s * 0.55, cy - s * 1.25);
  g.lineTo(cx, cy - s * 1.9);
  g.lineTo(cx + s * 0.55, cy - s * 1.25);
  g.closePath();
  g.moveTo(cx - s * 0.7, cy - s * 1.25);
  g.lineTo(cx - s * 0.7, cy + s * 1.1);
  g.lineTo(cx + s * 0.7, cy + s * 1.1);
  g.lineTo(cx + s * 0.7, cy - s * 1.25);
  g.moveTo(cx - s * 0.95, cy + s * 1.1);
  g.lineTo(cx + s * 0.95, cy + s * 1.1);
  g.stroke();
  const flame = g.createRadialGradient(cx, cy + s * 0.2, 0, cx, cy + s * 0.1, s * 0.75 * flick);
  flame.addColorStop(0, '#FFF4DA');
  flame.addColorStop(0.35, '#FFE9B0');
  flame.addColorStop(1, 'rgba(245,199,107,0)');
  g.fillStyle = flame;
  g.beginPath();
  g.ellipse(cx, cy + s * 0.1, s * 0.5, s * 0.8 * flick, 0, 0, 6.283);
  g.fill();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

const home = button({ label: t('hub.404.home'), variant: 'text', icon: 'back', href: '/' });
home.classList.add('dl-rise');
home.style.setProperty('--i', '8');
const ui = h(
  'main',
  { class: 'dl-ui', style: 'display:grid;align-content:end;justify-items:center;text-align:center;gap:1rem;padding-bottom:calc(var(--pad) + var(--safe-bottom) + 14vh)' },
  h('div', { class: 'dl-label dl-rise', style: '--i:0;color:var(--accent)' }, '404'),
  h('h1', { class: 'dl-title dl-rise', style: '--i:3;font-style:italic;font-weight:400' }, t('hub.404.line')),
  home,
);
document.body.appendChild(ui);
requestAnimationFrame(() => requestAnimationFrame(() => ui.classList.add('is-in')));
new Cursor();
(globalThis as { __delivered?: unknown }).__delivered = { app: 'hub-404', chapter: 0, chapterCount: 1, keyMomentAt: 2, ready: true };
