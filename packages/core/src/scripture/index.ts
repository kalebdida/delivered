import { getLanguage, type Language } from '../i18n';
import { scriptureAm } from './scripture.am';
import { scriptureEn } from './scripture.en';

export interface ScriptureEntry {
  /** e.g. 'Romans 7:24'. One verse per entry; use `passage()` to join a range. */
  ref: string;
  lang: Language;
  /** 'WEB' for English (the only English translation allowed), 'AM1962' for Amharic. */
  translation: string;
  text: string;
  /** True once checked against the source (`pnpm verify:scripture` for English). */
  verified: boolean;
  source: string;
  /** The text is a contiguous quote from inside the verse rather than the whole verse. */
  partial?: boolean;
  /** Amharic only: result of the two-source cross-check. */
  crossCheck?: string;
  note?: string;
}

const AMHARIC_BOOKS: Record<string, string> = {
  Deuteronomy: 'ዘዳግም', Psalm: 'መዝሙር', Isaiah: 'ኢሳይያስ', John: 'ዮሐንስ', Romans: 'ሮሜ', Philippians: 'ፊልጵስዩስ',
};

const registry = new Map<string, ScriptureEntry>();
/** Partial quotations, kept apart so they never replace the full verse. Several may share a ref. */
const partials = new Map<string, ScriptureEntry[]>();
const key = (ref: string, lang: Language) => `${lang}|${ref}`;

/**
 * Add entries to the registry. The core ships every verse the three rooms quote; a room that
 * needs a shorter quotation registers it with `partial: true` from `apps/<room>/src/scripture.ts`
 * so `pnpm verify:scripture` can check it.
 */
export function registerScripture(entries: readonly ScriptureEntry[]): void {
  for (const e of entries) {
    const k = key(e.ref, e.lang);
    if (!e.partial) {
      registry.set(k, e);
      continue;
    }
    const list = partials.get(k) ?? [];
    if (!list.some((p) => p.text === e.text)) list.push(e);
    partials.set(k, list);
  }
}

/**
 * A registered partial quotation: the `index`th one registered under `ref` (in registration
 * order). Falls back to English when the language has none. Throws when it is missing.
 */
export function partial(ref: string, index = 0, lang: Language = getLanguage()): string {
  const e = partials.get(key(ref, lang))?.[index] ?? partials.get(key(ref, 'en'))?.[index];
  if (!e) throw new Error(`Partial scripture not registered: ${ref} #${index}`);
  return e.text;
}
registerScripture(scriptureEn as ScriptureEntry[]);
registerScripture(scriptureAm as ScriptureEntry[]);

/** One registered entry, or undefined. Falls back to English when the language has no entry. */
export function getScripture(ref: string, lang: Language = getLanguage()): ScriptureEntry | undefined {
  return registry.get(key(ref, lang)) ?? registry.get(key(ref, 'en'));
}

/** Text of a verse. Throws for unregistered references so typos never ship. */
export function verse(ref: string, lang: Language = getLanguage()): string {
  const e = getScripture(ref, lang);
  if (!e) throw new Error(`Scripture not registered: ${ref}`);
  return e.text;
}

export interface ParsedRef {
  book: string;
  chapter: number;
  from: number;
  to: number;
}
/** Parse 'Romans 7:24-25' or 'Psalm 90:1'. */
export function parseRef(ref: string): ParsedRef {
  const m = /^(.+?) (\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) throw new Error(`Bad scripture reference: ${ref}`);
  return { book: m[1]!, chapter: Number(m[2]), from: Number(m[3]), to: Number(m[4] ?? m[3]) };
}

/**
 * Join a verse range into one passage, e.g. `passage('Romans 7:24-25')`. An exact entry for the
 * whole reference wins over joining single verses. Partial quotations use `partial()`.
 */
export function passage(ref: string, lang: Language = getLanguage()): string {
  const exact = registry.get(key(ref, lang));
  if (exact) return exact.text;
  const { book, chapter, from, to } = parseRef(ref);
  const parts: string[] = [];
  for (let v = from; v <= to; v++) {
    const text = verse(`${book} ${chapter}:${v}`, lang);
    if (parts[parts.length - 1] !== text) parts.push(text);
  }
  return parts.join(' ');
}

/** Display form of a reference in a language ('Romans 8:1' → 'ሮሜ 8፥1'). */
export function formatRef(ref: string, lang: Language = getLanguage()): string {
  if (lang !== 'am') return ref.replace(/-/g, '–');
  const { book, chapter, from, to } = parseRef(ref);
  return `${AMHARIC_BOOKS[book] ?? book} ${chapter}፥${from}${to !== from ? `-${to}` : ''}`;
}

/** Every registered entry (used by the About panel and by tests). */
export function allScripture(): ScriptureEntry[] {
  return [...registry.values(), ...[...partials.values()].flat()];
}

/** Where to read a full chapter of the World English Bible, for the EndCard "Read" button. */
export function webChapterUrl(book: string, chapter: number): string {
  const codes: Record<string, string> = { Deuteronomy: 'DEU', Psalm: 'PSA', Isaiah: 'ISA', John: 'JHN', Romans: 'ROM', Philippians: 'PHP' };
  const code = codes[book] ?? book.slice(0, 3).toUpperCase();
  const pad = code === 'PSA' ? String(chapter).padStart(3, '0') : String(chapter).padStart(2, '0');
  return `https://ebible.org/eng-web/${code}${pad}.htm`;
}
