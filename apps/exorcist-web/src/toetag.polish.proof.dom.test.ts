// @vitest-environment jsdom
// toe-tag-polish Property TP1 (T1): proof for any grade, and the real parse-server / intersect example. No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { mountPage } from "./test-support/dom-harness.js";
import { build as tp1, buildLive } from "./test-support/properties/tp1.js";
import { proofFacts } from "./test-support/toe-facts.js";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo");

describe("TP1: proof for any grade", () => {
  it("a valid report is shown at every grade, before or after the panel opens; others as before", async () => {
    const report = await checkAsyncProperty("TP1: proof for any grade", tp1());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 240_000);

  it("a live scan never requests a proof", async () => {
    const report = await checkAsyncProperty("TP1: live scan", buildLive());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 240_000);

  it("real data: parse-server / intersect (ailing, 35) shows attempt 1 counterexample and attempt 2 proved", async () => {
    const scanText = readFileSync(join(demoDir, "parse-server.json"), "utf8");
    const parsed = parseReport(scanText);
    if (!parsed.ok) throw new Error("parse-server.json does not parse");
    const dep = parsed.report.dependencies.find((d) => d.name === "intersect")!;
    expect(dep.death.grade).toBe("ailing");
    const proofText = readFileSync(join(demoDir, "proofs", "parse-server", "intersect.json"), "utf8");
    const page = mountPage({
      route: "#/demo/parse-server",
      fetchRoutes: {
        "GET /api/demo/parse-server": { body: scanText },
        "GET /demo/proofs/parse-server/intersect.json": { body: proofText },
      },
    });
    try {
      await page.flush();
      page.click(page.document.querySelector<HTMLElement>("button.tombstone[data-key='intersect']")!);
      await page.flush();
      const facts = proofFacts(page.document.body);
      expect(facts).not.toBeNull();
      expect(facts!.attempts).toHaveLength(2);
      expect(facts!.attempts[0]!.badgeKind).toBe("counterexample");
      expect(facts!.attempts[1]!.badgeKind).toBe("proved");
    } finally {
      page.destroy();
    }
  });
});
