// The pin proof check (Requirement 12.1 to 12.4). Pure and total. It is written independently of
// `pinUse`: it never calls the rewrite, it rebuilds the expected pinned line from the pieces of the
// ORIGINAL line (head, resolved sha, tail, comment) and compares whole lines with their endings.
import { isDeepStrictEqual } from "node:util";
import { inventoryText } from "../inventory/inventory.js";
import type { ActionUse } from "../inventory/types.js";

export type PinViolation =
  | { kind: "sha"; file: string; line: number; ref: string; written: string; resolved: string }
  | { kind: "bytes"; file: string; line: number; original: string; rewritten: string }
  | { kind: "parse"; file: string; line: number; detail: string };

export type PinCheck = { ok: true; runs: number } | { ok: false; runs: number; violation: PinViolation };

export interface PinCheckInput {
  /** file -> text, before the rewrite. */
  originals: ReadonlyMap<string, string>;
  /** file -> text, after the rewrite. */
  rewritten: ReadonlyMap<string, string>;
  /** The uses that were pinned (from the original inventory). */
  pinned: readonly ActionUse[];
  /** "owner/repo@ref" -> the commit sha the ref resolved to. */
  resolved: ReadonlyMap<string, string>;
}

const LOWER_SHA = /^[0-9a-f]{40}$/;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (u: ActionUse): string => `${u.owner}/${u.repo}@${u.ref}`;

/** The lines of a text with their line endings. */
const splitLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** The pinned form of an original line: `head + sha + tail`, then ` # <ref>` after the scalar. */
function expectedLine(original: string, use: ActionUse, sha: string): string | undefined {
  const c = use.column - 1;
  const end = c + use.length;
  const refStart = end - use.ref.length;
  if (c < 0 || refStart < c || end > original.length) return undefined;
  const open = c > 0 ? original.charAt(c - 1) : "";
  const quoted = (open === '"' || open === "'") && original.charAt(end) === open;
  const scalarEnd = quoted ? end + 1 : end;
  return original.slice(0, refStart) + sha + original.slice(end, scalarEnd) + " # " + use.ref + original.slice(scalarEnd);
}

interface Candidate {
  line: number;
  column: number;
  rank: number; // sha 0, bytes 1, parse 2
  violation: PinViolation;
}

const strip = (u: ActionUse): Omit<ActionUse, "offset" | "withKeys" | "withLine"> => {
  const { offset: _o, withKeys: _k, withLine: _l, ...rest } = u;
  void _o;
  void _k;
  void _l;
  return rest;
};

function checkFile(
  file: string,
  original: string | undefined,
  rewritten: string,
  pinned: readonly ActionUse[],
  resolved: ReadonlyMap<string, string>,
): { runs: number; candidates: Candidate[] } {
  const candidates: Candidate[] = [];
  let runs = 0;
  const oLines = original === undefined ? [] : splitLines(original);
  const rLines = splitLines(rewritten);
  const pinnedAt = new Map<number, ActionUse>();
  for (const u of pinned) if (!pinnedAt.has(u.line - 1)) pinnedAt.set(u.line - 1, u);

  // sha: the written sha against the resolved one, on lines whose form is otherwise right
  for (const u of pinned) {
    runs++;
    const oLine = oLines[u.line - 1];
    const rLine = rLines[u.line - 1];
    const refStart = u.column - 1 + u.length - u.ref.length;
    const written = rLine === undefined ? "" : rLine.slice(refStart, refStart + 40);
    const formOk = oLine !== undefined && rLine !== undefined && written.length === 40 && rLine === expectedLine(oLine, u, written);
    const r = resolved.get(keyOf(u));
    if (formOk && (r === undefined || !LOWER_SHA.test(r) || r !== written)) {
      candidates.push({
        line: u.line,
        column: u.column,
        rank: 0,
        violation: { kind: "sha", file, line: u.line, ref: keyOf(u), written, resolved: r ?? "" },
      });
    }
  }

  // bytes: every line against the expected one, line endings included
  let firstBytes: number | undefined;
  const total = Math.max(oLines.length, rLines.length);
  for (let i = 0; i < total; i++) {
    runs++;
    const o = oLines[i];
    let want: string | undefined | null = o;
    const u = pinnedAt.get(i);
    if (o !== undefined && u !== undefined) {
      const r = resolved.get(keyOf(u));
      want = r !== undefined && LOWER_SHA.test(r) ? (expectedLine(o, u, r) ?? null) : null;
    }
    if (want !== rLines[i]) {
      firstBytes = i + 1;
      candidates.push({ line: i + 1, column: 1, rank: 1, violation: { kind: "bytes", file, line: i + 1, original: o ?? "", rewritten: rLines[i] ?? "" } });
      break;
    }
  }
  for (const u of pinned) {
    if (oLines[u.line - 1] === undefined && firstBytes === undefined) {
      firstBytes = u.line;
      candidates.push({ line: u.line, column: u.column, rank: 1, violation: { kind: "bytes", file, line: u.line, original: "", rewritten: rLines[u.line - 1] ?? "" } });
    }
  }

  // parse: the inventory of the rewritten text lists the same uses, only the pinned ones changed
  runs++;
  const parseDetail = parseMismatch(file, original ?? "", rewritten, pinned, resolved);
  if (parseDetail !== undefined) {
    const line = firstBytes ?? parseDetail.line;
    candidates.push({ line, column: 1, rank: 2, violation: { kind: "parse", file, line, detail: parseDetail.detail } });
  }
  return { runs, candidates };
}

