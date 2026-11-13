import fc from "fast-check";
import { type E18eEvidence, type Outcome, type ScanOutcome } from "@graveyard-kit/exorcist-npm/programmatic";
import { reportArb } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import { callSiteArb, importSiteArb, SYNTHETIC_CASES, FAULT_FAMILY, moduleFor, usageResultFor } from "@graveyard-kit/skeleton/proof/testing";
import type { UsageSurfaceResult } from "@graveyard-kit/skeleton/proof";
import type { SyntheticCase, Fault } from "@graveyard-kit/skeleton/proof/testing";
import type { ExorcistDeps } from "../../deps.js";

// Generators of the outcomes of the wrapped code (fake pipelines, usage surfaces, e18e, exorcise through the real runProof).

const SCAN_ERROR_CODES = [
  "invalid_repo",
  "invalid_ref",
  "no_package_json",
  "malformed_package_json",
  "invalid_package_json_shape",
  "too_many_dependencies",
  "scan_timeout",
  "internal_error",
] as const;

const message = fc.string({ minLength: 1, maxLength: 30 });

/** A pipeline outcome: a `reportArb` report (any repo text) or one of the pipeline's error codes. */
export const scanOutcomeArb: fc.Arbitrary<ScanOutcome> = fc.oneof(
  { weight: 4, arbitrary: reportArb.map((report): ScanOutcome => ({ ok: true, report })) },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom(...SCAN_ERROR_CODES), message)
      .map(([code, m]): ScanOutcome => ({ ok: false, error: { code, message: m } })),
  },
  {
    weight: 1,
    arbitrary: fc
      .tuple(fc.constantFrom("network_error" as const, "timeout" as const, "rate_limited" as const), message)
      .map(([failureCategory, m]): ScanOutcome => ({ ok: false, error: { code: "repo_fetch_failed", message: m, failureCategory } })),
  },
);

/** Dependency names that pass the Npm_Name guard. */
export const npmNameArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom("left-pad", "intersect", "@scope/pkg", "a", "request"),
  fc.stringMatching(/^[a-z0-9][a-z0-9._~-]{0,20}$/),
);

/** A Usage_Surface result with generated call sites, import sites and warnings (more than 50 warnings sometimes). */
export const usageResultArb: fc.Arbitrary<UsageSurfaceResult> = fc
  .record({
    filesScanned: fc.nat({ max: 50 }),
    callSites: fc.array(callSiteArb, { maxLength: 5 }),
    importSites: fc.array(importSiteArb, { maxLength: 5 }),
    warnings: fc.oneof(fc.array(message, { maxLength: 4 }), fc.array(message, { minLength: 51, maxLength: 55 })),
  })
  .map((r) => ({ package: "", ...r }));

const replacementInfoArb = fc
  .record({
    type: fc.constantFrom("native", "simple", "documented", "none"),
    replacements: fc.array(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 3 }),
  })
  .map(({ type, replacements }) => ({
    type,
    ...(replacements.length > 0 ? { replacement: replacements[0]! } : {}),
    replacements,
  }));

const FAILURE_CATEGORIES = ["network_error", "timeout", "rate_limited", "malformed_response", "not_found"] as const;

/** An e18e outcome: a match, a verified miss, or a failure. */
export const e18eOutcomeArb: fc.Arbitrary<Outcome<E18eEvidence>> = fc.oneof(
  replacementInfoArb.map((replacement): Outcome<E18eEvidence> => ({ ok: true, value: { known: true, replacement, sourceUrl: "https://example.test/m" } })),
  fc.constant<Outcome<E18eEvidence>>({ ok: true, value: { known: false, sourceUrl: "https://example.test/dir" } }),
  fc.constantFrom(...FAILURE_CATEGORIES).map((category): Outcome<E18eEvidence> => ({ ok: false, reason: { source: "e18e", category } as never })),
);

/** One `exorcise` scenario over the synthetic recipes of the skeleton: the real runProof does the work. */
export interface ProofScenario {
  caseName: string;
  fault: string | undefined;
  sites: number;
  runs: number;
}

export const proofScenarioArb: fc.Arbitrary<ProofScenario> = fc.record({
  caseName: fc.constantFrom(...SYNTHETIC_CASES.map((c) => c.name)),
  fault: fc.constantFrom<string | undefined>(undefined, undefined, ...FAULT_FAMILY.filter((f) => f.equivalent !== true).map((f) => f.name)),
  sites: fc.integer({ min: 1, max: 3 }),
  runs: fc.constantFrom(100, 150),
});

export interface ProofParts {
  package: string;
  proof: ExorcistDeps["proof"];
  usageSurface: ExorcistDeps["usageSurface"];
  candidate: string;
}

/** The Deps parts of a scenario: usage surface, recipe, oracle and candidate (faulty or equivalent) of a synthetic case. */
export function proofPartsFor(s: ProofScenario, base: ExorcistDeps["proof"]): ProofParts {
  const c: SyntheticCase = SYNTHETIC_CASES.find((x) => x.name === s.caseName)!;
  const fault: Fault | undefined = FAULT_FAMILY.find((f) => f.name === s.fault);
  const usage = usageResultFor(c.shape, s.sites);
  const candidateFn = fault === undefined ? c.candidate : fault.wrap(c.oracle, c);
  const pkg = usage.package;
  return {
    package: pkg,
    candidate: "/work/cand.js",
    usageSurface: async () => usage,
    proof: {
      ...base,
      recipes: new Map([[pkg, c.recipe as never]]),
      loadOracle: (name) => (name === pkg ? { module: moduleFor(c.shape, c.oracle), version: "1.0.0" } : undefined),
      async loadCandidate(file) {
        return { module: moduleFor(c.shape, candidateFn), name: file, source: "// synthetic\n" };
      },
    },
  };
}
