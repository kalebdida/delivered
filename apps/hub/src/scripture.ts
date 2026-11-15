// Partial quotations used by the hub. A plain data module (no imports) so that
// `pnpm verify:scripture` can read it and check every entry against ebible.org.
export const scripture = [
  {
    ref: 'Romans 7:24',
    lang: 'en',
    translation: 'WEB',
    text: 'Who will deliver me',
    partial: true,
    verified: true,
    source: 'https://ebible.org/Scriptures/eng-web_usfm.zip',
  },
];
