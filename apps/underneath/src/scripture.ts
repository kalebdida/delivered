// Partial quotations UNDERNEATH shows on screen. Plain data, no imports: `pnpm verify:scripture`
// reads this file and checks every entry word for word against the World English Bible.
const source = 'https://ebible.org/Scriptures/eng-web_usfm.zip';

export const scripture = [
  { ref: 'Deuteronomy 33:26', lang: 'en', translation: 'WEB', text: 'There is no one like God', partial: true, verified: true, source },
  { ref: 'Deuteronomy 33:26', lang: 'en', translation: 'WEB', text: 'who rides on the heavens for your help', partial: true, verified: true, source },
  { ref: 'Deuteronomy 33:27', lang: 'en', translation: 'WEB', text: 'The eternal God is your dwelling place.', partial: true, verified: true, source },
  { ref: 'Deuteronomy 33:27', lang: 'en', translation: 'WEB', text: 'Underneath are the everlasting arms.', partial: true, verified: true, source },
] as const;
