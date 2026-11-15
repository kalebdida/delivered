import type { AudioEngine } from '../audio';

const SELECTOR = 'a, button, [role="button"], [role="switch"], .dl-btn';

/**
 * Give every interactive element a sound (DESIGN.md 5.7): hover is a soft airy tick, click a warm
 * muted thunk. One delegated listener covers the whole page, including elements added later.
 * @returns a function that removes the listeners.
 */
export function bindUISounds(audio: AudioEngine): () => void {
  let last: Element | null = null;
  const over = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element | null)?.closest?.(SELECTOR) ?? null;
    if (el && el !== last) audio.ui.hover();
    last = el;
  };
  const click = (e: MouseEvent) => {
    if ((e.target as Element | null)?.closest?.(SELECTOR)) audio.ui.click();
  };
  document.addEventListener('pointerover', over, { passive: true });
  document.addEventListener('click', click, { passive: true });
  return () => {
    document.removeEventListener('pointerover', over);
    document.removeEventListener('click', click);
  };
}
