import type { ActionUse } from "../inventory/types.js";
import { formatUses } from "../inventory/uses.js";
import { lineOf, tailOk } from "./lines.js";

export type RefusalReason =
  | "unsupported_layout"
  | "not_mutable"
  | "invalid_sha"
  | "no_replacement"
  | "unsupported_replacement_kind"
  | "unmapped_input";

export type RewriteRefusal = { ok: false; reason: RefusalReason; detail?: string };
export type PinResult = { ok: true; text: string; changed: boolean } | RewriteRefusal;

const LOWER_SHA = /^[0-9a-f]{40}$/;

export const refuse = (reason: RefusalReason, detail?: string): RewriteRefusal =>
  detail === undefined ? { ok: false, reason } : { ok: false, reason, detail };

/** The offset just after the scalar: after the closing quote when the Uses_String is quoted. */
export function scalarEndOf(text: string, use: ActionUse): number {
  const end = use.offset + use.length;
  const open = use.offset > 0 ? text.charAt(use.offset - 1) : "";
  return (open === '"' || open === "'") && text.charAt(end) === open ? end + 1 : end;
}

/**
 * Pins one use to `sha`: the ref becomes the sha and ` # <old ref>` follows the scalar. Pure and total.
 * `not_mutable` is never returned: a use that already is a sha is a no-op (Requirement 10.3).
 */
export function pinUse(text: string, use: ActionUse, sha: string): PinResult {
  if (typeof sha !== "string" || !LOWER_SHA.test(sha)) return refuse("invalid_sha");
  if (use.refKind === "sha") return { ok: true, text, changed: false };
  if (text.slice(use.offset, use.offset + use.length) !== formatUses(use)) {
    return refuse("unsupported_layout", "the text does not hold the use at its offset");
  }
  const scalarEnd = scalarEndOf(text, use);
  if (!tailOk(text, lineOf(text, use.offset), scalarEnd)) {
    return refuse("unsupported_layout", "something other than a comment follows the value on its line");
  }
  const end = use.offset + use.length;
  return {
    ok: true,
    changed: true,
    text: text.slice(0, end - use.ref.length) + sha + text.slice(end, scalarEnd) + " # " + use.ref + text.slice(scalarEnd),
  };
}

/**
 * Pins several uses of one file, last offset first so earlier offsets stay valid. `shas` is keyed
 * `owner/repo@ref`. Returns the first refusal; a mutable use without a sha is `invalid_sha`.
 */
export function pinAll(text: string, uses: readonly ActionUse[], shas: ReadonlyMap<string, string>): PinResult {
  const ordered = [...uses].sort((a, b) => b.offset - a.offset);
  let current = text;
  let changed = false;
  for (const use of ordered) {
    if (use.refKind === "sha") continue;
    const key = `${use.owner}/${use.repo}@${use.ref}`;
    const sha = shas.get(key);
    if (sha === undefined) return refuse("invalid_sha", `no sha for ${key}`);
    const r = pinUse(current, use, sha);
    if (!r.ok) return r;
    current = r.text;
    changed = changed || r.changed;
  }
  return { ok: true, text: current, changed };
}
