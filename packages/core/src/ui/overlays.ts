import { getLanguage, type Language } from '../i18n';
import { formatRef, partial, passage } from '../scripture';
import { announce } from '../safety';
import { getUIRoot, h, nextFrame, splitLines, wait } from './dom';

export interface ScriptureOptions {
  /** A registered reference ('Romans 7:24' or a range). The text comes from the registry. */
  ref: string;
  /** Override the text (must still be a registered quotation; see `registerScripture`). */
  text?: string;
  /** Show the `n`th partial quotation registered under `ref` instead of the full text. */
  partial?: number;
  /** Original-language line shown above the verse. */
  original?: { text: string; lang: 'grc' | 'he' };
  /** Where it sits: 'center' (default), 'lower', 'upper'. */
  position?: 'center' | 'lower' | 'upper';
  /** Centered text instead of the default left edge. */
  align?: 'left' | 'center';
  /** Extra large (for the single most important line of a room). */
  huge?: boolean;
  /** Hide the reference line. */
  hideRef?: boolean;
  /** Auto-hide after this many seconds (omit to keep until `hide()`). */
  duration?: number;
  lang?: Language;
}

/**
 * Typeset scripture with a line-mask reveal. Text is selectable and announced to screen readers.
 * During gameplay keep it to two lines (CONVENTIONS.md).
 *
 * ```ts
 * const s = new ScriptureOverlay();
 * await s.show({ ref: 'Romans 7:24', duration: 6 });
 * ```
 */
export class ScriptureOverlay {
  private el: HTMLElement | null = null;
  private token = 0;

  async show(opts: ScriptureOptions): Promise<void> {
    const my = ++this.token;
    await this.hide();
    if (my !== this.token) return;
    const lang = opts.lang ?? getLanguage();
    const text = opts.text ?? (opts.partial !== undefined ? partial(opts.ref, opts.partial, lang) : passage(opts.ref, lang));
    const el = h('div', {
      class: `dl-scripture dl-scrim dl-scripture--${opts.position ?? 'center'}${opts.align === 'center' ? ' dl-scripture--center' : ''}${opts.huge ? ' dl-scripture--huge' : ''}`,
      lang,
    });
    let i = 0;
    if (opts.original) {
      const o = h('div', { class: `dl-scripture__original ${opts.original.lang === 'he' ? 'dl-hebrew' : 'dl-greek'}`, lang: opts.original.lang }, opts.original.text);
      el.appendChild(o);
    }
    const p = h('p', { class: 'dl-verse' }, text);
    el.appendChild(p);
    const ref = opts.hideRef ? null : h('div', { class: 'dl-ref' }, formatRef(opts.ref, lang));
    if (ref) el.appendChild(ref);
    getUIRoot().appendChild(el);
    this.el = el;
    if (opts.original) i = splitLines(el.firstElementChild as HTMLElement, 0);
    i += splitLines(p, i);
    if (ref) {
      ref.classList.add('dl-rise');
      ref.style.setProperty('--i', String(i + 1));
    }
    announce(`${text} ${opts.hideRef ? '' : opts.ref}`);
    await nextFrame();
    el.classList.add('is-in');
    if (opts.duration) {
      await wait(opts.duration * 1000);
      if (my === this.token) await this.hide();
    }
  }

  async hide(): Promise<void> {
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('is-in');
    el.classList.add('is-out');
    el.style.transition = 'opacity 500ms ease';
    el.style.opacity = '0';
    await wait(520);
    el.remove();
  }

  dispose(): void {
    this.token++;
    this.el?.remove();
    this.el = null;
  }
}

export interface ChapterCardOptions {
  /** The original-language word, e.g. 'θέλω' or 'יְשֻׁרוּן'. */
  word: string;
  lang: 'grc' | 'he';
  /** Transliteration, e.g. 'thelō'. */
  translit: string;
  /** English (or translated) meaning, e.g. 'I want'. */
  english: string;
  /** Verse reference, e.g. 'Romans 7:18'. */
  ref: string;
  /** Chapter number shown as a small label (optional). */
  number?: number;
  /** Seconds on screen (default 4.5). */
  duration?: number;
}

