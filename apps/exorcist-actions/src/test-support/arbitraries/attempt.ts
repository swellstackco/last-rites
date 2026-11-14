import fc from "fast-check";
import type { SabotageSummary } from "@last-rites/skeleton/proof";
import type { ActionUse, WithKey } from "../../inventory/types.js";
import type { ContractCheck, ContractViolationKind } from "../../proof/contract-check.js";
import type { PinCheck } from "../../proof/pin-check.js";

/** Inputs of the attempt mapping (Property 12): every outcome of both proofs. */

const WORDS = ["actions", "checkout", "rust-toolchain", "My_Org", "a", "x.y", "Dtolnay", "upload-artifact"];
const wordArb = fc.constantFrom(...WORDS);

/** An Action_Name (`owner/repo`), with mixed case and punctuation so the name rules are exercised. */
export const actionNameArb: fc.Arbitrary<string> = fc.tuple(wordArb, wordArb).map(([o, r]) => `${o}/${r}`);

/** Names that may or may not be equal up to case. */
export const actionNamePairArb: fc.Arbitrary<[string, string]> = fc.oneof(
  fc.tuple(actionNameArb, actionNameArb),
  actionNameArb.chain((n) => fc.constantFrom<[string, string]>([n, n.toUpperCase()], [n, n.toLowerCase()], [n, n])),
);

/** Odd labels for `repoProofName`. */
export const labelArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ maxLength: 120 }),
  fc.tuple(wordArb, fc.string({ maxLength: 90 })).map(([o, r]) => `${o}/${r}`),
  fc.constantFrom("", "/", "a/", "/b", "railwayapp/nixpacks", "Local/My Repo!"),
);

const FILES = [".github/workflows/ci.yml", ".github/workflows/release.yaml", ".github/workflows/zz.yml"];
const REFS = ["v1", "v2.3.4", "main", "release/v3"];
const VALUES = ["x", "  spaced   out\tvalue ", "a\nb", "", "é", "z".repeat(150), "q".repeat(260), " ".repeat(5) + "w".repeat(205)];
const KEYS = ["toolchain", "profile", "override", "token", "with-k"];

const useArb = (file: string, line: number): fc.Arbitrary<ActionUse> =>
  fc
    .record({
      name: actionNameArb,
      path: fc.option(fc.constantFrom("sub", "a/b"), { nil: undefined }),
      ref: fc.constantFrom(...REFS),
      keys: fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 4 }),
      values: fc.array(fc.constantFrom(...VALUES), { minLength: 4, maxLength: 4 }),
      column: fc.integer({ min: 1, max: 30 }),
    })
    .map((r): ActionUse => {
      const [owner, repo] = r.name.split("/") as [string, string];
      const w: Record<string, string> = {};
      const withKeys: WithKey[] = r.keys.map((k, i) => {
        w[k] = r.values[i]!;
        return { name: k, offset: 0, length: k.length };
      });
      return {
        file,
        line,
        column: r.column,
        offset: 0,
        length: 0,
        owner,
        repo,
        ...(r.path !== undefined ? { path: r.path } : {}),
        ref: r.ref,
        refKind: "mutable",
        with: w,
        withKeys,
        jobId: "build",
        site: "step",
        stepIndex: 0,
        outputRefs: [],
      };
    });

/** One to five uses at distinct (file, line) positions, in no particular order. */
export const usesArb: fc.Arbitrary<ActionUse[]> = fc
  .uniqueArray(fc.tuple(fc.constantFrom(...FILES), fc.integer({ min: 1, max: 40 })), {
    minLength: 1,
    maxLength: 5,
    selector: ([f, l]) => `${f}\n${l}`,
  })
  .chain((spots) => fc.tuple(...spots.map(([f, l]) => useArb(f, l))));

const LINES = ["      - uses: a/b@v1", "        with:", "          k: v", "name: ci", "", "on: push"];

/** Original and rewritten texts for the files of `uses`: a changed line, or a text that does not change at all. */
export const textsArb = (uses: readonly ActionUse[]): fc.Arbitrary<{ originals: Map<string, string>; rewritten: Map<string, string> }> =>
  fc
    .tuple(fc.array(fc.constantFrom(...LINES), { minLength: 1, maxLength: 6 }), fc.constantFrom("", " # old", " # was x"), fc.boolean())
    .map(([lines, comment, same]) => {
      const originals = new Map<string, string>();
      const rewritten = new Map<string, string>();
      for (const f of new Set(uses.map((u) => u.file))) {
        originals.set(f, lines.join("\n") + "\n");
        rewritten.set(f, same ? lines.join("\n") + "\n" : [lines[0] + comment + " # changed", ...lines.slice(1)].join("\n") + "\n");
      }
      return { originals, rewritten };
    });

