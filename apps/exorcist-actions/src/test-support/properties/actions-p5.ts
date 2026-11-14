import { deepStrictEqual } from "node:assert";
import fc from "fast-check";
import { inventoryText } from "../../inventory/inventory.js";
import type { ActionUse } from "../../inventory/types.js";
import { formatUses } from "../../inventory/uses.js";
import { REPLACEMENTS, findReplacement } from "../../replacements.js";
import type { ActionReplacement, Replacement, RunReplacement } from "../../replacements.js";
import { swapUse } from "../../rewrite/swap.js";
import type { SwapResult } from "../../rewrite/swap.js";
import { FILE, actionReplacementArb, oneStepFile, swapCaseArb } from "../arbitraries/replacement.js";
import type { SwapCase } from "../arbitraries/replacement.js";
import { linesOf } from "./actions-p3.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test (Property 5). */
export interface SwapImpl {
  swapUse(text: string, use: ActionUse, replacement: Replacement): SwapResult;
  findReplacement(name: string): Replacement | undefined;
}

export const realSwapImpl: SwapImpl = { swapUse, findReplacement };

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const countNl = (s: string): number => s.split("\n").length - 1;

type Expected =
  | { kind: "ok"; text: string; removedEols: number; kept: Array<[string, string]>; allDropped: boolean }
  | { kind: "refused"; reason: "unmapped_input" | "unsupported_layout"; detail?: string };

/** The reference: line-granular editing driven by the positions of the generated model. */
export function expectedSwap(c: SwapCase): Expected {
  const use = c.model.uses[0]!;
  const text = c.model.text;
  const r = c.replacement;
  for (const k of use.withKeys) if (!has(r.inputs, k.name)) return { kind: "refused", reason: "unmapped_input", detail: k.name };
  const withSpec = c.step.with;
  const dropped = use.withKeys.filter((k) => r.inputs[k.name] === null);
  if (c.step.flow || (withSpec?.flow === true && use.withKeys.length > 0)) return { kind: "refused", reason: "unsupported_layout" };
  if (dropped.some((k) => k.line === undefined)) return { kind: "refused", reason: "unsupported_layout" };

  const lines = linesOf(text);
  const startOf = (idx: number): number => lines.slice(0, idx).reduce((n, l) => n + l.length, 0);
  const lineIdxOf = (offset: number): number => countNl(text.slice(0, offset));
  const allDropped = use.withKeys.length > 0 && dropped.length === use.withKeys.length;
  const removed = new Set<number>(dropped.map((k) => lineIdxOf(k.offset)));
  if (allDropped && use.withLine) removed.add(lineIdxOf(use.withLine.start));
  const renames = new Map<number, { col: number; len: number; name: string }>();
  for (const k of use.withKeys) {
    const target = r.inputs[k.name];
    if (typeof target === "string") renames.set(lineIdxOf(k.offset), { col: k.offset - startOf(lineIdxOf(k.offset)), len: k.length, name: target });
  }
  const useIdx = use.line - 1;
  const out = lines.map((l, i) => {
    if (removed.has(i)) return "";
    if (i === useIdx) {
      const col = use.column - 1;
      const quote = l.charAt(col - 1) === '"' || l.charAt(col - 1) === "'" ? l.charAt(col - 1) : "";
      return l.slice(0, col) + `${r.to}@${r.toRef}` + quote + ` # was ${formatUses(use)}` + l.slice(col + use.length + quote.length);
    }
    const rn = renames.get(i);
    return rn ? l.slice(0, rn.col) + rn.name + l.slice(rn.col + rn.len) : l;
  });
  const removedEols = [...removed].filter((i) => lines[i]!.endsWith("\n")).length;
  const kept: Array<[string, string]> = use.withKeys
    .filter((k) => typeof r.inputs[k.name] === "string")
    .map((k) => [r.inputs[k.name] as string, use.with[k.name]!]);
  return { kind: "ok", text: out.join(""), removedEols, kept, allDropped };
}

const mutateCase = (s: string, bits: readonly boolean[]): string => [...s].map((ch, i) => (bits[i % bits.length] ? ch.toUpperCase() : ch.toLowerCase())).join("");

const runReplacementArb: fc.Arbitrary<RunReplacement> = actionReplacementArb.map((r) => ({
  from: r.from,
  kind: "run" as const,
  command: "cargo",
  sourceUrl: r.sourceUrl,
}));

