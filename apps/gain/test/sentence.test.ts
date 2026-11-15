import { describe, expect, it } from 'vitest';
import { LEDGER_IDS, Ledger, complete, sanitizeWord } from '../src/logic/sentence';

describe('the sentence engine', () => {
  it('turns every object into LOSS', () => {
    for (const id of LEDGER_IDS) expect(complete({ kind: 'object', id }).second).toBe('loss');
  });

  it('turns anything the visitor writes into LOSS, even a good word', () => {
    for (const text of ['money', 'my family', 'Christ', 'God', 'love', '', '…', 'x'.repeat(200)]) {
      expect(complete({ kind: 'object', id: 'written', text }).second).toBe('loss');
    }
  });

  it('only the beam gives GAIN, and it fills the first blank with Christ', () => {
    const c = complete({ kind: 'beam' });
    expect(c.second).toBe('gain');
    expect(c.first.kind).toBe('christ');
  });

  it('counts attempts and brings the hints at 3 and 5', () => {
    const l = new Ledger();
    const ids = ['coins', 'laurel', 'cushion', 'scroll', 'heart'] as const;
    ids.forEach((id, i) => {
      l.choose({ kind: 'object', id });
      expect(l.attempts).toBe(i + 1);
      expect(l.whisperDue).toBe(i + 1 >= 3);
      expect(l.motesDue).toBe(i + 1 >= 5);
    });
    expect(l.choose({ kind: 'beam' }).second).toBe('gain');
    expect(l.revealed).toBe(true);
    expect(l.whisperDue).toBe(false);
    expect(() => l.choose({ kind: 'object', id: 'mirror' })).toThrow();
  });

  it('gives each object only once, but the papyrus can be written on again', () => {
    const l = new Ledger();
    l.choose({ kind: 'object', id: 'mirror' });
    expect(l.used('mirror')).toBe(true);
    expect(() => l.choose({ kind: 'object', id: 'mirror' })).toThrow();
    l.choose({ kind: 'object', id: 'written', text: 'a' });
    l.choose({ kind: 'object', id: 'written', text: 'b' });
    expect(l.used('written')).toBe(false);
    expect(l.attempts).toBe(3);
  });

  it('the beam works on the very first try too', () => {
    const l = new Ledger();
    expect(l.choose({ kind: 'beam' }).second).toBe('gain');
  });

  it('keeps typed words to glyphs the 3D font has, and short', () => {
    expect(sanitizeWord('  my   work  ')).toBe('my work');
    expect(sanitizeWord('café')).toBe('café');
    expect(sanitizeWord('ἀγάπη')).toBe('ἀγάπη');
    expect(sanitizeWord('<b>money</b>')).toBe('bmoneyb');
    expect(sanitizeWord('ገንዘብ')).toBe('');
    expect(sanitizeWord('a'.repeat(60)).length).toBeLessThanOrEqual(22);
  });
});