export const sabotageSummaryArb: fc.Arbitrary<SabotageSummary> = fc
  .tuple(fc.nat({ max: 5 }), fc.nat({ max: 4 }))
  .map(([caught, surv]) => ({ applied: caught + surv, caught, survivors: Array.from({ length: surv }, (_, i) => `pin:mutant-${i}`) }));

export type Outcome = "proved" | "counterexample" | "error";
export const outcomeArb: fc.Arbitrary<Outcome> = fc.constantFrom("proved", "counterexample", "error");

export interface PinOutcome {
  kind: "pin";
  outcome: Outcome;
  actionName: string;
  uses: ActionUse[];
  originals: Map<string, string>;
  rewritten: Map<string, string>;
  check: PinCheck;
  sabotage: SabotageSummary;
  message: string;
  commit: string | undefined;
  filesRead: number;
  label: string;
}

export interface ContractOutcome {
  kind: "contract";
  outcome: Outcome;
  actionName: string;
  uses: ActionUse[];
  originals: Map<string, string>;
  rewritten: Map<string, string>;
  results: { use: ActionUse; check: ContractCheck }[];
  sabotage: SabotageSummary;
  message: string;
  commit: string | undefined;
  filesRead: number;
  label: string;
}

export type AttemptCase = PinOutcome | ContractOutcome;

const common = fc.record({
  outcome: outcomeArb,
  actionName: actionNameArb,
  sabotage: sabotageSummaryArb,
  message: fc.constantFrom("resolve a/b@v1: not_found", "manifest a/b@v1: network_error"),
  commit: fc.option(fc.constantFrom("144b4f9", "abc"), { nil: undefined }),
  filesRead: fc.nat({ max: 9 }),
  label: fc.constantFrom("railwayapp/nixpacks", "local/x"),
});

const pinOutcomeArb: fc.Arbitrary<PinOutcome> = fc
  .tuple(common, usesArb, fc.nat({ max: 50 }), fc.constantFrom("sha", "bytes", "parse"), fc.nat())
  .chain(([c, uses, runs, vk, pick]) =>
    textsArb(uses).map((t): PinOutcome => {
      const u = uses[pick % uses.length]!;
      const check: PinCheck =
        c.outcome === "proved"
          ? { ok: true, runs }
          : {
              ok: false,
              runs,
              violation:
                vk === "sha"
                  ? { kind: "sha", file: u.file, line: u.line, ref: u.ref, written: "a".repeat(40), resolved: "b".repeat(40) }
                  : vk === "bytes"
                    ? { kind: "bytes", file: u.file, line: pick % 2 === 0 ? u.line : u.line + 100, original: "- old\r\n", rewritten: "" }
                    : { kind: "parse", file: u.file, line: u.line, detail: "x" },
            };
      return { kind: "pin", ...c, uses, ...t, check };
    }),
  );

const KINDS: ContractViolationKind[] = ["input_unmapped", "input_undeclared", "input_required", "output_missing"];

const contractOutcomeArb: fc.Arbitrary<ContractOutcome> = fc
  .tuple(
    common,
    usesArb,
    fc.array(fc.tuple(fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 3 }), fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 3 }), fc.uniqueArray(fc.constantFrom(...KEYS), { maxLength: 3 })), {
      minLength: 5,
      maxLength: 5,
    }),
    fc.constantFrom(...KINDS),
    fc.nat(),
  )
  .chain(([c, uses, lists, kind, pick]) =>
    textsArb(uses).map((t): ContractOutcome => {
      const bad = pick % uses.length;
      const results = uses.map((use, i): { use: ActionUse; check: ContractCheck } => {
        const [dropped, renamed, required] = lists[i]!;
        const ok: ContractCheck = { ok: true, runs: 4, dropped, renamed, required };
        if (c.outcome === "counterexample" && i === bad) return { use, check: { ok: false, runs: 4, violation: { kind, name: KEYS[pick % KEYS.length]! } } };
        return { use, check: ok };
      });
      return { kind: "contract", ...c, uses, ...t, results };
    }),
  );

export const attemptCaseArb: fc.Arbitrary<AttemptCase> = fc.oneof(pinOutcomeArb, contractOutcomeArb);
