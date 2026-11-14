import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { realScanImpl, scanProperties, type ScanImpl } from "../test-support/properties/actions-p11.js";
import { sabotages } from "../test-support/sabotage/actions-p11.js";
import { buildScanReport } from "./report.js";

/** Property 11 over a swappable implementation, for the central sabotage test. */
export async function build(impl: ScanImpl = realScanImpl): Promise<void> {
  for (const p of scanProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 11: scan report validity and the ecosystem field", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P11", scanProperties, sabotages);
  });

  it("example: an empty inventory gives a valid empty report", () => {
    const r = buildScanReport({
      label: "o/n",
      ref: "local",
      scannedAt: "2026-01-01T00:00:00.000Z",
      inventory: { uses: [], skipped: [], warnings: [], filesRead: 0 },
      evidence: new Map(),
    });
    expect(r.dependencies).toEqual([]);
    expect(r.summary).toEqual({ total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 });
    expect(r.ecosystem).toBe("github-actions");
  });
});
