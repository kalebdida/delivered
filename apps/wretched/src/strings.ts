// WRETCHED's interface strings. Amharic translations are scheduled with milestone M6; until then
// the core falls back to English for any missing key.
import { registerStrings } from '@delivered/core';

export const en = {
  'wretched.hud.betray': 'you pressed {pressed} · you went {went}',
  'wretched.hud.attempts': 'attempts: {n}',
  'wretched.whisper.walk': 'walk toward the light',
  'wretched.whisper.break': 'break the chain',
  'wretched.whisper.tools': 'Space: strain · E: pick up a stone',
  'wretched.whisper.strike': 'Space: strike the chain',
  'wretched.whisper.cry': 'hold to cry out',
  'wretched.whisper.free': 'walk on',
  'wretched.fail.strain': 'it holds',
  'wretched.fail.stone': 'the stone breaks first',
  'wretched.fail.run': 'it drags you down',
  'wretched.fail.cliff': 'it climbs back',
  'wretched.fail.outrun': 'your feet will not obey',
  'wretched.closing': 'The chain is gone. The fight is not yours to win alone.',
  'wretched.postcard': 'I tried {n} times to free myself. Then I cried out.',
  'wretched.read': 'Read Romans 7',
  'wretched.gentle': 'Gentle corruption',
  'wretched.about': 'Behind the verse: some preachers link “the body of this death” to an ancient punishment in which a living person was bound to a corpse, described by Virgil in the Aeneid. Scholars debate whether Paul had it in mind; it is offered here as a possible background, not a fact.',
};

export function registerWretchedStrings(): void {
  registerStrings('en', en);
}
