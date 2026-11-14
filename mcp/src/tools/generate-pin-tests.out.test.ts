import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseProofReport } from "@last-rites/skeleton/proof";
import { dedupCandidate, oracleModule, proofDeps } from "../test-support/proof-deps.js";
import { generatePinTestsImpl } from "./generate-pin-tests.js";

const text = (r: CallToolResult, i = 0) => (r.content[i] as { text: string }).text;
const errorCode = (r: CallToolResult) => (JSON.parse(text(r)) as { error: { code: string } }).error.code;
const OUT = "proofs/intersect-like/intersect.json";
const ABS_OUT = `/work/${OUT}`;

const base = { path: "./intersect-like", package: "intersect", runs: 100, out: OUT };

describe("generate_pin_tests (with out)", () => {
  it("first run creates attempt 1, second appends attempt 2; only out is written", async () => {
    const { deps, reportFs } = proofDeps("intersect-like", { "dedup.js": dedupCandidate, "same.js": oracleModule("intersect") });
    const r1 = await generatePinTestsImpl(deps, { ...base, candidate: "dedup.js" });
    expect(r1.isError).toBeFalsy();
    expect(reportFs.writes.map((w) => w.path)).toEqual([ABS_OUT]);
    const p1 = parseProofReport(text(r1));
    expect(p1.ok && p1.report.attempts.map((a) => a.status)).toEqual(["counterexample"]);
    expect(text(r1)).toBe(reportFs.files.get(ABS_OUT));
    expect(text(r1, 1)).toContain(`written: ${ABS_OUT}`);

    const r2 = await generatePinTestsImpl(deps, { ...base, candidate: "same.js" });
    expect(r2.isError).toBeFalsy();
    const p2 = parseProofReport(text(r2));
    expect(p2.ok && p2.report.attempts.map((a) => [a.attempt, a.status])).toEqual([
      [1, "counterexample"],
      [2, "proved"],
    ]);
    expect(reportFs.writes.map((w) => w.path)).toEqual([ABS_OUT, ABS_OUT]);
  });

  it("a report for a different usage surface is proof_failed and nothing is written", async () => {
    const other = JSON.stringify({ repo: "intersect-like", package: "intersect", filesScanned: 99, callSites: [], importSites: [], attempts: [] });
    const { deps, reportFs } = proofDeps("intersect-like", { "same.js": oracleModule("intersect") });
    reportFs.files.set(ABS_OUT, other);
    const r = await generatePinTestsImpl(deps, { ...base, candidate: "same.js" });
    expect(r.isError).toBe(true);
    expect(errorCode(r)).toBe("proof_failed");
    expect(reportFs.writes).toEqual([]);
  });

  it("an invalid existing report is proof_failed and nothing is written", async () => {
    const { deps, reportFs } = proofDeps("intersect-like", { "same.js": oracleModule("intersect") });
    reportFs.files.set(ABS_OUT, "not json");
    const r = await generatePinTestsImpl(deps, { ...base, candidate: "same.js" });
    expect(errorCode(r)).toBe("proof_failed");
    expect(reportFs.writes).toEqual([]);
  });

  it.each(["x.json", "proofs/Bad/x.json", "proofs/a/", "../proofs/a/../x"])("a bad out %j is invalid_out before any Dep call", async (out) => {
    const { deps, reportFs } = proofDeps("intersect-like", { "same.js": oracleModule("intersect") });
    const r = await generatePinTestsImpl(deps, { ...base, candidate: "same.js", out });
    expect(errorCode(r)).toBe("invalid_out");
    expect(deps.totalCalls()).toBe(0);
    expect(reportFs.writes).toEqual([]);
  });
});
