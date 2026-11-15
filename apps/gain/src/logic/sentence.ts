// The sentence engine's rule, kept apart from the scene so it can be tested on its own.
//
//   "For to me to live is ____, and to die is ____."
//
// Whatever you put in the first blank yourself, death takes away: the second blank reads LOSS.
// Only stepping into the light (not an object, not a word you typed) completes it as
// "Christ ... gain". Philippians 1:21; 3:7-8.

export const LEDGER_IDS = ['coins', 'laurel', 'cushion', 'scroll', 'heart', 'mirror', 'written'] as const;
export type LedgerId = (typeof LEDGER_IDS)[number];

export type Choice = { kind: 'object'; id: LedgerId; text?: string } | { kind: 'beam' };

export interface Completion {
  /** What fills the first blank: an object's name, the visitor's own word, or Christ. */
  first: { kind: 'object'; id: LedgerId; text?: string } | { kind: 'christ' };
  /** What the second blank becomes. */
  second: 'loss' | 'gain';
}

/** The rule. Every object, and anything typed, gives LOSS. Only the beam gives GAIN. */
export function complete(choice: Choice): Completion {
  if (choice.kind === 'beam') return { first: { kind: 'christ' }, second: 'gain' };
  return { first: { kind: 'object', id: choice.id, text: choice.text }, second: 'loss' };
}

/** What a typed word may contain on screen (the 3D font has Latin and Greek; nothing is sent anywhere). */
export function sanitizeWord(raw: string, max = 22): string {
  const clean = raw
    .normalize('NFC')
    .replace(/[^\p{Script=Latin}\p{Script=Greek}0-9 '’\-.,]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** The chapter's memory of attempts, and when the gentle hints arrive. */
export class Ledger {
  readonly history: Completion[] = [];
  revealed = false;

  get attempts(): number {
    return this.history.filter((c) => c.second === 'loss').length;
  }
  /** After 3 tries: "there is one thing you have not tried." */
  get whisperDue(): boolean {
    return !this.revealed && this.attempts >= 3;
  }
  /** After 5 tries: the motes in the beam start drifting toward the visitor. */
  get motesDue(): boolean {
    return !this.revealed && this.attempts >= 5;
  }
  /** Objects already given (each one only once; the papyrus can be written on again). */
  used(id: LedgerId): boolean {
    return id !== 'written' && this.history.some((c) => c.first.kind === 'object' && c.first.id === id);
  }

  choose(choice: Choice): Completion {
    if (this.revealed) throw new Error('The sentence is already complete.');
    if (choice.kind === 'object' && this.used(choice.id)) throw new Error(`Already given: ${choice.id}`);
    const c = complete(choice);
    this.history.push(c);
    if (c.second === 'gain') this.revealed = true;
    return c;
  }
}
