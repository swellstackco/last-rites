import { deepStrictEqual } from "node:assert";
import fc from "fast-check";
import { inventoryText } from "../../inventory/inventory.js";
import type { ActionUse } from "../../inventory/types.js";
import { parseUses } from "../../inventory/uses.js";
import { pinAll, pinUse } from "../../rewrite/pin.js";
import type { PinResult } from "../../rewrite/pin.js";
import { fileSpecArb, renderFile, workflowArb } from "../arbitraries/workflow.js";
import type { FileModel, FileSpec } from "../arbitraries/workflow.js";
import type { NamedProperty } from "../sabotage-runner.js";

export const FILE = ".github/workflows/ci.yml";

/** The seam under test (Properties 3 and 4). */
export interface PinImpl {
  pinUse(text: string, use: ActionUse, sha: string): PinResult;
  pinAll(text: string, uses: readonly ActionUse[], shas: ReadonlyMap<string, string>): PinResult;
}

export const realPinImpl: PinImpl = { pinUse, pinAll };

// ---------------------------------------------------------------- generators

const HEX = "0123456789abcdef".split("");

/** 40 lower-case hexadecimal characters. */
export const shaArb: fc.Arbitrary<string> = fc.array(fc.constantFrom(...HEX), { minLength: 40, maxLength: 40 }).map((a) => a.join(""));

/**
 * Every action of the file is the same `actions/checkout@v1` (so a replace-everywhere rewrite is visible)
 * and no step is flow style.
 */
export const twinArb: fc.Arbitrary<FileModel & { spec: FileSpec }> = fileSpecArb.map((spec) => {
  const twin: FileSpec = {
    ...spec,
    jobs: spec.jobs.map((j) => ({
      ...j,
      ...(j.reusable ? { reusable: { ...j.reusable, use: twinUse(j.reusable.use) } } : {}),
      steps: j.steps.map((s) => (s.use ? { ...s, use: twinUse(s.use) } : s)),
    })),
  };
  return { ...renderFile(twin, FILE), spec: twin };
});

function twinUse<T extends { kind: string }>(u: T): T {
  return u.kind === "action" ? ({ ...u, parts: { owner: "actions", repo: "checkout", ref: "v1" } } as T) : u;
}

export const pinnableFileArb = fc.oneof({ weight: 3, arbitrary: workflowArb }, { weight: 1, arbitrary: twinArb });

/** A flow-style step line holds `{`; the block-style lines of the generator never do. */
export function isFlowUse(text: string, use: ActionUse): boolean {
  const start = text.lastIndexOf("\n", use.offset - 1) + 1;
  return text.slice(start, use.offset).includes("{");
}

/** The lines of a text with their terminators. */
export const linesOf = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

// ---------------------------------------------------------------- the checks of Property 3

const strip = (u: ActionUse): Omit<ActionUse, "offset" | "withKeys" | "withLine"> => {
  const { offset: _o, withKeys: _k, withLine: _l, ...rest } = u;
  void _o;
  void _k;
  void _l;
  return rest;
};

/** Throws when `result` is not the surgical pin of `use` in `text`. */
export function checkSurgicalPin(text: string, use: ActionUse, sha: string, result: PinResult, all: readonly ActionUse[]): void {
  if (!result.ok) throw new Error(`pinUse refused: ${JSON.stringify(result)}`);
  if (!result.changed) throw new Error("pinUse reported no change for a mutable use");
  const before = linesOf(text);
  const after = linesOf(result.text);
  if (before.length !== after.length) throw new Error(`line count changed: ${before.length} -> ${after.length}`);
  const idx = use.line - 1;
  for (let i = 0; i < before.length; i++) {
    if (i !== idx && before[i] !== after[i]) throw new Error(`line ${i + 1} changed (only line ${idx + 1} may)`);
  }
  const old = before[idx]!;
  const now = after[idx]!;
  const eol = old.slice(old.replace(/\r?\n$/, "").length);
  if (now.slice(now.replace(/\r?\n$/, "").length) !== eol) throw new Error("the line ending of the pinned line changed");
  const c = use.column - 1;
  const refStart = c + use.length - use.ref.length;
  const quote = old.charAt(c - 1) === '"' || old.charAt(c - 1) === "'" ? old.charAt(c - 1) : "";
  const afterScalar = c + use.length + quote.length;
  if (now.slice(0, refStart) !== old.slice(0, refStart)) throw new Error("bytes before the ref changed");
  if (now.slice(refStart, refStart + 40) !== sha) throw new Error("the ref is not the sha");
  const comment = ` # ${use.ref}`;
  const expectedAfterSha = old.slice(c + use.length, afterScalar) + comment + old.slice(afterScalar);
  if (now.slice(refStart + 40) !== expectedAfterSha) {
    throw new Error(`bytes after the ref are not [closing quote][comment][rest]: ${JSON.stringify(now.slice(refStart + 40))}`);
  }
  const reparsed = parseUses(`${use.owner}/${use.repo}${use.path !== undefined ? `/${use.path}` : ""}@${sha}`);
  if (reparsed.kind !== "action" || reparsed.owner !== use.owner || reparsed.repo !== use.repo || reparsed.path !== use.path || reparsed.ref !== sha) {
    throw new Error("the new Uses_String does not parse to the same action at the sha");
  }
  // the inventory of the new text: the same uses, only the pinned one changed
  const inv = inventoryText(FILE, result.text);
  deepStrictEqual(inv.warnings, []);
  if (inv.uses.length !== all.length) throw new Error(`inventory lists ${inv.uses.length} uses, expected ${all.length}`);
  all.forEach((u, i) => {
    const got = inv.uses[i]!;
    if (u === use) {
      deepStrictEqual(strip(got), strip({ ...u, ref: sha, refKind: "sha", length: u.length - u.ref.length + 40 }));
      if (got.offset !== u.offset) throw new Error("the pinned use moved");
    } else {
      deepStrictEqual(strip(got), strip(u));
    }
  });
}

export const pinProperties: NamedProperty<PinImpl>[] = [
  {
    name: "P3 pinUse changes one value and adds one comment, and nothing else",
    build: (impl) =>
      fc.property(pinnableFileArb, fc.nat(), shaArb, (m, n, sha) => {
        const candidates = m.uses.filter((u) => u.refKind === "mutable" && !isFlowUse(m.text, u));
        if (candidates.length === 0) return;
        const use = candidates[n % candidates.length]!;
        checkSurgicalPin(m.text, use, sha, impl.pinUse(m.text, use, sha), m.uses);
      }),
  },
  {
    name: "P3 pinUse leaves a plain, a single-quoted and a double-quoted use well-formed",
    build: (impl) =>
      fc.property(fc.constantFrom("", "'", '"'), fc.constantFrom("\n", "\r\n", ""), fc.constantFrom("", " # note", "   "), shaArb, (q, eol, tail, sha) => {
        const text = `jobs:\n  a:\n    steps:\n      - uses: ${q}x/y/z@main${q}${tail}${eol}`;
        const inv = inventoryText(FILE, text);
        const use = inv.uses[0]!;
        const r = impl.pinUse(text, use, sha);
        if (!r.ok) throw new Error(JSON.stringify(r));
        const want = `jobs:\n  a:\n    steps:\n      - uses: ${q}x/y/z@${sha}${q} # main${tail}${eol}`;
        if (r.text !== want) throw new Error(`got ${JSON.stringify(r.text)}`);
      }),
  },
];
