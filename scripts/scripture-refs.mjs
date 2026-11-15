// The complete list of verses DELIVERED quotes (hub + all three rooms).
// English comes from the World English Bible; Amharic from the 1962 Revised Amharic Bible.
// To quote a new verse: add it here, then run `pnpm fetch:web`, `pnpm fetch:amharic` and
// `pnpm verify:scripture`.

/** [book name, USFM code, book number (1-66), references as chapter -> verses] */
export const REFS = [
  ['Deuteronomy', 'DEU', 5, { 32: [15], 33: [26, 27] }],
  ['Psalm', 'PSA', 19, { 18: [10], 90: [1] }],
  ['Isaiah', 'ISA', 23, { 44: [2] }],
  ['John', 'JHN', 43, { 10: [28] }],
  ['Romans', 'ROM', 45, { 7: [12, 15, 18, 19, 21, 22, 23, 24, 25], 8: [1, 2, 4] }],
  ['Philippians', 'PHP', 50, { 1: [12, 13, 14, 20, 21, 22, 23, 24, 25], 3: [7, 8] }],
];

export const WEB_ZIP = 'https://ebible.org/Scriptures/eng-web_usfm.zip';

/** Amharic sources, pinned to a commit. Text © 1962, 2003 United Bible Societies / Bible Society of Ethiopia. */
export const AM_PRIMARY = {
  repo: 'biniama/ethiopic-bible-data',
  commit: '3ad70e77329e7dc5bbb1ed9b5efdc8e223ae5f2f',
  files: {
    5: 'data/old-testament/05-deuteronomy.json',
    19: 'data/old-testament/19-psalms.json',
    23: 'data/old-testament/23-isaiah.json',
    43: 'data/new-testament/43-john.json',
    45: 'data/new-testament/45-romans.json',
    50: 'data/new-testament/50-philippians.json',
  },
};
export const AM_SECONDARY = {
  repo: 'magna25/amharic-bible-json',
  commit: 'e873238679d26668280f8ddf2d62046f8bbb79c4',
  files: {
    5: 'individual_books/05_ኦሪት ዘዳግም.json',
    19: 'individual_books/19_መዝሙረ ዳዊት.json',
    23: 'individual_books/23_ትንቢተ ኢሳይያስ.json',
    43: 'individual_books/43_የዮሐንስ ወንጌል.json',
    45: 'individual_books/45_ወደ ሮሜ ሰዎች.json',
    50: 'individual_books/50_ወደ ፊልጵስዩስ ሰዎች.json',
  },
};

export const rawUrl = (src, file) =>
  `https://raw.githubusercontent.com/${src.repo}/${src.commit}/${file.split('/').map(encodeURIComponent).join('/')}`;

/** Compare-friendly form: straight quotes, single spaces, no space before punctuation. */
export const normalize = (s) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?፥።፤፣])/g, '$1')
    .trim();

export const tsString = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
