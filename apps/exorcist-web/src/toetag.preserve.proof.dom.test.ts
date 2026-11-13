// @vitest-environment jsdom
// toe-tag-redesign Property 2: Proof_Report facts are preserved (and the real-data examples). No network.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as tt2, checkProofFacts } from "./test-support/properties/tt2.js";

describe("Property 2: Proof_Report facts are preserved", () => {
  it("the Proof section shows the Reference_Views facts and the report's facts", async () => {
    const report = await checkAsyncProperty("Property 2: Proof_Report facts", tt2());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 180_000);

  it.each(["absent", "failed", "invalid"] as const)("the %s state shows the placeholder", async (kind) => {
    await checkProofFacts({ kind });
  });

  const proofDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo", "proofs");
  const files = readdirSync(proofDir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => join(e.parentPath, e.name));

  it("finds the demo proof reports", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`real data: ${file.slice(file.indexOf("demo/proofs/"))}`, async () => {
      const parsed = parseProofReport(readFileSync(file, "utf8"));
      if (!parsed.ok) return; // only files that parse are rendered
      await checkProofFacts({ kind: "report", report: parsed.report });
    }, 60_000);
  }
});
