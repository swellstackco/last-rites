import { deepStrictEqual } from "node:assert";
import fc from "fast-check";
import { inventoryText } from "../../inventory/inventory.js";
import type { ActionUse } from "../../inventory/types.js";
import { pinUse } from "../../rewrite/pin.js";
import { FILE, isFlowUse, linesOf, pinnableFileArb, shaArb, type PinImpl } from "./actions-p3.js";
import { fileSpecArb, renderFile } from "../arbitraries/workflow.js";
import type { FileSpec } from "../arbitraries/workflow.js";
import type { NamedProperty } from "../sabotage-runner.js";

export { realPinImpl, type PinImpl } from "./actions-p3.js";

const HEX_CHARS = "0123456789abcdef".split("");

/** Shas the contract refuses: wrong length, upper case, non-hexadecimal. */
export const badShaArb: fc.Arbitrary<string> = fc.oneof(
  fc.array(fc.constantFrom(...HEX_CHARS), { maxLength: 60 }).filter((a) => a.length !== 40).map((a) => a.join("")),
  shaArb.map((s) => s.toUpperCase().replace(/^[0-9]/, "A")),
  shaArb.map((s) => "g" + s.slice(1)),
  fc.constantFrom("", " ", "main", "v1"),
);

/** A file whose steps are never flow style. */
export const blockFileArb = fileSpecArb.map((spec): FileSpec => ({
  ...spec,
  jobs: spec.jobs.map((j) => ({ ...j, steps: j.steps.map((s) => ({ ...s, flow: false })) })),
})).map((spec) => ({ ...renderFile(spec, FILE), spec }));

/** A file with at least one flow-style mutable use: every step with a use is flow style. */
export const flowFileArb = fileSpecArb.map((spec): FileSpec => ({
  ...spec,
  jobs: spec.jobs.map((j) => ({ ...j, steps: j.steps.map((s) => ({ ...s, flow: true })) })),
})).map((spec) => ({ ...renderFile(spec, FILE), spec }));

const keyOf = (u: ActionUse): string => `${u.owner}/${u.repo}@${u.ref}`;

/** One sha per distinct `owner/repo@ref`, taken in order from `pool`. */
export function shaMap(uses: readonly ActionUse[], pool: readonly string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const u of uses) if (u.refKind === "mutable" && !m.has(keyOf(u))) m.set(keyOf(u), pool[m.size % pool.length]!);
  return m;
}

/** The reference: `pinUse` from the last offset to the first (Requirement 10.5). */
function sequential(text: string, uses: readonly ActionUse[], shas: ReadonlyMap<string, string>): string {
  let cur = text;
  for (const u of [...uses].sort((a, b) => b.offset - a.offset)) {
    if (u.refKind !== "mutable") continue;
    const r = pinUse(cur, u, shas.get(keyOf(u))!);
    if (!r.ok) throw new Error(`reference refused: ${JSON.stringify(r)}`);
    cur = r.text;
  }
  return cur;
}

const poolArb = fc.array(shaArb, { minLength: 1, maxLength: 4 });

export const pinAllProperties: NamedProperty<PinImpl>[] = [
  {
    name: "P4 pinning a pinned use is a no-op, and pinning twice equals pinning once",
    build: (impl) =>
      fc.property(pinnableFileArb, fc.nat(), shaArb, shaArb, (m, n, sha, other) => {
        for (const u of m.uses.filter((x) => x.refKind === "sha")) {
          const r = impl.pinUse(m.text, u, other);
          deepStrictEqual(r, { ok: true, text: m.text, changed: false });
        }
        const candidates = m.uses.filter((u) => u.refKind === "mutable" && !isFlowUse(m.text, u));
        if (candidates.length === 0) return;
        const use = candidates[n % candidates.length]!;
        const first = impl.pinUse(m.text, use, sha);
        if (!first.ok) throw new Error(JSON.stringify(first));
        const again = inventoryText(FILE, first.text).uses.find((x) => x.line === use.line && x.column === use.column);
        if (!again || again.refKind !== "sha") throw new Error("the pinned use is not a sha in the inventory of the result");
        deepStrictEqual(impl.pinUse(first.text, again, sha), { ok: true, text: first.text, changed: false });
        deepStrictEqual(impl.pinUse(first.text, again, other), { ok: true, text: first.text, changed: false });
      }),
  },
  {
    name: "P4 a flow-style step is refused as unsupported_layout and leaves the text alone",
    build: (impl) =>
      fc.property(flowFileArb, shaArb, (m, sha) => {
        const flow = m.uses.filter((u) => u.refKind === "mutable" && isFlowUse(m.text, u));
        for (const u of flow) {
          deepStrictEqual(impl.pinUse(m.text, u, sha).ok, false);
          const r = impl.pinUse(m.text, u, sha);
          if (r.ok || r.reason !== "unsupported_layout") throw new Error(`expected unsupported_layout, got ${JSON.stringify(r)}`);
        }
        if (flow.length > 0) {
          const shas = shaMap(flow, [sha]);
          const all = impl.pinAll(m.text, flow, shas);
          if (all.ok || all.reason !== "unsupported_layout") throw new Error(`pinAll: expected unsupported_layout, got ${JSON.stringify(all)}`);
        }
      }),
  },
  {
    name: "P4 a wrong sha is refused as invalid_sha for any use",
    build: (impl) =>
      fc.property(pinnableFileArb, fc.nat(), badShaArb, (m, n, bad) => {
        if (m.uses.length === 0) return;
        const use = m.uses[n % m.uses.length]!;
        const r = impl.pinUse(m.text, use, bad);
        if (r.ok || r.reason !== "invalid_sha") throw new Error(`expected invalid_sha for ${JSON.stringify(bad)}, got ${JSON.stringify(r)}`);
      }),
  },
  {
    name: "P4 pinAll equals pinUse from the last offset to the first and leaves no mutable use",
    build: (impl) =>
      fc.property(blockFileArb, poolArb, (m, pool) => {
        const shas = shaMap(m.uses, pool);
        const r = impl.pinAll(m.text, m.uses, shas);
        if (!r.ok) throw new Error(JSON.stringify(r));
        const want = sequential(m.text, m.uses, shas);
        if (r.text !== want) throw new Error("pinAll differs from the sequential pin");
        deepStrictEqual(r.changed, m.uses.some((u) => u.refKind === "mutable"));
        const inv = inventoryText(FILE, r.text);
        deepStrictEqual(inv.warnings, []);
        if (inv.uses.some((u) => u.refKind === "mutable")) throw new Error("a mutable use is left");
        if (inv.uses.length !== m.uses.length) throw new Error("the uses changed in number");
        if (linesOf(r.text).length !== linesOf(m.text).length) throw new Error("the line count changed");
        // a use that was already a sha keeps its text
        m.uses.forEach((u, i) => {
          if (u.refKind === "sha" && inv.uses[i]!.ref !== u.ref) throw new Error("a pinned use was rewritten");
        });
      }),
  },
  {
    name: "P4 the only refusals of pinUse are unsupported_layout and invalid_sha",
    build: (impl) =>
      fc.property(pinnableFileArb, shaArb, (m, sha) => {
        for (const u of m.uses) {
          const r = impl.pinUse(m.text, u, sha);
          if (!r.ok && r.reason !== "unsupported_layout") throw new Error(`unexpected ${r.reason}`);
          if (r.ok && r.changed !== (u.refKind === "mutable")) throw new Error("changed is wrong");
          if (r.ok && !r.changed && r.text !== m.text) throw new Error("a no-op changed the text");
        }
      }),
  },
];
