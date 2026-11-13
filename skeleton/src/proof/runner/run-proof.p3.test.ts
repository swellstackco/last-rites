// Feature: proof-harness, Property 3: No trivial passes
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../../death-score/fc-runner.js";
import { SYNTHETIC_CASES, usageFor, type SyntheticCase } from "../test-support/synthetic-recipes.js";
import type { CallSite, ProofErrorCode } from "../types.js";
import { runProof } from "./run-proof.js";
import type { CallShape, ProofInput, ProofResult, Recipe } from "./types.js";

/** The one function Property 3 is about; sabotage lists replace it. */
export interface RunProofImpl {
  runProof(input: ProofInput): ProofResult;
}

export const REAL_RUN_PROOF_IMPL: RunProofImpl = { runProof };

type Defect =
  | "none"
  | "bad-guard"
  | "missing-label"
  | "idle-shape"
  | "oracle-missing"
  | "candidate-missing"
  | "version-mismatch"
  | "no-recipe"
  | "wrong-candidate";

const DEFECTS: Defect[] = [
  "none", "none", "bad-guard", "missing-label", "idle-shape", "oracle-missing", "candidate-missing",
  "version-mismatch", "no-recipe", "wrong-candidate",
];

// Cases with pairwise different members, so one module can hold all of them.
const POOL: SyntheticCase[] = ["sort-unique", "subtract", "make-record", "guarded-sqrt"].map(
  (n) => SYNTHETIC_CASES.find((c) => c.name === n)!,
);

type SiteKind = "ok" | "member" | "argcount" | "new" | "spread";

interface Scenario {
  filesScanned: number;
  caseIdx: number[]; // 1 to 2 distinct indexes into POOL
  sites: { caseSlot: number; kind: SiteKind }[];
  importCount: number;
  defect: Defect;
  numRuns: number;
  seed: number;
}

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  filesScanned: fc.constantFrom(0, 1, 1, 2, 3, 3, 3),
  caseIdx: fc.uniqueArray(fc.nat({ max: POOL.length - 1 }), { minLength: 1, maxLength: 2 }),
  sites: fc.array(
    fc.record({
      caseSlot: fc.nat({ max: 1 }),
      kind: fc.constantFrom<SiteKind>(...Array<SiteKind>(12).fill("ok"), "member", "argcount", "new", "spread"),
    }),
    { maxLength: 6 },
  ),
  importCount: fc.integer({ min: 0, max: 3 }),
  defect: fc.constantFrom(...DEFECTS),
  numRuns: fc.integer({ min: 99, max: 120 }),
  seed: fc.nat({ max: 100000 }),
});

function moduleOf(cases: SyntheticCase[], pick: (c: SyntheticCase) => (...a: unknown[]) => unknown): unknown {
  const root = cases.find((c) => c.shape.member === "");
  const holder = (root ? (...a: unknown[]) => pick(root)(...a) : {}) as unknown as Record<string, unknown>;
  for (const c of cases) if (c.shape.member !== "") holder[c.shape.member] = (...a: unknown[]) => pick(c)(...a);
  return holder;
}

interface Built {
  input: ProofInput;
  shapes: CallShape[];
}

function buildScenario(s: Scenario): Built {
  const cases = s.caseIdx.map((i) => POOL[i]!);
  const callSites: CallSite[] = s.sites.map((x, i) => {
    const c = cases[x.caseSlot % cases.length]!;
    const site: CallSite = { ...usageFor(c.shape, 1)[0]!, file: `src/f${i}.js`, line: i + 1 };
    if (x.kind === "member") site.member = "zzz";
    if (x.kind === "argcount") site.argCount = c.shape.argCount + 1;
    if (x.kind === "new") site.new = true;
    if (x.kind === "spread") site.argTexts = ["...xs", ...site.argTexts.slice(1)];
    return site;
  });
  let shapes: CallShape[] = cases.map((c) => c.shape);
  if (s.defect === "bad-guard") shapes = shapes.map((sh) => ({ ...sh, guard: () => false }));
  if (s.defect === "missing-label") shapes = shapes.map((sh) => ({ ...sh, requiredLabels: [...sh.requiredLabels, "never-produced"] }));
  if (s.defect === "idle-shape") {
    shapes = [...shapes, { ...shapes[0]!, id: "idle", member: "idle-member", accepts: () => false }];
  }
  const recipe: Recipe | undefined =
    s.defect === "no-recipe"
      ? undefined
      : { package: "synthetic-pkg", shapes, ...(s.defect === "version-mismatch" ? { expectedVersion: "1.0.0" } : {}) };
  const input: ProofInput = {
    package: "synthetic-pkg",
    usage: {
      package: "synthetic-pkg",
      filesScanned: s.filesScanned,
      callSites,
      importSites: Array.from({ length: s.importCount }, (_, i) => ({ file: `src/i${i}.js`, line: 1, column: 1, form: "require" as const })),
      warnings: [],
    },
    ...(recipe ? { recipe } : {}),
    oracle: s.defect === "oracle-missing" ? {} : moduleOf(cases, (c) => c.oracle),
    oracleVersion: s.defect === "version-mismatch" ? "2.0.0" : "1.0.0",
    ...(s.defect === "candidate-missing" ? {} : { candidate: moduleOf(cases, (c) => (s.defect === "wrong-candidate" ? () => 0 : c.candidate)) }),
    numRuns: s.numRuns,
    seed: s.seed,
  };
  return { input, shapes };
}

