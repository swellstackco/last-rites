import type { ActionUse } from "../inventory/types.js";
import { formatUses } from "../inventory/uses.js";
import type { Replacement } from "../replacements.js";
import { lineOf, tailOk } from "./lines.js";
import { refuse, scalarEndOf, type RewriteRefusal } from "./pin.js";

export type SwapResult = { ok: true; text: string } | RewriteRefusal;

interface Edit {
  start: number;
  end: number;
  text: string;
}

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/**
 * Swaps a use of a dead action for its replacement: refusals first, then one edit list applied from
 * the last offset to the first. Pure and total.
 */
export function swapUse(text: string, use: ActionUse, replacement: Replacement): SwapResult {
  if (replacement.kind !== "action") return refuse("unsupported_replacement_kind");
  if (use.path !== undefined || `${use.owner}/${use.repo}`.toLowerCase() !== replacement.from.toLowerCase()) {
    return refuse("no_replacement");
  }
  // An input without an entry in the mapping: the first one in source order.
  for (const k of use.withKeys) {
    if (!has(replacement.inputs, k.name)) return refuse("unmapped_input", k.name);
  }
  if (text.slice(use.offset, use.offset + use.length) !== formatUses(use)) {
    return refuse("unsupported_layout", "the text does not hold the use at its offset");
  }
  const scalarEnd = scalarEndOf(text, use);
  if (!tailOk(text, lineOf(text, use.offset), scalarEnd)) {
    return refuse("unsupported_layout", "something other than a comment follows the value on its line");
  }
  if (use.withKeys.length > 0 && use.withLine === undefined) {
    return refuse("unsupported_layout", "the with mapping is not in block style");
  }

  const edits: Edit[] = [
    // The value, the closing quote (if any) and the comment are one edit: the content ends where the comment goes.
    {
      start: use.offset,
      end: scalarEnd,
      text: `${replacement.to}@${replacement.toRef}${text.slice(use.offset + use.length, scalarEnd)} # was ${formatUses(use)}`,
    },
  ];
  let allDropped = use.withKeys.length > 0;
  for (const k of use.withKeys) {
    const target = replacement.inputs[k.name];
    if (target === null || target === undefined) {
      if (k.line === undefined) return refuse("unsupported_layout", `the entry ${k.name} is not a single line`);
      edits.push({ start: k.line.start, end: k.line.eolEnd, text: "" });
      continue;
    }
    allDropped = false;
    if (text.slice(k.offset, k.offset + k.length) !== k.name) {
      return refuse("unsupported_layout", `the key ${k.name} is not plain text`);
    }
    edits.push({ start: k.offset, end: k.offset + k.length, text: target });
  }
  if (allDropped && use.withLine !== undefined) {
    edits.push({ start: use.withLine.start, end: use.withLine.eolEnd, text: "" });
  }

  edits.sort((a, b) => b.start - a.start);
  let out = text;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return { ok: true, text: out };
}
