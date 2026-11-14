// Generated `ActionReplacement`s (renamed, kept and dropped entries) and a `with` map that matches them,
// rendered into a one-step workflow file with its model (shapes of `workflow.ts`).
import fc from "fast-check";
import type { ActionReplacement } from "../../replacements.js";
import { renderFile } from "./workflow.js";
import type { FileModel, FileSpec, StepSpec, Style, ValueSpec, WithSpec } from "./workflow.js";

export const FILE = ".github/workflows/ci.yml";

/** Old input names (the pool is the one of the workflow generator, so the shapes are alike). */
const OLD_KEYS = ["toolchain", "target", "override", "components", "profile", "k1", "Key-2", "ünï", "a.b", "token", "default", "uses"];
/** New input names never collide with an old name, so a rename cannot produce a duplicate key. */
const NEW_KEYS = ["targets", "tc", "comps", "new-k", "Ünï2", "x_9"];
const UNMAPPED = ["zz-unmapped", "other", "Ωmega"];

const OWNERS = ["actions-rs", "actions", "old-org", "Some-Org"];
const REPOS = ["toolchain", "create-release", "cargo", "dead.x"];
const TO = ["dtolnay/rust-toolchain", "softprops/action-gh-release", "new-org/new_repo"];
const TO_REFS = ["stable", "v2", "master", "v1.2.3"];

const valueArb: fc.Arbitrary<ValueSpec> = fc.oneof(
  fc.constantFrom("stable", "nightly", "x86_64-unknown-linux-gnu", "clippy, rustfmt").map((text): ValueSpec => ({ kind: "word", text })),
  fc.constantFrom("it's", "a b", "", "x: y", "é日本🙂").map((text): ValueSpec => ({ kind: "single", text })),
  fc.constantFrom("a b", "", "héllo 日本 🙂", "#hash").map((text): ValueSpec => ({ kind: "double", text })),
  fc.constantFrom("42", "-7").map((text): ValueSpec => ({ kind: "int", text })),
  fc.constantFrom("true", "false").map((text): ValueSpec => ({ kind: "bool", text })),
  fc.array(fc.constantFrom("echo one", "cargo build"), { minLength: 1, maxLength: 2 }).map((lines): ValueSpec => ({ kind: "block", lines })),
);

/** An Input_Mapping: some old inputs renamed, some kept under their own name, some dropped. */
export const inputsArb: fc.Arbitrary<Record<string, string | null>> = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...OLD_KEYS), { maxLength: 6 }),
    fc.array(fc.constantFrom("rename" as const, "keep" as const, "drop" as const), { minLength: 6, maxLength: 6 }),
  )
  .map(([keys, actions]) => {
    const out: Record<string, string | null> = {};
    let next = 0;
    keys.forEach((k, i) => {
      const a = actions[i]!;
      out[k] = a === "drop" ? null : a === "keep" ? k : NEW_KEYS[next++ % NEW_KEYS.length]!;
    });
    return out;
  });

export const actionReplacementArb: fc.Arbitrary<ActionReplacement> = fc
  .tuple(fc.constantFrom(...OWNERS), fc.constantFrom(...REPOS), fc.constantFrom(...TO), fc.constantFrom(...TO_REFS), inputsArb)
  .map(([owner, repo, to, toRef, inputs]) => ({
    from: `${owner}/${repo}`,
    kind: "action" as const,
    to,
    toRef,
    sourceUrl: `https://github.com/${owner}/${repo}`,
    replacementUrl: `https://github.com/${to}`,
    inputs,
  }));

/** The `with` entries for a replacement: all mapped, or mapped and unmapped mixed. */
export function withFor(inputs: Readonly<Record<string, string | null>>, allowUnmapped: boolean): fc.Arbitrary<WithSpec | undefined> {
  const mapped = Object.keys(inputs);
  const pool = allowUnmapped ? [...mapped, ...UNMAPPED] : mapped;
  if (pool.length === 0) return fc.constant(undefined);
  return fc
    .tuple(fc.boolean(), fc.uniqueArray(fc.constantFrom(...pool), { maxLength: 6 }), fc.array(valueArb, { minLength: 6, maxLength: 6 }))
    .map(([flow, keys, values]): WithSpec | undefined => {
      if (keys.length === 0) return undefined;
      return {
        flow: flow && keys.length > 0,
        entries: keys.map((key, i) => {
          const v = values[i]!;
          // A block scalar and a comma inside a plain scalar do not fit a flow mapping.
          const safe = flow && (v.kind === "block" || (v.kind === "word" && v.text.includes(","))) ? ({ kind: "int", text: "1" } as ValueSpec) : v;
          return { key, value: safe };
        }),
      };
    });
}

const styleArb = fc.constantFrom<Style>("plain", "single", "double");

export interface SwapCase {
  replacement: ActionReplacement;
  model: FileModel;
  spec: FileSpec;
  step: StepSpec;
}

/** The workflow of one step that uses `parts` with `with`. */
export function oneStepFile(
  parts: { owner: string; repo: string; path?: string; ref: string },
  withSpec: WithSpec | undefined,
  o: { style: Style; flow: boolean; tailComment: boolean; hasName: boolean; eol: "\n" | "\r\n"; finalEol: boolean; order: number[] },
): { spec: FileSpec; step: StepSpec; model: FileModel } {
  const step: StepSpec = {
    use: { kind: "action", parts, style: o.style },
    hasId: false,
    hasName: o.hasName,
    ...(withSpec ? { with: withSpec } : {}),
    flow: o.flow,
    tailComment: o.tailComment,
    commentBefore: false,
    blankBefore: 0,
    decoy: undefined,
    mentions: [],
    order: o.order,
  };
  const spec: FileSpec = {
    eol: o.eol,
    finalEol: o.finalEol,
    seqIndent: 4,
    headerComment: false,
    jobs: [{ base: "build", steps: [step], jobDecoy: false, blankBefore: 0 }],
  };
  return { spec, step, model: renderFile(spec, FILE) };
}

const layoutArb = fc.record({
  style: styleArb,
  flow: fc.integer({ min: 0, max: 7 }).map((n) => n === 0),
  tailComment: fc.boolean(),
  hasName: fc.boolean(),
  eol: fc.constantFrom("\n" as const, "\r\n" as const),
  finalEol: fc.boolean(),
  order: fc.array(fc.nat({ max: 99 }), { minLength: 8, maxLength: 8 }),
});

/** A replacement and a use of its `from`, mostly with every key mapped. */
export const swapCaseArb: fc.Arbitrary<SwapCase> = actionReplacementArb.chain((replacement) =>
  fc
    .tuple(withFor(replacement.inputs, false), withFor(replacement.inputs, true), fc.integer({ min: 0, max: 4 }), layoutArb, fc.constantFrom("v1", "main", "v4.1.2"), fc.boolean())
    .map(([mappedOnly, mixed, pick, layout, ref, upper]) => {
      const [owner, repo] = replacement.from.split("/") as [string, string];
      // the use spells the name in any case: the match is case-insensitive
      const parts = { owner: upper ? owner.toUpperCase() : owner, repo: upper ? repo.toUpperCase() : repo, ref };
      const withSpec = pick === 0 ? mixed : mappedOnly;
      return { replacement, ...oneStepFile(parts, withSpec, layout) };
    }),
);
