import { describe, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { exorciseProperties, realExorciseImpl, type ExorciseImpl } from "../test-support/properties/actions-p13.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { sabotages } from "../test-support/sabotage/actions-p13.js";

/** Property 13 over a swappable implementation, for the central sabotage test. */
export async function build(impl: ExorciseImpl = realExorciseImpl): Promise<void> {
  for (const p of exorciseProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 13: argument parsers, exit codes and write confinement", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P13", exorciseProperties, sabotages);
  });
});
