import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { evidenceProperties, realEvidenceImpl, type EvidenceImpl } from "../test-support/properties/actions-p7.js";
import { sabotages } from "../test-support/sabotage/actions-p7.js";
import { assembleActionEvidence } from "./assemble.js";

/** Property 7 over a swappable implementation, for the central sabotage test. */
export async function build(impl: EvidenceImpl = realEvidenceImpl): Promise<void> {
  for (const p of evidenceProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 7: evidence mapping keeps unknown unknown", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P7", evidenceProperties, sabotages);
  });

  it("example: a stage that has no outcome for a source treats it as a network failure, never as alive", () => {
    const r = assembleActionEvidence({ name: "o/r", ref: "v1", site: "step", now: new Date("2026-01-01T00:00:00Z") });
    expect(r.signals.repoArchived).toEqual({ kind: "unknown" });
    expect(r.signals.openVulnsNoFix).toEqual({ kind: "unknown" });
    expect(r.unknownReasons.openVulnsNoFix?.category).toBe("network_error");
  });
});
