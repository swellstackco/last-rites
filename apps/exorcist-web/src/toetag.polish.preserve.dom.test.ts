// @vitest-environment jsdom
// toe-tag-polish Property TP6: preservation against the frozen v3 views. No network.
import { describe, expect, it } from "vitest";
import { buildProofView } from "@last-rites/skeleton/graveyard";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { buildReport } from "./test-support/build-report.js";
import { build as tp6, checkCase } from "./test-support/properties/tp6.js";
import { DEAD_SIGNALS } from "./test-support/signals.js";
import { buildProofReport } from "./test-support/build-proof-report.js";

describe("TP6: preservation", () => {
  it("the page shows the v3 views' facts (report page, open panel with every proof state, picker)", async () => {
    const report = await checkAsyncProperty("TP6: preservation", tp6());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 240_000);

  it("a dead package with a counterexample proof matches the v3 panel", async () => {
    const pkg = { report: buildReport([{ name: "gone", signals: DEAD_SIGNALS }]), name: "gone", grade: "dead" as const };
    const proof = buildProofReport("counterexample");
    expect(buildProofView(proof).attempts.length).toBeGreaterThan(0);
    await checkCase({ kind: "proof", pkg, draw: { load: { kind: "report", report: proof }, order: "after" } });
  });

  it("the picker matches the v3 picker", async () => {
    await checkCase({ kind: "picker", live: false });
    await checkCase({ kind: "picker", live: true });
  });
});
