import { Emitter, rawGet, rawSet } from '../storage';
import { coreAm, coreEn } from './strings';

export type Language = 'en' | 'am';
export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'am', label: 'አማርኛ' },
];

const LANG_KEY = 'delivered:core:lang';
const tables: Record<Language, Record<string, string>> = { en: { ...coreEn }, am: { ...coreAm } };
const events = new Emitter<{ change: Language }>();

function initial(): Language {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;
  if (q === 'en' || q === 'am') return q;
  const saved = rawGet(LANG_KEY);
  return saved === 'am' ? 'am' : 'en';
}
let current: Language = initial();
applyLang();

function applyLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

/**
 * Register strings for a language. Keys must be namespaced: `wretched.*`, `underneath.*`,
 * `gain.*`, `hub.*` (the core owns `core.*`).
 *
 * ```ts
 * registerStrings('en', { 'gain.begin': 'Take up the pen' });
 * registerStrings('am', { 'gain.begin': 'ብዕሩን ያንሡ' });
 * ```
 */
export function registerStrings(lang: Language, strings: Record<string, string>): void {
  Object.assign(tables[lang], strings);
}

/**
 * Translate a key in the current language, falling back to English, then to the key itself.
 * `{name}` placeholders are replaced from `vars`.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = tables[current][key] ?? tables.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function hasString(key: string, lang: Language = current): boolean {
  return key in tables[lang];
}

export function getLanguage(): Language {
  return current;
}

/** Switch language (persisted). Fonts and the type scale swap through `html[lang]` in CSS. */
export function setLanguage(lang: Language): void {
  if (lang === current) return;
  current = lang;
  rawSet(LANG_KEY, lang);
  applyLang();
  events.emit('change', lang);
}

/** Re-render translated UI when the language changes. @returns unsubscribe. */
export function onLanguageChange(fn: (lang: Language) => void): () => void {
  return events.on('change', fn);
}

/** Format a number with oldstyle-friendly digits for the current language. */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(current === 'am' ? 'am-ET' : 'en-US').format(n);
}
