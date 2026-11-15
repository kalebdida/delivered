// Partial quotations WRETCHED shows on screen. Plain data, no imports: `pnpm verify:scripture`
// reads this file and checks every entry word for word against the World English Bible.
const source = 'https://ebible.org/Scriptures/eng-web_usfm.zip';

export const scripture = [
  { ref: 'Romans 7:24', lang: 'en', translation: 'WEB', text: 'What a wretched man I am!', partial: true, verified: true, source },
  { ref: 'Romans 7:24', lang: 'en', translation: 'WEB', text: 'Who will deliver me out of the body of this death?', partial: true, verified: true, source },
  { ref: 'Romans 7:25', lang: 'en', translation: 'WEB', text: 'I thank God through Jesus Christ, our Lord!', partial: true, verified: true, source },
  { ref: 'Romans 7:25', lang: 'en', translation: 'WEB', text: 'So then with the mind, I myself serve God’s law, but with the flesh, sin’s law.', partial: true, verified: true, source },
] as const;

/** Look up a partial by its exact text start (so the UI never types scripture itself). */
export function partial(ref: string, index = 0): string {
  return scripture.filter((e) => e.ref === ref)[index]!.text;
}

