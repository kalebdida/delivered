/** The custom icon set: 1.5 px strokes on a 24 px grid. No emoji, no stock packs. */
const svg = (body: string) =>
  `<svg class="dl-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  sound: svg('<path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a7.8 7.8 0 0 1 0 11"/>'),
  mute: svg('<path d="M4 9.5v5h3.2L12 18.5v-13L7.2 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  share: svg('<path d="M12 15V4"/><path d="M8 7.5L12 3.5l4 4"/><path d="M6 12v7.5h12V12"/>'),
  back: svg('<path d="M20 12H5"/><path d="M10.5 6.5L5 12l5.5 5.5"/>'),
  replay: svg('<path d="M5 12a7 7 0 1 0 2.2-5.1"/><path d="M5 4.5v3.7h3.7"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  book: svg('<path d="M12 6.5c-2-1.4-4.6-1.8-7.5-1.5v13c2.9-.3 5.5.1 7.5 1.5 2-1.4 4.6-1.8 7.5-1.5V5c-2.9-.3-5.5.1-7.5 1.5z"/><path d="M12 6.5v13"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6v.2"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z"/>'),
  arrow: svg('<path d="M4 12h15"/><path d="M13.5 6.5L19 12l-5.5 5.5"/>'),
  hand: svg('<path d="M8.5 12.5V6a1.5 1.5 0 0 1 3 0v5"/><path d="M11.5 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14.5 11V7a1.5 1.5 0 0 1 3 0v7.5c0 3.3-2.4 6-5.7 6-2.4 0-3.8-1-5-3l-2.4-4.2a1.4 1.4 0 0 1 2.3-1.6l1.8 2.3"/>'),
  dot: svg('<circle cx="12" cy="12" r="4.5"/>'),
  up: svg('<path d="M12 20V5"/><path d="M6.5 10.5L12 5l5.5 5.5"/>'),
  skip: svg('<path d="M5 6l8 6-8 6V6z"/><path d="M18 6v12"/>'),
  download: svg('<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M5 19.5h14"/>'),
} as const;

export type IconName = keyof typeof icons;

/** The small gold mark: a descending ray meeting an open arc (light arriving from outside). */
export const markSvg = (size = 24): string =>
  `<svg class="dl-mark" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 2.5v11"/><path d="M5.5 13.5a6.5 6.5 0 0 0 13 0"/><circle cx="12" cy="13.5" r="0.9" fill="currentColor" stroke="none"/></svg>`;
