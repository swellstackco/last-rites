import { checkPin } from "../../proof/pin-check.js";
import type { PinCheck, PinCheckInput } from "../../proof/pin-check.js";
import type { PinCheckImpl } from "../properties/actions-p8.js";
import type { Sabotage } from "../sabotage-runner.js";

const lines = (t: string): string[] => t.match(/[^\n]*\n|[^\n]+$/g) ?? [];
const mapTexts = (m: ReadonlyMap<string, string>, f: (t: string) => string): Map<string, string> => new Map([...m].map(([k, v]) => [k, f(v)] as const));
const wrap = (f: (i: PinCheckInput) => PinCheck): PinCheckImpl => ({ checkPin: f });

/** The sha written in the rewritten text at the place of a pinned use. */
function writtenSha(i: PinCheckInput, file: string, line: number, column: number, length: number, refLen: number): string {
  const l = lines(i.rewritten.get(file) ?? "")[line - 1] ?? "";
  const at = column - 1 + length - refLen;
  return l.slice(at, at + 40);
}

/** (d) and (g): the resolution is whatever was written (a missing one included). */
function resolveToWritten(i: PinCheckInput, onlyMissing: boolean): PinCheckInput {
  const resolved = new Map(i.resolved);
  for (const u of i.pinned) {
    const k = `${u.owner}/${u.repo}@${u.ref}`;
    if (!onlyMissing || !resolved.has(k)) resolved.set(k, writtenSha(i, u.file, u.line, u.column, u.length, u.ref.length));
  }
  return { ...i, resolved };
}

/** (a) compare only the lines that hold a pinned use: every other line is taken from the original. */
const onlyPinnedLines = (i: PinCheckInput): PinCheck => {
  const rewritten = new Map<string, string>();
  for (const [file, text] of i.rewritten) {
    const orig = lines(i.originals.get(file) ?? "");
    const mine = new Set(i.pinned.filter((u) => u.file === file).map((u) => u.line - 1));
    rewritten.set(file, lines(text).map((l, n) => (mine.has(n) || orig[n] === undefined ? l : orig[n]!)).join(""));
  }
  return checkPin({ ...i, rewritten });
};

/** (b) trailing whitespace before the line ending does not count. */
const trimEnds = (t: string): string => t.replace(/[ \t]+(\r?\n|$)/g, "$1");
/** (c) line endings do not count. */
const lf = (t: string): string => t.replace(/\r\n/g, "\n");

/** (e) only what happens up to the first pinned use of a file is checked. */
const firstUseOnly = (i: PinCheckInput): PinCheck => {
  const r = checkPin(i);
  if (r.ok) return r;
  const firstLine = Math.min(...i.pinned.filter((u) => u.file === r.violation.file).map((u) => u.line));
  return r.violation.line > firstLine ? { ok: true, runs: r.runs } : r;
};

/** (f) skip the re-inventory check. */
const skipParse = (i: PinCheckInput): PinCheck => {
  const r = checkPin(i);
  return !r.ok && r.violation.kind === "parse" ? { ok: true, runs: r.runs } : r;
};

export const sabotages: Sabotage<PinCheckImpl>[] = [
  { name: "(a) compare only the lines that hold a pinned use", impl: wrap(onlyPinnedLines) },
  { name: "(b) compare lines after trimming trailing whitespace", impl: wrap((i) => checkPin({ ...i, rewritten: mapTexts(i.rewritten, trimEnds) })) },
  { name: "(c) ignore line endings", impl: wrap((i) => checkPin({ ...i, originals: mapTexts(i.originals, lf), rewritten: mapTexts(i.rewritten, lf) })) },
  { name: "(d) accept any 40-hexadecimal sha", impl: wrap((i) => checkPin(resolveToWritten(i, false))) },
  { name: "(e) check only the first pinned use of a file", impl: wrap(firstUseOnly) },
  { name: "(f) skip the re-inventory check", impl: wrap(skipParse) },
  { name: "(g) treat a missing resolution as a pass", impl: wrap((i) => checkPin(resolveToWritten(i, true))) },
];
