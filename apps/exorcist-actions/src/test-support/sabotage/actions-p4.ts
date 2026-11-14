import type { ActionUse } from "../../inventory/types.js";
import { pinAll, pinUse, refuse, scalarEndOf } from "../../rewrite/pin.js";
import type { PinResult } from "../../rewrite/pin.js";
import type { PinImpl } from "../properties/actions-p3.js";
import type { Sabotage } from "../sabotage-runner.js";

const real: PinImpl = { pinUse, pinAll };

/** (a) re-pin a pinned use: a second comment is added. */
function rePin(text: string, use: ActionUse, sha: string): PinResult {
  const r = pinUse(text, use, sha);
  if (!r.ok || r.changed) return r;
  const end = scalarEndOf(text, use);
  return { ok: true, changed: true, text: text.slice(0, end) + ` # ${use.ref}` + text.slice(end) };
}

/** (b) pin a flow-style step anyway: the comment lands inside the flow mapping. */
function pinFlow(text: string, use: ActionUse, sha: string): PinResult {
  const r = pinUse(text, use, sha);
  if (r.ok || r.reason !== "unsupported_layout") return r;
  const end = scalarEndOf(text, use);
  const at = use.offset + use.length - use.ref.length;
  return { ok: true, changed: true, text: text.slice(0, at) + sha + text.slice(use.offset + use.length, end) + ` # ${use.ref}` + text.slice(end) };
}

/** (c) pinAll from the first offset to the last: every edit after the first lands in the wrong place. */
function pinAllAscending(text: string, uses: readonly ActionUse[], shas: ReadonlyMap<string, string>): PinResult {
  let cur = text;
  for (const u of [...uses].sort((a, b) => a.offset - b.offset)) {
    if (u.refKind === "sha") continue;
    const r = pinUse(cur, u, shas.get(`${u.owner}/${u.repo}@${u.ref}`) ?? "");
    if (!r.ok) return r;
    cur = r.text;
  }
  return { ok: true, text: cur, changed: cur !== text };
}

/** (d) accept an upper-case sha. */
function acceptUpper(text: string, use: ActionUse, sha: string): PinResult {
  return pinUse(text, use, /^[0-9A-Fa-f]{40}$/.test(sha) ? sha.toLowerCase() : sha);
}

/** (e) report a change for a no-op. */
function changedForNoop(text: string, use: ActionUse, sha: string): PinResult {
  const r = pinUse(text, use, sha);
  return r.ok && !r.changed ? { ...r, changed: true } : r;
}

/** (f) refuse a quoted use as unsupported_layout. */
function refuseQuoted(text: string, use: ActionUse, sha: string): PinResult {
  const q = text.charAt(use.offset - 1);
  return q === '"' || q === "'" ? refuse("unsupported_layout") : pinUse(text, use, sha);
}

export const sabotages: Sabotage<PinImpl>[] = [
  { name: "(a) re-pin a pinned use and add a second comment", impl: { ...real, pinUse: rePin } },
  { name: "(b) pin a flow-style step and produce broken YAML", impl: { ...real, pinUse: pinFlow } },
  { name: "(c) apply pinAll from the first offset to the last", impl: { ...real, pinAll: pinAllAscending } },
  { name: "(d) accept an upper-case sha", impl: { ...real, pinUse: acceptUpper } },
  { name: "(e) report changed: true for a no-op", impl: { ...real, pinUse: changedForNoop } },
  { name: "(f) refuse a quoted use as unsupported_layout", impl: { ...real, pinUse: refuseQuoted } },
];
