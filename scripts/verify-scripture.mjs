// pnpm verify:scripture
// Fetches the World English Bible from ebible.org and compares every English entry in the
// registry word for word. Checks the core registry and each room's apps/<room>/src/scripture.ts
// (which must be a plain data module exporting `scripture`, see CONVENTIONS.md).
// Entries with `partial: true` must be a contiguous quote from inside the verse (or verses).
// Exits 1 on any mismatch. With no network it exits 0 after listing what could not be verified.
import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { REFS, WEB_ZIP, normalize } from './scripture-refs.mjs';
import { parseUsfm, unzipFile } from './usfm.mjs';

const root = new URL('..', import.meta.url);
const sources = [['core', new URL('packages/core/src/scripture/scripture.en.ts', root)]];
for (const app of readdirSync(new URL('apps', root))) {
  const f = new URL(`apps/${app}/src/scripture.ts`, root);
  if (existsSync(f)) sources.push([app, f]);
}
const entries = [];
for (const [owner, url] of sources) {
  const mod = await import(pathToFileURL(url.pathname).href);
  for (const list of Object.values(mod)) {
    if (Array.isArray(list)) for (const e of list) if (e?.lang === 'en') entries.push({ owner, ...e });
  }
}

let zip;
try {
  const res = await fetch(WEB_ZIP);
  if (!res.ok) throw new Error(String(res.status));
  zip = Buffer.from(await res.arrayBuffer());
} catch (err) {
  console.warn(`Could not reach ebible.org (${err.message}). These entries are UNVERIFIED:`);
  for (const e of entries) console.warn(`  ${e.owner}: ${e.ref}`);
  console.warn('Mark them verified: false and list them in DECISIONS.md.');
  process.exit(0);
}

const BOOK_CODES = {
  Genesis: 'GEN', Exodus: 'EXO', Leviticus: 'LEV', Numbers: 'NUM', Deuteronomy: 'DEU', Joshua: 'JOS', Judges: 'JDG', Ruth: 'RUT',
  '1 Samuel': '1SA', '2 Samuel': '2SA', '1 Kings': '1KI', '2 Kings': '2KI', '1 Chronicles': '1CH', '2 Chronicles': '2CH',
  Ezra: 'EZR', Nehemiah: 'NEH', Esther: 'EST', Job: 'JOB', Psalm: 'PSA', Psalms: 'PSA', Proverbs: 'PRO', Ecclesiastes: 'ECC',
  'Song of Solomon': 'SNG', Isaiah: 'ISA', Jeremiah: 'JER', Lamentations: 'LAM', Ezekiel: 'EZK', Daniel: 'DAN', Hosea: 'HOS',
  Joel: 'JOL', Amos: 'AMO', Obadiah: 'OBA', Jonah: 'JON', Micah: 'MIC', Nahum: 'NAM', Habakkuk: 'HAB', Zephaniah: 'ZEP',
  Haggai: 'HAG', Zechariah: 'ZEC', Malachi: 'MAL', Matthew: 'MAT', Mark: 'MRK', Luke: 'LUK', John: 'JHN', Acts: 'ACT',
  Romans: 'ROM', '1 Corinthians': '1CO', '2 Corinthians': '2CO', Galatians: 'GAL', Ephesians: 'EPH', Philippians: 'PHP',
  Colossians: 'COL', '1 Thessalonians': '1TH', '2 Thessalonians': '2TH', '1 Timothy': '1TI', '2 Timothy': '2TI', Titus: 'TIT',
  Philemon: 'PHM', Hebrews: 'HEB', James: 'JAS', '1 Peter': '1PE', '2 Peter': '2PE', '1 John': '1JN', '2 John': '2JN',
  '3 John': '3JN', Jude: 'JUD', Revelation: 'REV',
};
void REFS;
const books = new Map();
const verses = (code) => {
  if (!books.has(code)) books.set(code, parseUsfm(unzipFile(zip, (n) => n.includes(`${code}eng-web.usfm`))));
  return books.get(code);
};

let failed = 0;
for (const e of entries) {
  const m = /^(.+?) (\d+):(\d+)(?:-(\d+))?$/.exec(e.ref);
  const code = m && BOOK_CODES[m[1]];
  if (!m || !code) {
    console.error(`FAIL ${e.owner}: cannot parse reference "${e.ref}"`);
    failed++;
    continue;
  }
  const from = Number(m[3]);
  const to = Number(m[4] ?? m[3]);
  const parts = [];
  for (let v = from; v <= to; v++) parts.push(verses(code).get(`${m[2]}:${v}`) ?? '');
  const web = normalize(parts.join(' '));
  const ours = normalize(e.text);
  const strip = (s) => s.replace(/^["']+|["']+$/g, '');
  const ok = e.partial ? web.includes(strip(ours)) : strip(web) === strip(ours);
  if (!ok || e.translation !== 'WEB') {
    failed++;
    console.error(`FAIL ${e.owner}: ${e.ref}\n  ours: ${ours}\n  WEB:  ${web}`);
  } else if (e.verified === false) {
    console.warn(`note ${e.owner}: ${e.ref} matches WEB but is marked verified: false; set it to true.`);
  }
}
console.log(`${entries.length - failed}/${entries.length} English entries match the World English Bible (ebible.org).`);
process.exit(failed ? 1 : 0);
