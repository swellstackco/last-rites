import type { LineRange } from "../inventory/types.js";

/**
 * The line that holds `offset`: `start` is its first character, `end` excludes the line ending and
 * `eolEnd` includes it (`\n` or `\r\n`; both equal the text length on a last line without one).
 * Pure and total: an offset outside the text is clamped.
 */
export function lineOf(text: string, offset: number): LineRange {
  const at = Math.min(Math.max(Number.isFinite(offset) ? Math.trunc(offset) : 0, 0), text.length);
  const start = text.lastIndexOf("\n", at - 1) + 1;
  const nl = text.indexOf("\n", at);
  if (nl < 0) return { start, end: text.length, eolEnd: text.length };
  const end = nl > start && text.charAt(nl - 1) === "\r" ? nl - 1 : nl;
  return { start, end, eolEnd: nl + 1 };
}

/**
 * After the scalar (which ends at `scalarEnd`), the rest of the line may only be empty, whitespace,
 * or whitespace followed by `#` and a comment (Requirement 10.4). A flow `}`, a `,` or a continuation fail.
 */
export function tailOk(text: string, line: LineRange, scalarEnd: number): boolean {
  if (scalarEnd < line.start || scalarEnd > line.end) return false;
  return /^(?:[ \t]*|[ \t]+#.*)$/.test(text.slice(scalarEnd, line.end));
}
