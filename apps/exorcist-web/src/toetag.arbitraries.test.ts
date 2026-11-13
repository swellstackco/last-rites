// toe-tag-redesign 2.3: the generated Proof_Reports are valid for the real parser. Node, no network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseProofReport, serializeProofReport } from "@graveyard-kit/skeleton/proof";
import { NUM_RUNS, resolveSeed } from "@graveyard-kit/skeleton/graveyard/testing";
import { proofKindArb, proofReportArb } from "./test-support/arbitraries.js";

describe("proofReportArb", () => {
  it("every generated report serializes and parses with the real parser", () => {
    fc.assert(
      fc.property(proofReportArb, (report) => {
        const parsed = parseProofReport(serializeProofReport(report));
        if (!parsed.ok) throw new Error(`${parsed.error.category}: ${parsed.error.message}`);
        expect(parsed.report).toEqual(report);
      }),
      { numRuns: NUM_RUNS, seed: resolveSeed() },
    );
  });

  it("covers all five kinds, up to 80 call sites and 3 attempts", () => {
    const seen = new Set<string>();
    let maxSites = 0;
    let maxAttempts = 0;
    const samples = fc.sample(proofReportArb, { numRuns: 600, seed: 1 });
    for (const r of samples) {
      maxSites = Math.max(maxSites, r.callSites.length);
      maxAttempts = Math.max(maxAttempts, r.attempts.length);
      const last = r.attempts[r.attempts.length - 1]!;
      seen.add(last.status === "proved" ? (last.weak ? "weak" : "proved") : last.status);
    }
    expect([...seen].sort()).toEqual(["counterexample", "error", "no-call-sites", "proved", "weak"]);
    expect(maxSites).toBeGreaterThan(50);
    expect(maxAttempts).toBe(3);
    expect(fc.sample(proofKindArb, 50).length).toBe(50);
  });
});
