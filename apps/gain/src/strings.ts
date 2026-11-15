// GAIN's interface strings. Amharic translations are scheduled with milestone M6; until then the
// core falls back to English for any missing key.
import { registerStrings } from '@delivered/core';

export const en = {
  'gain.obj.coins': 'money',
  'gain.obj.laurel': 'fame',
  'gain.obj.cushion': 'comfort',
  'gain.obj.scroll': 'success',
  'gain.obj.heart': 'love',
  'gain.obj.mirror': 'myself',
  'gain.obj.written': 'my own word',
  'gain.obj.beam': 'the moonlight',
  'gain.loss': 'loss',
  'gain.hint.drag': 'drag something into the blank',
  'gain.hint.touch': 'tap something to place it in the blank',
  'gain.hint.keys': '← → to choose · Enter to place',
  'gain.untried': 'there is one thing you have not tried',
  'gain.write.title': 'What do you live for?',
  'gain.write.placeholder': 'one word or a few',
  'gain.write.ok': 'Write it',
  'gain.write.cancel': 'Not now',
  'gain.write.private': 'It stays on this device.',
  'gain.cursor.drag': 'drag',
  'gain.cursor.enter': 'enter',
  'gain.chains.hint': 'drag or shake the chains',
  'gain.chains.hintKeys': 'Space to shake the chains',
  'gain.chains.count': 'the whole palace guard: {n} / {total}',
  'gain.chains.city': 'and the brothers in the city, bolder to speak',
  'gain.letter.hint': 'drag the reed pen across the papyrus',
  'gain.letter.hintKeys': 'hold Space to write',
  'gain.doors.notYet': 'not yet',
  'gain.doors.hint': 'walk with WASD or the arrows',
  'gain.labor.hint': 'walk to someone and sit with them',
  'gain.labor.sit': 'E: sit with them',
  'gain.labor.sitTouch': 'sit',
  'gain.labor.on': 'go on',
  'gain.finale': 'Either door, the same Light.',
  'gain.closing': 'Everything else went in the LOSS column.',
  'gain.read': 'Read Philippians 1',
  'gain.postcard': 'Everything else went in the LOSS column.',
} as const;

export function registerGainStrings(): void {
  registerStrings('en', en);
}
