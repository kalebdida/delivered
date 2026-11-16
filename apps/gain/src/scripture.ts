// Scripture GAIN shows that is not already a full verse in the core registry. Plain data, no
// imports: `pnpm verify:scripture` reads this file and checks every entry word for word against
// the World English Bible. Partials are read back with `partial(ref, n)` in this order.
const source = 'https://ebible.org/Scriptures/eng-web_usfm.zip';

export const scripture = [
  // The sentence engine (CH1): Philippians 1:21 in pieces.
  { ref: 'Philippians 1:21', lang: 'en', translation: 'WEB', text: 'For to me to live is', partial: true, verified: true, source },
  { ref: 'Philippians 1:21', lang: 'en', translation: 'WEB', text: 'and to die is', partial: true, verified: true, source },
  { ref: 'Philippians 1:21', lang: 'en', translation: 'WEB', text: 'Christ', partial: true, verified: true, source },
  { ref: 'Philippians 1:21', lang: 'en', translation: 'WEB', text: 'gain', partial: true, verified: true, source },
  // The two doors (CH4).
  { ref: 'Philippians 1:23', lang: 'en', translation: 'WEB', text: 'to depart and be with Christ, which is far better', partial: true, verified: true, source },
  { ref: 'Philippians 1:24', lang: 'en', translation: 'WEB', text: 'to remain in the flesh is more needful for your sake', partial: true, verified: true, source },
  // The letter (CH3): its real opening words. 1:2 is not in the core registry (see CORE_REQUESTS.md).
  { ref: 'Philippians 1:1', lang: 'en', translation: 'WEB', text: 'Paul and Timothy, servants of Jesus Christ', partial: true, verified: true, source },
  { ref: 'Philippians 1:2', lang: 'en', translation: 'WEB', text: 'Grace to you and peace from God our Father and the Lord Jesus Christ.', verified: true, source },
] as const;
