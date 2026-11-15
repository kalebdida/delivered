// UNDERNEATH's interface strings. Amharic translations are scheduled with milestone M6; until then
// the core falls back to English for any missing key.
import { registerStrings } from '@delivered/core';

export const en = {
  'underneath.yeshurun': 'Yeshurun.',
  'underneath.upright': 'upright one.',
  'underneath.move': 'move to walk · Space to jump',
  'underneath.lean': 'hold E to lean',
  'underneath.leanTouch': 'hold the action button to lean',
  'underneath.jump': 'jump',
  'underneath.grab': 'grab',
  'underneath.tuck': 'tuck',
  'underneath.grabHint': 'E: grab',
  'underneath.run': 'the ground is giving way',
  'underneath.altimeter': '{m} m',
  'underneath.easy': 'Easy islands (slower crumbling)',
  'underneath.named': 'He named you by grace before you lived up to it.',
  'underneath.interact': 'E: rest here',
  'underneath.hud.play': 'let go: {n} · caught: {c}',
  'underneath.letGoHint': 'E: hold on · E again: let go',
  'underneath.finish': 'finish',
  'underneath.closing': 'You were falling into His arms the whole time.',
  'underneath.read': 'Read Deuteronomy 33',
  'underneath.postcard': 'I let go {n} times. Caught {c} times.',
  'underneath.about':
    'A devotional touch: the arms of light carry a faint gold mark at each wrist. Jeshurun, “upright one,” is a name God gives to a people who often were not (Deuteronomy 32:15).',
} as const;

export function registerUnderneathStrings(): void {
  registerStrings('en', en);
}