/**
 * The card that opens every chapter: large original-language word, transliteration, meaning,
 * verse reference.
 */
export class ChapterCard {
  private el: HTMLElement | null = null;

  async show(opts: ChapterCardOptions): Promise<void> {
    this.el?.remove();
    const lang = getLanguage();
    const el = h(
      'div',
      { class: 'dl-chapter-card dl-scrim' },
      opts.number !== undefined
        ? h('div', { class: 'dl-chapter-card__num dl-label dl-rise', style: '--i:0' }, String(opts.number).padStart(2, '0'))
        : null,
      h('p', { class: `dl-chapter-card__word ${opts.lang === 'he' ? 'dl-hebrew' : 'dl-greek'}`, lang: opts.lang }, h('span', { class: 'dl-line' }, h('span', { style: '--i:1' }, opts.word))),
      h('div', { class: 'dl-chapter-card__translit dl-rise', style: '--i:4', lang: 'en' }, opts.translit),
      h('div', { class: 'dl-chapter-card__english dl-rise', style: '--i:6' }, opts.english),
      h('div', { class: 'dl-ref dl-rise', style: '--i:8' }, formatRef(opts.ref, lang)),
    );
    getUIRoot().appendChild(el);
    this.el = el;
    announce(`${opts.english}. ${opts.translit}. ${opts.ref}`);
    await nextFrame();
    el.classList.add('is-in');
    await wait((opts.duration ?? 4.5) * 1000);
    if (this.el !== el) return;
    el.style.transition = 'opacity 900ms ease';
    el.style.opacity = '0';
    await wait(900);
    el.remove();
    if (this.el === el) this.el = null;
  }

  dispose(): void {
    this.el?.remove();
    this.el = null;
  }
}

/**
 * Small fading hints: "drag", "hold", "look up".
 *
 * ```ts
 * const w = new Whisper();
 * w.show(t('core.whisper.hold'));   // stays, breathing, until hide() or the next show()
 * w.show('look up', { duration: 4 });
 * ```
 */
export class Whisper {
  private el: HTMLElement | null = null;
  private timer = 0;

  show(text: string, opts: { duration?: number; position?: 'bottom' | 'top' } = {}): void {
    this.hide();
    const el = h('div', { class: `dl-whisper${opts.position === 'top' ? ' dl-whisper--top' : ''}`, role: 'status' }, text);
    getUIRoot().appendChild(el);
    this.el = el;
    void nextFrame().then(() => el.classList.add('is-in'));
    if (opts.duration) this.timer = window.setTimeout(() => this.el === el && this.hide(), opts.duration * 1000);
  }

  hide(): void {
    clearTimeout(this.timer);
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 950);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.el?.remove();
    this.el = null;
  }
}

export type HudSlot = 'top-left' | 'top-right' | 'bottom-center';

/**
 * Three quiet HUD slots with oldstyle numerals.
 *
 * ```ts
 * hud.set('top-right', `attempts: ${n}`);
 * hud.set('bottom-center', 'you pressed → · you went ←');
 * hud.clear('bottom-center');
 * ```
 */
export class HUD {
  private root: HTMLElement;
  private slots: Record<HudSlot, HTMLElement>;

  constructor() {
    this.root = h('div', { class: 'dl-hud' });
    const make = (s: HudSlot) => h('div', { class: `dl-hud__slot dl-hud__slot--${s}`, 'aria-live': s === 'bottom-center' ? 'off' : 'polite' });
    this.slots = { 'top-left': make('top-left'), 'top-right': make('top-right'), 'bottom-center': make('bottom-center') };
    this.root.append(...Object.values(this.slots));
    getUIRoot().appendChild(this.root);
  }

  set(slot: HudSlot, content: string | Node): void {
    const el = this.slots[slot];
    if (typeof content === 'string') {
      if (el.textContent !== content) el.textContent = content;
    } else el.replaceChildren(content);
  }
  clear(slot?: HudSlot): void {
    for (const s of slot ? [slot] : (Object.keys(this.slots) as HudSlot[])) this.slots[s].textContent = '';
  }
  dispose(): void {
    this.root.remove();
  }
}