export const swapProperties: NamedProperty<SwapImpl>[] = [
  {
    name: "P5 swapUse renames, drops and replaces exactly as the Input_Mapping says",
    build: (impl) =>
      fc.property(swapCaseArb, (c) => {
        const use = c.model.uses[0]!;
        const want = expectedSwap(c);
        const got = impl.swapUse(c.model.text, use, c.replacement);
        if (want.kind === "refused") {
          if (got.ok || got.reason !== want.reason) throw new Error(`expected ${want.reason}, got ${JSON.stringify(got)}`);
          if (want.detail !== undefined && got.detail !== want.detail) throw new Error(`expected the key ${want.detail}, got ${JSON.stringify(got)}`);
          return;
        }
        if (!got.ok) throw new Error(`refused: ${JSON.stringify(got)}`);
        if (got.text !== want.text) throw new Error(`text differs.\nexpected ${JSON.stringify(want.text)}\ngot      ${JSON.stringify(got.text)}`);
        if (countNl(got.text) !== countNl(c.model.text) - want.removedEols) throw new Error("the line count changed by more than the removed lines");
        // the inventory of the result: the new action, the mapped inputs in source order, values unchanged
        const inv = inventoryText(FILE, got.text);
        deepStrictEqual(inv.warnings, []);
        deepStrictEqual(inv.skipped, []);
        if (inv.uses.length !== 1) throw new Error(`expected one use, got ${inv.uses.length}`);
        const now = inv.uses[0]!;
        const [toOwner, toRepo] = c.replacement.to.split("/");
        if (now.owner !== toOwner || now.repo !== toRepo || now.ref !== c.replacement.toRef || now.path !== undefined) throw new Error("the Uses_String is not <to>@<toRef>");
        deepStrictEqual(Object.entries(now.with), want.kept);
        const hasWithLine = linesOf(got.text).some((l) => /^\s*with:/.test(l));
        if (want.allDropped && hasWithLine) throw new Error("an empty `with:` is left");
        if (!want.allDropped && want.kept.length > 0 && !hasWithLine) throw new Error("the `with:` line is gone");
      }),
  },
  {
    name: "P5 a key with no mapping is refused by name and nothing is written",
    build: (impl) =>
      fc.property(swapCaseArb, fc.constantFrom("zz-unmapped", "other", "Ωmega"), (c, extra) => {
        const base = c.step.with;
        if (base === undefined || base.flow) return;
        const withExtra = { flow: false, entries: [...base.entries, ...(base.entries.some((e) => e.key === extra) ? [] : [{ key: extra, value: { kind: "word" as const, text: "v" } }])] };
        const file = oneStepFile(
          { owner: "x", repo: "y", ref: "v1" },
          withExtra,
          { style: "plain", flow: false, tailComment: false, hasName: false, eol: "\n", finalEol: true, order: [0, 1, 2, 3, 4, 5, 6, 7] },
        );
        const replacement: ActionReplacement = { ...c.replacement, from: "x/y" };
        const use = file.model.uses[0]!;
        const first = use.withKeys.find((k) => !has(replacement.inputs, k.name));
        if (!first) return;
        const r = impl.swapUse(file.model.text, use, replacement);
        if (r.ok || r.reason !== "unmapped_input" || r.detail !== first.name) throw new Error(`expected unmapped_input ${first.name}, got ${JSON.stringify(r)}`);
      }),
  },
  {
    name: "P5 a run replacement, a path and another name are refused",
    build: (impl) =>
      fc.property(runReplacementArb, fc.constantFrom("sub", "a/b"), fc.boolean(), (run, path, other) => {
        const [owner, repo] = run.from.split("/") as [string, string];
        const layout = { style: "plain" as const, flow: false, tailComment: false, hasName: false, eol: "\n" as const, finalEol: true, order: [0, 1, 2, 3, 4, 5, 6, 7] };
        const plain = oneStepFile({ owner, repo, ref: "v1" }, undefined, layout);
        const kind = impl.swapUse(plain.model.text, plain.model.uses[0]!, run);
        if (kind.ok || kind.reason !== "unsupported_replacement_kind") throw new Error(`run: got ${JSON.stringify(kind)}`);
        const action: ActionReplacement = { from: run.from, kind: "action", to: "n/n", toRef: "v1", sourceUrl: run.sourceUrl, replacementUrl: "https://github.com/n/n", inputs: {} };
        const withPath = oneStepFile({ owner, repo, path, ref: "v1" }, undefined, layout);
        const p = impl.swapUse(withPath.model.text, withPath.model.uses[0]!, action);
        if (p.ok || p.reason !== "no_replacement") throw new Error(`path: got ${JSON.stringify(p)}`);
        const renamed = oneStepFile({ owner: other ? owner : "someone-else", repo: other ? repo + "-2" : repo, ref: "v1" }, undefined, layout);
        const n = impl.swapUse(renamed.model.text, renamed.model.uses[0]!, action);
        if (n.ok || n.reason !== "no_replacement") throw new Error(`name: got ${JSON.stringify(n)}`);
      }),
  },
  {
    name: "P5 findReplacement is total and case-insensitive",
    build: (impl) =>
      fc.property(fc.constantFrom(...REPLACEMENTS), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), fc.string({ maxLength: 12 }), (entry, bits, junk) => {
        for (const variant of [entry.from, mutateCase(entry.from, bits)]) {
          if (impl.findReplacement(variant) !== entry) throw new Error(`no entry for ${variant}`);
        }
        const others = [`${entry.from}x`, ` ${entry.from}`, entry.from.slice(1), `${entry.from}/sub`, "", "__proto__", "constructor", "toString", junk];
        for (const s of others) {
          const want = REPLACEMENTS.find((r) => r.from.toLowerCase() === s.toLowerCase());
          if (impl.findReplacement(s) !== want) throw new Error(`wrong answer for ${JSON.stringify(s)}`);
        }
        if (impl.findReplacement(undefined as unknown as string) !== undefined) throw new Error("not total");
      }),
  },
];
