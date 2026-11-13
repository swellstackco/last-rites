// Shared helpers for the text-mutation sabotages of Properties 4 to 8 (toe-tag-redesign).
// A sabotage is a transform of the Sheets (tokens.css text and the rest of the Stylesheet text).
import type { Sheets } from "../properties/tt4.js";

/** Replaces exactly one occurrence; throws when the text is missing or ambiguous (a stale mutation is a bug). */
export function replaceOnce(text: string, from: string, to: string): string {
  const first = text.indexOf(from);
  if (first === -1) throw new Error(`sabotage: text not found: ${JSON.stringify(from)}`);
  if (text.indexOf(from, first + 1) !== -1) throw new Error(`sabotage: text is ambiguous: ${JSON.stringify(from)}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

export interface SheetSabotage {
  name: string;
  /** The Banned_Look, requirement or rule group this mutation stands for. */
  target: string;
  mutate: (sheets: Sheets) => Sheets;
}

/** Mutate the Stylesheet text (not tokens.css). */
export const inRest = (from: string, to: string) => (s: Sheets): Sheets => ({ tokens: s.tokens, rest: replaceOnce(s.rest, from, to) });
/** Mutate tokens.css. */
export const inTokens = (from: string, to: string) => (s: Sheets): Sheets => ({ tokens: replaceOnce(s.tokens, from, to), rest: s.rest });
/** Append a top-level rule to the Stylesheet. */
export const addRest = (css: string) => (s: Sheets): Sheets => ({ tokens: s.tokens, rest: `${s.rest}\n${css}\n` });
/** Apply several mutations in order. */
export const all = (...fs: ((s: Sheets) => Sheets)[]) => (s: Sheets): Sheets => fs.reduce((acc, f) => f(acc), s);
