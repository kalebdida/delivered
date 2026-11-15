import { describe, expect, it } from 'vitest';
import { getLanguage, hasString, registerStrings, setLanguage, t } from '../src/i18n';
import { coreAm, coreEn } from '../src/i18n/strings';
import { allScripture, formatRef, getScripture, parseRef, passage, registerScripture, verse, webChapterUrl } from '../src/scripture';

describe('i18n', () => {
  it('translates, falls back to English, then to the key', () => {
    setLanguage('en');
    expect(t('core.begin')).toBe('Begin');
    registerStrings('en', { 'demo.only.en': 'Only English', 'demo.hello': 'Hello {name}' });
    setLanguage('am');
    expect(getLanguage()).toBe('am');
    expect(t('core.begin')).toBe(coreAm['core.begin']);
    expect(t('demo.only.en')).toBe('Only English');
    expect(t('missing.key')).toBe('missing.key');
    expect(t('demo.hello', { name: 'Kal' })).toBe('Hello Kal');
    expect(document.documentElement.lang).toBe('am');
    expect(localStorage.getItem('delivered:core:lang')).toBe('am');
    setLanguage('en');
  });
  it('has an Amharic string for every core key, in Ethiopic script', () => {
    for (const key of Object.keys(coreEn)) {
      expect(hasString(key, 'am'), key).toBe(true);
      if (key !== 'core.home') expect(coreAm[key as keyof typeof coreAm], key).toMatch(/[ሀ-፿]/);
    }
  });
});

describe('scripture registry', () => {
  it('ships every verse in both languages, English as WEB only', () => {
    const all = allScripture();
    const en = all.filter((e) => e.lang === 'en');
    const am = all.filter((e) => e.lang === 'am');
    expect(en.length).toBe(30);
    expect(am.length).toBe(en.length);
    expect(en.every((e) => e.translation === 'WEB' && e.verified)).toBe(true);
    expect(am.every((e) => /[ሀ-፿]/.test(e.text))).toBe(true);
    for (const e of en) expect(getScripture(e.ref, 'am')?.lang, e.ref).toBe('am');
  });
  it('returns the exact WEB wording the rooms quote', () => {
    expect(verse('Philippians 1:21', 'en')).toBe('For to me to live is Christ, and to die is gain.');
    expect(verse('Romans 7:19', 'en')).toBe('For the good which I desire, I don’t do; but the evil which I don’t desire, that I practice.');
    expect(verse('Psalm 90:1', 'en')).toBe('Lord, you have been our dwelling place for all generations.');
    expect(passage('Romans 7:24-25', 'en')).toBe(
      'What a wretched man I am! Who will deliver me out of the body of this death? I thank God through Jesus Christ, our Lord! So then with the mind, I myself serve God’s law, but with the flesh, sin’s law.',
    );
    expect(verse('Deuteronomy 33:27', 'en')).toContain('Underneath are the everlasting arms.');
  });
  it('parses and formats references and rejects unknown ones', () => {
    expect(parseRef('Romans 7:24-25')).toEqual({ book: 'Romans', chapter: 7, from: 24, to: 25 });
    expect(formatRef('Romans 8:1', 'am')).toBe('ሮሜ 8፥1');
    expect(formatRef('Romans 7:24-25', 'en')).toBe('Romans 7:24–25');
    expect(() => verse('Romans 99:1')).toThrow();
    expect(webChapterUrl('Romans', 7)).toBe('https://ebible.org/eng-web/ROM07.htm');
  });
  it('lets a room register a partial quotation', () => {
    registerScripture([{ ref: 'Romans 7:24', lang: 'en', translation: 'WEB', text: 'Who will deliver me', partial: true, verified: true, source: 'test' }]);
    expect(passage('Romans 7:24', 'en')).toBe('Who will deliver me');
  });
});
