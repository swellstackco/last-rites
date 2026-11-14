import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { realSabotageImpl, sabotageProperties, type SabotageImpl } from "../test-support/properties/actions-p10.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { sabotages } from "../test-support/sabotage/actions-p10.js";
import { runSabotage } from "./mutants.js";

/** Property 10 over a swappable implementation, for the central sabotage test. */
export async function build(impl: SabotageImpl = realSabotageImpl): Promise<void> {
  for (const p of sabotageProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 10: sabotage accounting and the weak rule", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P10", sabotageProperties, sabotages);
  });

  it("example: no mutants gives zeros", () => {
    expect(runSabotage("pin", 1, () => true, [])).toEqual({ applied: 0, caught: 0, survivors: [] });
  });
});
