import { isScalar, parseDocument, visit } from "yaml";
import type { ActionUse } from "../../inventory/types.js";
import { formatUses } from "../../inventory/uses.js";
import { pinAll, pinUse, scalarEndOf } from "../../rewrite/pin.js";
import type { PinResult } from "../../rewrite/pin.js";
import type { PinImpl } from "../properties/actions-p3.js";
import type { Sabotage } from "../sabotage-runner.js";

interface Options {
  trimTrailing: boolean;
  dropQuote: boolean;
  replaceEverywhere: boolean;
  omitComment: boolean;
  crlfToLf: boolean;
  commentBefore: boolean;
  reserialize: boolean;
  upperSha: boolean;
}

const CORRECT: Options = {
  trimTrailing: false,
  dropQuote: false,
  replaceEverywhere: false,
  omitComment: false,
  crlfToLf: false,
  commentBefore: false,
  reserialize: false,
  upperSha: false,
};

/** A parameterized copy of the pin with one defect switched on at a time. */
function makePin(overrides: Partial<Options>): (text: string, use: ActionUse, sha: string) => PinResult {
  const o = { ...CORRECT, ...overrides };
  return (text, use, sha) => {
    const real = pinUse(text, use, sha);
    if (!real.ok || !real.changed) return real;
    const end = use.offset + use.length;
    const scalarEnd = scalarEndOf(text, use);
    const shaOut = o.upperSha ? sha.toUpperCase() : sha;
    const pinned = formatUses({ ...use, ref: shaOut });
    const comment = o.omitComment ? "" : ` # ${use.ref}`;
    let out: string;
    if (o.reserialize) {
      const doc = parseDocument(text);
      visit(doc, {
        Scalar(_key, node) {
          if (isScalar(node) && node.range && node.value === formatUses(use) && node.range[0] <= use.offset && use.offset < node.range[1]) {
            node.value = pinned;
            node.comment = ` ${use.ref}`;
          }
        },
      });
      out = doc.toString();
    } else if (o.replaceEverywhere) {
      out = text.split(formatUses(use)).join(pinned + comment);
    } else if (o.commentBefore) {
      out = text.slice(0, use.offset) + `# ${use.ref} ` + pinned + text.slice(end);
    } else {
      const quote = o.dropQuote ? "" : text.slice(end, scalarEnd);
      out = text.slice(0, use.offset) + pinned + quote + comment + text.slice(scalarEnd);
    }
    if (o.trimTrailing) out = out.replace(/[ \t\r]+$/gm, "");
    if (o.crlfToLf) out = out.replace(/\r\n/g, "\n");
    return { ok: true, text: out, changed: true };
  };
}

const withPin = (overrides: Partial<Options>): PinImpl => ({ pinUse: makePin(overrides), pinAll });

export const sabotages: Sabotage<PinImpl>[] = [
  { name: "(a) trim trailing whitespace on every line", impl: withPin({ trimTrailing: true }) },
  { name: "(b) drop the closing quote", impl: withPin({ dropQuote: true }) },
  { name: "(c) replace every occurrence of owner/repo@ref in the file", impl: withPin({ replaceEverywhere: true }) },
  { name: "(d) omit the comment", impl: withPin({ omitComment: true }) },
  { name: "(e) convert CRLF to LF", impl: withPin({ crlfToLf: true }) },
  { name: "(f) put the comment before the value", impl: withPin({ commentBefore: true }) },
  { name: "(g) re-serialize the document with yaml instead of editing text", impl: withPin({ reserialize: true }) },
  { name: "(h) write the sha upper-cased", impl: withPin({ upperSha: true }) },
];
