import type { ActionUse } from "../../inventory/types.js";
import { formatUses } from "../../inventory/uses.js";
import { REPLACEMENTS } from "../../replacements.js";
import type { Replacement } from "../../replacements.js";
import { lineOf, tailOk } from "../../rewrite/lines.js";
import { refuse, scalarEndOf } from "../../rewrite/pin.js";
import type { SwapResult } from "../../rewrite/swap.js";
import { swapUse } from "../../rewrite/swap.js";
import type { SwapImpl } from "../properties/actions-p5.js";
import type { Sabotage } from "../sabotage-runner.js";
import { findReplacement } from "../../replacements.js";

interface Options {
  dropRenamed: boolean;
  keepDropped: boolean;
  keepEmptyWith: boolean;
  renameValues: boolean;
  keepUnmapped: boolean;
  dropWithoutEol: boolean;
  swapRun: boolean;
  allowPath: boolean;
}

const CORRECT: Options = {
  dropRenamed: false,
  keepDropped: false,
  keepEmptyWith: false,
  renameValues: false,
  keepUnmapped: false,
  dropWithoutEol: false,
  swapRun: false,
  allowPath: false,
};

interface Edit {
  start: number;
  end: number;
  text: string;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** A parameterized copy of `swapUse` with one defect switched on at a time. */
function makeSwap(overrides: Partial<Options>): (text: string, use: ActionUse, replacement: Replacement) => SwapResult {
  const o = { ...CORRECT, ...overrides };
  return (text, use, replacement) => {
    if (replacement.kind !== "action" && !o.swapRun) return refuse("unsupported_replacement_kind");
    const to = replacement.kind === "action" ? replacement.to : replacement.command;
    const toRef = replacement.kind === "action" ? replacement.toRef : "v1";
    const inputs: Readonly<Record<string, string | null>> = replacement.kind === "action" ? replacement.inputs : {};
    if ((use.path !== undefined && !o.allowPath) || `${use.owner}/${use.repo}`.toLowerCase() !== replacement.from.toLowerCase()) {
      return refuse("no_replacement");
    }
    if (!o.keepUnmapped) {
      for (const k of use.withKeys) if (!has(inputs, k.name)) return refuse("unmapped_input", k.name);
    }
    const scalarEnd = scalarEndOf(text, use);
    if (!tailOk(text, lineOf(text, use.offset), scalarEnd)) return refuse("unsupported_layout");
    if (use.withKeys.length > 0 && use.withLine === undefined) return refuse("unsupported_layout");
    const edits: Edit[] = [
      { start: use.offset, end: scalarEnd, text: `${to}@${toRef}${text.slice(use.offset + use.length, scalarEnd)} # was ${formatUses(use)}` },
    ];
    let allDropped = use.withKeys.length > 0;
    for (const k of use.withKeys) {
      const target = has(inputs, k.name) ? inputs[k.name] : k.name;
      if (target === null || target === undefined) {
        if (o.keepDropped) continue;
        if (k.line === undefined) return refuse("unsupported_layout");
        edits.push({ start: k.line.start, end: o.dropWithoutEol ? k.line.end : k.line.eolEnd, text: "" });
        continue;
      }
      if (o.dropRenamed && target !== k.name && k.line) {
        edits.push({ start: k.line.start, end: k.line.eolEnd, text: "" });
        continue;
      }
      allDropped = false;
      if (o.renameValues && k.line) {
        edits.push({ start: k.offset, end: k.line.end, text: `${target}: ${target}` });
        continue;
      }
      edits.push({ start: k.offset, end: k.offset + k.length, text: target });
    }
    if (allDropped && use.withLine !== undefined && !o.keepEmptyWith && !o.keepDropped) {
      edits.push({ start: use.withLine.start, end: use.withLine.eolEnd, text: "" });
    }
    edits.sort((a, b) => b.start - a.start);
    let out = text;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    return { ok: true, text: out };
  };
}

const withSwap = (overrides: Partial<Options>): SwapImpl => ({ swapUse: makeSwap(overrides), findReplacement });

/** (i) a case-sensitive lookup. */
function caseSensitive(name: string): Replacement | undefined {
  return REPLACEMENTS.find((r) => r.from === name);
}

export const sabotages: Sabotage<SwapImpl>[] = [
  { name: "(a) drop a renamed key instead of renaming it", impl: withSwap({ dropRenamed: true }) },
  { name: "(b) rename a dropped key instead of removing it", impl: withSwap({ keepDropped: true }) },
  { name: "(c) leave an empty `with:` when every entry is dropped", impl: withSwap({ keepEmptyWith: true }) },
  { name: "(d) rename values together with keys", impl: withSwap({ renameValues: true }) },
  { name: "(e) ignore an unmapped key and keep it", impl: withSwap({ keepUnmapped: true }) },
  { name: "(f) remove a dropped line without its line ending", impl: withSwap({ dropWithoutEol: true }) },
  { name: "(g) swap a run replacement as if it were an action", impl: withSwap({ swapRun: true }) },
  { name: "(h) swap a use that has a path", impl: withSwap({ allowPath: true }) },
  { name: "(i) a case-sensitive findReplacement", impl: { swapUse, findReplacement: caseSensitive } },
];
