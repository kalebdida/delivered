import type { AudioEngine } from '../audio';
import { LANGUAGES, getLanguage, onLanguageChange, setLanguage, t } from '../i18n';
import { formatRef, passage } from '../scripture';
import { preferences, prefersReducedMotion, trapFocus, type QualityPreference } from '../safety';
import { button, getUIRoot, h, nextFrame, splitLines, wait } from './dom';
import { markSvg } from './icons';

/** Open a modal dialog panel. @returns a close function. */
export function openDialog(title: string, body: Node[], opts: { wide?: boolean; audio?: AudioEngine; onClose?: () => void } = {}): () => void {
  const close = button({ label: t('core.settings.close'), variant: 'icon', icon: 'close', onClick: () => dismiss() });
  const dialog = h(
    'div',
    { class: `dl-dialog dl-panel${opts.wide ? ' dl-dialog--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: -1 },
    h('div', { class: 'dl-dialog__head' }, h('h2', {}, title), close),
    ...body,
  );
  const backdrop = h('div', { class: 'dl-backdrop' }, dialog);
  document.body.appendChild(backdrop);
  opts.audio?.ui.open();
  let closed = false;
  const release = trapFocus(dialog, () => dismiss());
  function dismiss(): void {
    if (closed) return;
    closed = true;
    opts.audio?.ui.close();
    backdrop.classList.remove('is-in');
    release();
    opts.onClose?.();
    setTimeout(() => backdrop.remove(), 450);
  }
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && dismiss());
  void nextFrame().then(() => backdrop.classList.add('is-in'));
  return dismiss;
}

export interface SettingsExtra {
  /** Translated label. */
  label: string;
  get(): boolean;
  set(v: boolean): void;
}

/**
 * The Settings panel: volume, quality, reduce flashing, reduced motion, language.
 * Rooms can append their own switches (WRETCHED's "gentle corruption", mic mode).
 *
 * ```ts
 * const settings = new Settings(audio);
 * settings.addSwitch({ label: t('wretched.gentle'), get: () => gentle, set: (v) => (gentle = v) });
 * settings.open();
 * ```
 */
export class Settings {
  private extras: SettingsExtra[] = [];
  private close: (() => void) | null = null;

  constructor(private readonly audio?: AudioEngine) {}

  addSwitch(extra: SettingsExtra): void {
    this.extras.push(extra);
  }

  get isOpen(): boolean {
    return this.close !== null;
  }

  open(): void {
    if (this.close) return;
    const p = preferences.get();
    const field = (label: string, control: HTMLElement) => {
      const id = `dl-f-${Math.random().toString(36).slice(2, 8)}`;
      control.id = id;
      return h('div', { class: 'dl-field' }, h('label', { for: id }, label), control);
    };
    const toggle = (label: string, value: boolean, set: (v: boolean) => void) => {
      const b = h('button', { class: 'dl-switch', type: 'button', role: 'switch', 'aria-checked': String(value) });
      b.addEventListener('click', () => {
        const next = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(next));
        set(next);
      });
      return field(label, b);
    };
    const segmented = <T extends string>(label: string, options: { value: T; label: string }[], value: T, set: (v: T) => void) => {
      const wrap = h('div', { class: 'dl-seg', role: 'group', 'aria-label': label });
      for (const o of options) {
        const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value) }, o.label);
        if (o.value === 'am') b.lang = 'am';
        b.addEventListener('click', () => {
          wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          set(o.value);
        });
        wrap.appendChild(b);
      }
      return h('div', { class: 'dl-field' }, h('span', {}, label), wrap);
    };
    const vol = h('input', { class: 'dl-range', type: 'range', min: 0, max: 100, value: Math.round((p.muted ? 0 : p.volume) * 100) });
    const paint = () => vol.style.setProperty('--v', `${vol.value}%`);
    paint();
    vol.addEventListener('input', () => {
      paint();
      preferences.set({ volume: Number(vol.value) / 100, muted: Number(vol.value) === 0 });
    });
    const q = (v: QualityPreference) => ({ value: v, label: t(`core.settings.quality.${v}`) });
    const body = [
      field(t('core.settings.volume'), vol),
      segmented(t('core.settings.quality'), [q('auto'), q('low'), q('medium'), q('high')], p.quality, (v) => preferences.set({ quality: v })),
      toggle(t('core.settings.reduceFlashing'), p.reduceFlashing, (v) => preferences.set({ reduceFlashing: v })),
      toggle(t('core.settings.reducedMotion'), prefersReducedMotion(), (v) => preferences.set({ reducedMotion: v })),
      ...this.extras.map((e) => toggle(e.label, e.get(), e.set)),
      segmented(t('core.settings.language'), LANGUAGES.map((l) => ({ value: l.code, label: l.label })), getLanguage(), (v) => {
        setLanguage(v);
        // Re-open so every label re-renders in the new language.
        this.close?.();
        setTimeout(() => this.open(), 460);
      }),
    ];
    this.close = openDialog(t('core.settings.title'), body, { audio: this.audio, onClose: () => (this.close = null) });
  }

  dispose(): void {
    this.close?.();
  }
}

export interface ChromeOptions {
  audio?: AudioEngine;
  settings?: Settings;
  /** Link back to the hub (default '/'). Pass null to hide (the hub itself). */
  home?: string | null;
}

/**
 * The top bar every room shares: back to DELIVERED on the left, sound and settings on the right.
 */
export class Chrome {
  readonly el: HTMLElement;
  private off: (() => void)[] = [];

  constructor(private readonly opts: ChromeOptions = {}) {
    this.el = h('div', { class: 'dl-chrome' });
    getUIRoot().appendChild(this.el);
    this.render();
    this.off.push(onLanguageChange(() => this.render()));
    this.off.push(preferences.onChange(() => this.render()));
  }

  private render(): void {
    const left = h('div', {});
    const right = h('div', {});
    if (this.opts.home !== null) {
      const home = button({ label: t('core.end.back'), variant: 'icon', icon: 'back', href: this.opts.home ?? '/' });
      left.appendChild(home);
    }
    if (this.opts.audio) {
      const muted = preferences.get().muted;
      right.appendChild(
        button({
          label: muted ? t('core.sound.on') : t('core.sound.off'),
          variant: 'icon',
          icon: muted ? 'mute' : 'sound',
          onClick: () => preferences.set({ muted: !preferences.get().muted }),
        }),
      );
    }
    if (this.opts.settings) {
      right.appendChild(button({ label: t('core.settings.open'), variant: 'icon', icon: 'settings', onClick: () => this.opts.settings!.open() }));
    }
    this.el.replaceChildren(left, right);
  }

  /** Add a custom icon button to the right side (e.g. "skip chapter"). */
  setVisible(v: boolean): void {
    this.el.style.opacity = v ? '1' : '0';
    this.el.style.pointerEvents = v ? '' : 'none';
    this.el.style.transition = 'opacity 600ms ease';
  }

  dispose(): void {
    this.off.forEach((fn) => fn());
    this.el.remove();
  }
}

export interface EndCardOptions {
  /** Room title, e.g. 'WRETCHED'. */
  title: string;
  /** Verse shown at the top. */
  ref: string;
  /** A closing line under the verse (optional). */
  line?: string;
  onReplay: () => void;
  /** URL for "Read the chapter" (use `webChapterUrl`). */
  readUrl: string;
  /** Label for the read button (default core.end.read). */
  readLabel?: string;
  /** Called by Share; typically builds and shares a Postcard. */
  onShare?: () => void;
  /** Hub URL (default '/'). */
  home?: string;
}

/**
 * The end of a room: verse, closing line, and Replay · Back to DELIVERED · Read · Share.
 * Remember to call `markComplete(appId)` when you show it.
 */
export class EndCard {
  private el: HTMLElement | null = null;
  private release: (() => void) | null = null;

  async show(opts: EndCardOptions): Promise<void> {
    this.hide();
    const lang = getLanguage();
    const verse = h('p', { class: 'dl-verse', lang }, passage(opts.ref, lang));
    const actions = h(
      'div',
      { class: 'dl-end__actions dl-rise', style: '--i:12' },
      button({ label: t('core.end.replay'), variant: 'text', icon: 'replay', onClick: () => opts.onReplay() }),
      button({ label: t('core.end.back'), variant: 'text', icon: 'back', href: opts.home ?? '/' }),
      button({ label: opts.readLabel ?? t('core.end.read'), variant: 'text', icon: 'book', href: opts.readUrl, external: true }),
      opts.onShare ? button({ label: t('core.end.share'), variant: 'text', icon: 'share', onClick: () => opts.onShare!() }) : null,
    );
    const el = h(
      'section',
      { class: 'dl-end', 'aria-label': opts.title, tabindex: -1 },
      h('div', { class: 'dl-end__title dl-label dl-rise', style: '--i:0', html: `${markSvg(16)} ` }, opts.title),
      verse,
      h('div', { class: 'dl-ref dl-rise', style: '--i:8' }, formatRef(opts.ref, lang)),
      opts.line ? h('p', { class: 'dl-end__line dl-rise', style: '--i:10' }, opts.line) : null,
      actions,
    );
    document.body.appendChild(el);
    this.el = el;
    splitLines(verse, 2);
    await nextFrame();
    el.classList.add('is-in');
    await wait(900);
    if (this.el === el) this.release = trapFocus(el);
  }

  hide(): void {
    this.release?.();
    this.release = null;
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 1400);
  }

  dispose(): void {
    this.release?.();
    this.el?.remove();
    this.el = null;
  }
}