function parseMismatch(
  file: string,
  original: string,
  rewritten: string,
  pinned: readonly ActionUse[],
  resolved: ReadonlyMap<string, string>,
): { line: number; detail: string } | undefined {
  const before = inventoryText(file, original);
  const after = inventoryText(file, rewritten);
  if (pinned.length > 0 && after.warnings.length > 0) return { line: pinned[0]!.line, detail: `the rewritten file does not parse: ${after.warnings[0]}` };
  if (!isDeepStrictEqual(before.warnings, after.warnings)) return { line: 1, detail: "the warnings of the inventory changed" };
  if (!isDeepStrictEqual(before.skipped, after.skipped)) return { line: 1, detail: "the skipped uses changed" };
  if (before.uses.length !== after.uses.length) {
    return { line: before.uses[0]?.line ?? 1, detail: `the inventory lists ${after.uses.length} uses, expected ${before.uses.length}` };
  }
  const pinnedKeys = new Set(pinned.map((u) => `${u.line}:${u.column}`));
  for (let i = 0; i < before.uses.length; i++) {
    const was = before.uses[i]!;
    const got = after.uses[i]!;
    let want = strip(was);
    if (pinnedKeys.has(`${was.line}:${was.column}`) && was.refKind === "mutable") {
      const r = resolved.get(keyOf(was)) ?? "";
      want = { ...want, ref: r, refKind: "sha", length: was.length - was.ref.length + 40 };
    }
    if (!isDeepStrictEqual(strip(got), want)) return { line: was.line, detail: `the use at line ${was.line} changed beyond its ref` };
  }
  return undefined;
}

/** Pure and total. `ok`, or the first violation in the order (file, line, column). */
export function checkPin(input: PinCheckInput): PinCheck {
  try {
    const pinned = input.pinned.filter((u) => u.refKind === "mutable");
    const files = new Set<string>([...input.originals.keys(), ...input.rewritten.keys(), ...pinned.map((u) => u.file)]);
    let runs = 0;
    let first: { file: string; c: Candidate } | undefined;
    for (const file of [...files].sort(cmp)) {
      const r = checkFile(
        file,
        input.originals.get(file),
        input.rewritten.get(file) ?? "",
        pinned.filter((u) => u.file === file).sort((a, b) => a.line - b.line || a.column - b.column),
        input.resolved,
      );
      runs += r.runs;
      for (const c of r.candidates) {
        if (first === undefined || cmp(file, first.file) < 0 || (file === first.file && (c.line - first.c.line || c.rank - first.c.rank || c.column - first.c.column) < 0)) {
          first = { file, c };
        }
      }
    }
    return first === undefined ? { ok: true, runs } : { ok: false, runs, violation: first.c.violation };
  } catch {
    return { ok: false, runs: 0, violation: { kind: "parse", file: "", line: 0, detail: "the check failed unexpectedly" } };
  }
}
