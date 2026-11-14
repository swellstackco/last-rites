/** Committed proof reports under demo/proofs (Requirement 16.7). Only the invariants of Requirement 9 are asserted. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isProofName, parseProofReport } from "@last-rites/skeleton/proof";

const PROOFS = join(fileURLToPath(new URL("../../../../", import.meta.url)), "demo/proofs");

/** `[repo, file]` pairs for every `demo/proofs/<repo>/<package>.json`; `candidates` holds source files, not reports. */
function committedReports(): Array<[string, string]> {
  if (!existsSync(PROOFS)) return [];
  const out: Array<[string, string]> = [];
  for (const repo of readdirSync(PROOFS)) {
    if (repo === "candidates" || !statSync(join(PROOFS, repo)).isDirectory()) continue;
    for (const file of readdirSync(join(PROOFS, repo))) if (file.endsWith(".json")) out.push([repo, file]);
  }
  return out;
}

describe("committed demo proof reports", () => {
  const reports = committedReports();

  it("passes when the directory has no report", () => {
    expect(Array.isArray(reports)).toBe(true);
  });

  it.each(reports)("%s/%s is a valid, canonical Proof_Report with Proof_Name path parts", (repo, file) => {
    const pkg = file.replace(/\.json$/, "");
    expect(isProofName(repo)).toBe(true);
    expect(isProofName(pkg)).toBe(true);
    const parsed = parseProofReport(readFileSync(join(PROOFS, repo, file), "utf8"));
    expect(parsed.ok, parsed.ok ? "" : `${parsed.error.category}: ${parsed.error.message}`).toBe(true);
    if (parsed.ok) expect(parsed.report.package).toBe(pkg);
  });
});
