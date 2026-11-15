import type { CoreContext } from './app';

/** True when the URL has `?debug`. */
export function isDebug(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
}

export interface DebugTools {
  /** The tweakpane instance; add your own bindings: `debug.pane.addBinding(obj, 'key')`. */
  pane: import('tweakpane').Pane;
  update(): void;
  dispose(): void;
}

/**
 * Debug tools, loaded only with `?debug` (the libraries are code-split and never ship to
 * visitors): tweakpane with PostFX and quality controls, stats-gl, a chapter jumper, the physics
 * collider view, and the input-filter visualizer (raw vs filtered stick).
 */
export async function createDebug(ctx: CoreContext): Promise<DebugTools> {
  const [{ Pane }, { default: Stats }] = await Promise.all([import('tweakpane'), import('stats-gl')]);
  const pane = new Pane({ title: 'DELIVERED debug', expanded: false });
  (pane.element.parentElement as HTMLElement).style.zIndex = '400';
  (pane.element.parentElement as HTMLElement).style.top = '64px';

  const stats = new Stats({ trackGPU: false, logsPerSecond: 4, graphsPerSecond: 30, samplesLog: 40, samplesGraph: 10, precision: 2, horizontal: true, minimal: false, mode: 0 });
  stats.dom.style.cssText = 'position:fixed;left:8px;top:64px;z-index:400;opacity:.9';
  document.body.appendChild(stats.dom);
  void stats.init(ctx.engine.renderer);

  const fx = pane.addFolder({ title: 'PostFX', expanded: false });
  const p = ctx.postfx.params;
  fx.addBinding(ctx.engine, 'exposure', { min: 0.2, max: 3 });
  fx.addBinding(p, 'bloom', { min: 0, max: 2 });
  fx.addBinding(p, 'bloomThreshold', { min: 0, max: 1.5 });
  fx.addBinding(p, 'saturation', { min: 0, max: 1.6 });
  fx.addBinding(p, 'vignette', { min: 0, max: 1 });
  fx.addBinding(p, 'grain', { min: 0, max: 0.1 });
  fx.addBinding(p, 'heat', { min: 0, max: 1 });
  fx.addBinding(p, 'glitch', { min: 0, max: 1 });
  fx.addBinding(p, 'radialBlur', { min: 0, max: 1 });
  fx.addBinding(p, 'dof');
  fx.addBinding(p, 'focusDistance', { min: 0.5, max: 60 });

  const sys = pane.addFolder({ title: 'System', expanded: false });
  sys.addBinding(ctx.loop, 'timeScale', { min: 0, max: 2 });
  sys.addBinding(ctx.quality, 'tier', { readonly: true });
  sys.addBinding(ctx.quality, 'dpr', { readonly: true });
  const tierBtn = (tier: 'low' | 'medium' | 'high') => sys.addButton({ title: `quality: ${tier}` }).on('click', () => ctx.quality.setTier(tier, true));
  tierBtn('low');
  tierBtn('medium');
  tierBtn('high');
  const state = { physics: false };
  sys.addBinding(state, 'physics', { label: 'physics view' }).on('change', (e) => {
    const obj = ctx.physics?.debugObject();
    if (!obj) return;
    if (e.value) ctx.engine.scene.add(obj);
    obj.visible = e.value;
  });

  // Chapter jumper + input visualizer.
  const box = document.createElement('div');
  box.className = 'dl-debug';
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 92;
  canvas.style.width = '180px';
  canvas.style.height = '92px';
  const row = document.createElement('div');
  row.className = 'dl-debug__row';
  const buttons = ctx.director.chapters.map((c, i) => {
    const b = document.createElement('button');
    b.textContent = `${i} ${c.id}`;
    b.addEventListener('click', () => void ctx.director.goTo(i));
    row.appendChild(b);
    return b;
  });
  const filters = document.createElement('div');
  box.append(row, canvas, filters);
  document.body.appendChild(box);
  const g = canvas.getContext('2d')!;

  const drawStick = (cx: number, x: number, y: number, color: string, label: string) => {
    g.strokeStyle = 'rgba(247,243,234,.25)';
    g.beginPath();
    g.arc(cx, 44, 30, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx + Math.max(-1.4, Math.min(1.4, x)) * 30, 44 - Math.max(-1.4, Math.min(1.4, y)) * 30, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(247,243,234,.7)';
    g.font = '10px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(label, cx, 88);
  };

  return {
    pane,
    update() {
      stats.update();
      g.clearRect(0, 0, 180, 92);
      const { raw, filtered } = ctx.input;
      drawStick(46, raw.moveX, raw.moveY, '#F7F3EA', 'raw');
      drawStick(134, filtered.moveX, filtered.moveY, ctx.input.betrayed ? '#FF6A3D' : '#F5C76B', 'filtered');
      const list = ctx.input.getFilters().map((f) => f.id).join(' → ') || 'none';
      const text = `filters: ${list}`;
      if (filters.textContent !== text) filters.textContent = text;
      buttons.forEach((b, i) => b.setAttribute('aria-current', String(i === ctx.director.index)));
    },
    dispose() {
      pane.dispose();
      stats.dom.remove();
      box.remove();
    },
  };
}
