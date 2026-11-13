import fc from "fast-check";
import type {
  CallSite,
  CounterexampleRecord,
  ImportForm,
  ImportSite,
  ProofAttempt,
  ProofErrorCode,
  ProofReport,
  ProofStatus,
  ShapeResult,
} from "../../types.js";

const text = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.fullUnicodeString({ maxLength: 8 }),
  fc.constantFrom("", "\"", "\\", "line\nbreak\ttab", "\u2028\u2029", "__proto__", "é😀", "a b", "…"),
);
const small = fc.nat({ max: 5000 });

const IMPORT_FORMS: ImportForm[] = [
  "import-default", "import-named", "import-namespace", "import-side-effect", "import-type",
  "import-equals", "re-export", "require", "require-unbound", "dynamic-import",
];
const ERROR_CODES: ProofErrorCode[] = [
  "invalid_runs", "no_source_files", "no_recipe", "oracle_version_mismatch", "unsupported_call_shapes",
  "oracle_missing_member", "candidate_missing_member", "arbitrary_mismatch", "async_not_supported",
  "recipe_failure", "insufficient_coverage",
];

export const callSiteArb: fc.Arbitrary<CallSite> = fc
  .record(
    {
      file: text,
      line: small,
      column: small,
      callee: text,
      member: text,
      argCount: fc.nat({ max: 6 }),
      argTexts: fc.array(text, { maxLength: 4 }),
      enclosing: fc.constantFrom("src" as const, "test" as const),
      consumedAs: fc.constant("undefined-check" as const),
      new: fc.constant(true as const),
    },
    { requiredKeys: ["file", "line", "column", "callee", "member", "argCount", "argTexts", "enclosing"] },
  )
  .map((r) => r as CallSite);

export const importSiteArb: fc.Arbitrary<ImportSite> = fc.record({
  file: text,
  line: small,
  column: small,
  form: fc.constantFrom(...IMPORT_FORMS),
});

// Coverage keys must not look like array indices: JS orders those numerically, not by code unit.
const coverageKey = fc.oneof(fc.constantFrom("__proto__", "empty", "equal-pair"), text.map((s) => "L" + s));

const shapeArb: fc.Arbitrary<ShapeResult> = fc.record({
  id: text,
  status: fc.constantFrom("passed" as const, "failed" as const, "skipped" as const, "error" as const),
  runs: small,
  coverage: fc.array(fc.tuple(coverageKey, small), { maxLength: 4 }).map((pairs) => {
    const cov: Record<string, number> = {};
    for (const [k, v] of pairs) {
      Object.defineProperty(cov, k, { value: v, enumerable: true, writable: true, configurable: true });
    }
    return cov;
  }),
});

const counterexampleArb: fc.Arbitrary<CounterexampleRecord> = fc.record({
  shape: text,
  input: text,
  shrinks: small,
  path: text,
  oldOutput: text,
  newOutput: text,
  oldProjected: text,
  newProjected: text,
});

function attemptArb(
  n: number,
  status: ProofStatus,
  hasImports: boolean,
): fc.Arbitrary<ProofAttempt> {
  const sabotage =
    status === "proved"
      ? fc
          .tuple(fc.nat({ max: 6 }), fc.array(text, { maxLength: 4 }))
          .map(([caught, survivors]) => ({ applied: caught + survivors.length, caught, survivors }))
      : fc.constant({ applied: 0, caught: 0, survivors: [] as string[] });
  return fc
    .record(
      {
        candidate: fc.record({ name: text, source: text }),
        numRuns: fc.integer({ min: 100, max: 5000 }),
        runs: small,
        seed: fc.nat(),
        shapes: fc.array(shapeArb, { maxLength: 3 }),
        counterexample: counterexampleArb,
        error: fc.record({ code: fc.constantFrom(...ERROR_CODES), message: text }),
        sabotage,
      },
      { requiredKeys: ["numRuns", "runs", "seed", "shapes", "sabotage", "counterexample", "error"] },
    )
    .chain((base) =>
      fc.boolean().map((withCandidate) => {
        const a: ProofAttempt = {
          attempt: n,
          status,
          weak: status === "proved" && (base.sabotage.applied === 0 || base.sabotage.survivors.length > 0),
          numRuns: base.numRuns,
          runs: base.runs,
          seed: base.seed,
          shapes: base.shapes,
          sabotage: base.sabotage,
        };
        if (withCandidate && base.candidate) a.candidate = base.candidate;
        if (status === "counterexample") a.counterexample = base.counterexample!;
        if (status === "error") a.error = base.error!;
        if (status === "no-call-sites") a.recommendation = hasImports ? "review-imports" : "remove-dependency";
        return a;
      }),
    );
}

/** A valid, consistent ProofReport (every rule of Requirement 9.7 holds). */
export const proofReportArb: fc.Arbitrary<ProofReport> = fc
  .record({
    callSites: fc.array(callSiteArb, { maxLength: 8 }),
    importSites: fc.array(importSiteArb, { maxLength: 8 }),
  })
  .chain(({ callSites, importSites }) => {
    const statuses: ProofStatus[] =
      callSites.length > 0 ? ["proved", "counterexample", "error"] : ["no-call-sites", "counterexample", "error"];
    return fc
      .array(fc.constantFrom(...statuses), { minLength: 1, maxLength: 4 })
      .chain((list) => fc.tuple(...list.map((s, i) => attemptArb(i + 1, s, importSites.length > 0))))
      .chain((attempts) =>
        fc
          .record(
            { commit: text, oracleVersion: text, repo: text, package: text, filesScanned: small },
            { requiredKeys: ["repo", "package", "filesScanned"] },
          )
          .map((h) => {
            const r: ProofReport = {
              repo: h.repo,
              package: h.package,
              filesScanned: h.filesScanned,
              callSites,
              importSites,
              attempts,
            };
            if (h.commit !== undefined) r.commit = h.commit;
            if (h.oracleVersion !== undefined) r.oracleVersion = h.oracleVersion;
            return r;
          }),
      );
  });
