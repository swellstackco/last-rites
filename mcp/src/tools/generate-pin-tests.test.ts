import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import { dedupCandidate, oracleModule, proofDeps } from "../test-support/proof-deps.js";
import { generatePinTestsImpl } from "./generate-pin-tests.js";

const text = (r: CallToolResult, i = 0) => (r.content[i] as { text: string }).text;
const errorCode = (r: CallToolResult) => (JSON.parse(text(r)) as { error: { code: string } }).error.code;

describe("generate_pin_tests (no out)", () => {
  it("an oracle-equivalent candidate is proved, with a sabotage line", async () => {
    const { deps, reportFs } = proofDeps("intersect-like", { "same.js": oracleModule("intersect") });
    const r = await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect", candidate: "same.js", runs: 100 });
    expect(r.isError).toBeFalsy();
    expect(r.content).toHaveLength(2);
    const p = parseProofReport(text(r));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.report.repo).toBe("intersect-like");
    expect(p.report.attempts).toHaveLength(1);
    expect(p.report.attempts[0]!.status).toBe("proved");
    expect(text(r, 1)).toMatch(/sabotage: \d+ of \d+ mutants caught/);
    expect(text(r, 1)).not.toContain("written:");
    expect(reportFs.writes).toEqual([]);
  });

  it("a de-duplicating candidate gives a successful result with the shrunk counterexample", async () => {
    const { deps } = proofDeps("intersect-like", { "dedup.js": dedupCandidate });
    const r = await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect", candidate: "dedup.js", runs: 300 });
    expect(r.isError).toBeFalsy();
    const p = parseProofReport(text(r));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const a = p.report.attempts[0]!;
    expect(a.status).toBe("counterexample");
    expect(text(r, 1)).toContain(`shrunk input: ${a.counterexample!.input}`);
  });

  it("a package with no call sites is no-call-sites and needs no candidate", async () => {
    const { deps } = proofDeps("declared-only");
    const r = await generatePinTestsImpl(deps, { path: "./declared-only", package: "node-abort-controller" });
    expect(r.isError).toBeFalsy();
    const p = parseProofReport(text(r));
    expect(p.ok && p.report.attempts[0]!.status).toBe("no-call-sites");
    expect(p.ok && p.report.attempts[0]!.recommendation).toBe("remove-dependency");
  });

  it("call sites without a candidate are a usage_error", async () => {
    const { deps } = proofDeps("intersect-like");
    const r = await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect" });
    expect(r.isError).toBe(true);
    expect(errorCode(r)).toBe("usage_error");
  });

  it("a missing candidate file is invalid_candidate and nothing is loaded", async () => {
    const { deps } = proofDeps("intersect-like");
    const r = await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect", candidate: "nope.js" });
    expect(errorCode(r)).toBe("invalid_candidate");
    expect(deps.counts.loadCandidate.calls).toEqual([]);
    expect(deps.counts.usageSurface.calls).toEqual([]);
  });

  it.each([
    [{ path: "./intersect-like", package: "@s/intersect" }, "invalid_package"],
    [{ path: "./intersect-like", package: "Intersect" }, "invalid_package"],
    [{ path: "./nope", package: "intersect" }, "path_not_found"],
    [{ path: "./intersect-like", package: "intersect", runs: 5 }, "invalid_runs"],
    [{ path: "./intersect-like", package: "intersect", out: "x.json" }, "invalid_out"],
  ])("rejects %j before any Dep is called", async (args, code) => {
    const { deps } = proofDeps("intersect-like");
    const r = await generatePinTestsImpl(deps, args as never);
    expect(errorCode(r)).toBe(code);
    expect(deps.totalCalls()).toBe(0);
  });

  it("writes nothing to the report file system", async () => {
    const { deps, reportFs } = proofDeps("intersect-like", { "same.js": oracleModule("intersect") });
    await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect", candidate: "same.js", runs: 100 });
    expect(reportFs.writes).toEqual([]);
    expect(reportFs.reads).toEqual([]);
  });
});