interface Expected {
  status: ProofResult["status"];
  code?: ProofErrorCode;
  recommendation?: "remove-dependency" | "review-imports";
  /** Gates passed up to the point where shapes are listed. */
  listsShapes: boolean;
}

/** Reference model of Requirement 7.10, written from the input only. */
function model(s: Scenario, b: Built): Expected {
  const { input, shapes } = b;
  const sites = input.usage.callSites;
  if (s.numRuns < 100) return { status: "error", code: "invalid_runs", listsShapes: false };
  if (s.filesScanned === 0) return { status: "error", code: "no_source_files", listsShapes: false };
  if (sites.length === 0) {
    return { status: "no-call-sites", recommendation: s.importCount === 0 ? "remove-dependency" : "review-imports", listsShapes: false };
  }
  if (s.defect === "no-recipe") return { status: "error", code: "no_recipe", listsShapes: false };
  if (s.defect === "version-mismatch") return { status: "error", code: "oracle_version_mismatch", listsShapes: false };
  if (sites.some((x) => !shapes.some((sh) => sh.accepts(x)))) {
    return { status: "error", code: "unsupported_call_shapes", listsShapes: false };
  }
  if (s.defect === "oracle-missing") return { status: "error", code: "oracle_missing_member", listsShapes: false };
  if (s.defect === "candidate-missing") return { status: "error", code: "candidate_missing_member", listsShapes: false };
  if (s.defect === "bad-guard") return { status: "error", code: "arbitrary_mismatch", listsShapes: true };
  if (s.defect === "wrong-candidate") return { status: "counterexample", listsShapes: true };
  if (s.defect === "missing-label") return { status: "error", code: "insufficient_coverage", listsShapes: true };
  return { status: "proved", listsShapes: true };
}

function ensure(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function build(impl: RunProofImpl = REAL_RUN_PROOF_IMPL) {
  return fc.property(scenarioArb, (s) => {
    const b = buildScenario(s);
    const want = model(s, b);
    const r = impl.runProof(b.input);
    const ctx = `defect=${s.defect} files=${s.filesScanned} sites=${s.sites.length} imports=${s.importCount} numRuns=${s.numRuns}`;

    ensure(r.status === want.status, `${ctx}: status ${r.status}, expected ${want.status}`);
    ensure(r.error?.code === want.code, `${ctx}: error code ${r.error?.code ?? "none"}, expected ${want.code ?? "none"}`);
    ensure(r.recommendation === want.recommendation, `${ctx}: recommendation ${r.recommendation}, expected ${want.recommendation}`);
    ensure(r.status !== "proved" || b.input.usage.callSites.length > 0, `${ctx}: proved with zero call sites`);

    if (!want.listsShapes) {
      ensure(r.shapes.length === 0 && r.runs === 0, `${ctx}: shapes ran before the gates passed`);
    } else {
      // Shapes are listed in recipe order; skipped exactly when no call site is accepted.
      ensure(r.shapes.length === b.shapes.length, `${ctx}: shape list length`);
      let sum = 0;
      b.shapes.forEach((sh, i) => {
        const got = r.shapes[i]!;
        const accepted = b.input.usage.callSites.some((x) => sh.accepts(x));
        ensure(got.id === sh.id, `${ctx}: shape order`);
        if (!accepted) ensure(got.status === "skipped" && got.runs === 0, `${ctx}: ${sh.id} should be skipped and not run`);
        else ensure(got.status !== "skipped", `${ctx}: ${sh.id} accepted a site but was skipped`);
        sum += got.runs;
      });
      ensure(r.runs === sum, `${ctx}: runs ${r.runs} is not the sum ${sum}`);
    }

    // Requirement 7.9, from the input alone.
    if (r.status === "proved") {
      const sites = b.input.usage.callSites;
      ensure(sites.length > 0, `${ctx}: proved needs a call site`);
      ensure(sites.every((x) => b.shapes.some((sh) => sh.accepts(x))), `${ctx}: proved with an unaccepted call site`);
      b.shapes.forEach((sh, i) => {
        const got = r.shapes[i]!;
        if (!sites.some((x) => sh.accepts(x))) return;
        ensure(got.status === "passed" && got.runs === s.numRuns, `${ctx}: ${sh.id} did not pass all runs`);
        ensure(sh.requiredLabels.every((l) => (got.coverage[l] ?? 0) > 0), `${ctx}: ${sh.id} lacks a required label`);
      });
      ensure(r.sabotage.applied === r.sabotage.caught + r.sabotage.survivors.length, `${ctx}: sabotage accounting`);
      ensure(r.weak === (r.sabotage.applied === 0 || r.sabotage.survivors.length > 0), `${ctx}: weak flag`);
    } else {
      ensure(r.sabotage.applied === 0 && r.sabotage.caught === 0 && r.sabotage.survivors.length === 0, `${ctx}: sabotage ran for ${r.status}`);
      ensure(!r.weak, `${ctx}: weak without proved`);
    }
  });
}

describe("Property 3: No trivial passes", () => {
  it("holds for runProof", () => {
    assertProperty("no trivial passes", build(REAL_RUN_PROOF_IMPL));
  });
});
