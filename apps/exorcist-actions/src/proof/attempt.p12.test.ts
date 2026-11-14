import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { attemptProperties, realAttemptImpl, type AttemptImpl } from "../test-support/properties/actions-p12.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { sabotages } from "../test-support/sabotage/actions-p12.js";
import { actionProofName, repoProofName } from "./names.js";

/** Property 12 over a swappable implementation, for the central sabotage test. */
export async function build(impl: AttemptImpl = realAttemptImpl): Promise<void> {
  for (const p of attemptProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 12: proof report mapping and names", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P12", attemptProperties, sabotages);
  });

  it("example: names", () => {
    expect(actionProofName("actions-rs/toolchain")).toMatch(/^actions-rs-toolchain-[0-9a-f]{8}$/);
    expect(actionProofName("Actions-RS/Toolchain")).toBe(actionProofName("actions-rs/toolchain"));
    expect(repoProofName("railwayapp/nixpacks")).toBe("nixpacks-actions");
  });
});
