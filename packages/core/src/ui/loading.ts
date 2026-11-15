import { t } from '../i18n';
import { button, h, wait } from './dom';

export interface LoadingOptions {
  /** The room title that assembles letter by letter. */
  title: string;
  /** Background color (so it can match the hub-to-room portal light). Default ink. */
  background?: string;
  /** Minimum display time in ms so the loader never flickers (default 1200). */
  minTime?: number;
}

/**
 * The loading moment: a single gold line draws across the screen while the percentage counts in
 * oldstyle numerals and the title assembles letter by letter.
 *
 * ```ts
 * const loader = new LoadingScreen({ title: 'GAIN' });
 * loader.setProgress(0.4);
 * await loader.finish();              // or: await loader.finish({ begin: true }) to wait for a tap
 * ```
 */
export class LoadingScreen {
  readonly el: HTMLElement;
  private letters: HTMLElement[];
  private line: HTMLElement;
  private pct: HTMLElement;
  private shown = 0;
  private target = 0;
  private raf = 0;
  private start = performance.now();
  private readonly minTime: number;

  constructor(opts: LoadingOptions) {
    this.minTime = opts.minTime ?? 1200;
    this.letters = [...opts.title].map((ch) => h('span', {}, ch === ' ' ? ' ' : ch));
    this.line = h('div', { class: 'dl-loader__line' });
    this.pct = h('div', { class: 'dl-loader__pct', 'aria-hidden': 'true' }, '0');
    const title = h('h1', { class: 'dl-loader__title', 'aria-label': opts.title }, ...this.letters);
    this.el = h(
      'div',
      { class: 'dl-loader', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': t('core.loading') },
      h('div', { class: 'dl-loader__inner' }, title, h('div', { class: 'dl-loader__track' }, this.line), this.pct),
    );
    if (opts.background) this.el.style.setProperty('--loader-bg', opts.background);
    document.body.appendChild(this.el);
    const tick = () => {
      this.shown += (this.target - this.shown) * 0.12;
      if (this.target - this.shown < 0.004) this.shown = this.target;
      const p = this.shown;
      this.line.style.setProperty('--p', p.toFixed(4));
      this.pct.textContent = String(Math.round(p * 100));
      this.el.setAttribute('aria-valuenow', String(Math.round(p * 100)));
      const on = Math.ceil(p * this.letters.length);
      this.letters.forEach((l, i) => l.classList.toggle('is-on', i < on));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Report progress 0..1. It never goes backward. */
  setProgress(p: number): void {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  /**
   * Complete the bar, respect the minimum display time, then fade out.
   * With `begin: true` a Begin button appears and the promise resolves when it is pressed
   * (use this to unlock audio with a real gesture).
   */
  async finish(opts: { begin?: boolean; beginLabel?: string } = {}): Promise<void> {
    this.setProgress(1);
    const elapsed = performance.now() - this.start;
    await wait(Math.max(this.minTime - elapsed, 0) + 450);
    if (opts.begin) {
      await new Promise<void>((resolve) => {
        const b = button({ label: opts.beginLabel ?? t('core.begin'), variant: 'primary', onClick: () => resolve() });
        b.classList.add('dl-loader__begin');
        this.pct.replaceWith(b);
        requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add('is-on')));
        b.focus({ preventScroll: true });
      });
    }
    this.el.classList.add('is-done');
    await wait(950);
    this.dispose();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
