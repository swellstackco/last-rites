import { describe, it } from "vitest";
import { assertPropertyAsync } from "./test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync } from "./test-support/sabotage-runner.js";
import { property3 } from "./test-support/properties/stage.js";
import { realStage } from "./test-support/stage-harness.js";
import { P3_SABOTAGES } from "./test-support/sabotage/p3.js";

// Feature: npm-evidence, Property 3: Failure isolation
describe("Property 3: Failure isolation", () => {
  it("holds for the real stage", async () => {
    await assertPropertyAsync(property3.name, property3.build(realStage));
  }, 120000);

  it("every sabotage is caught", async () => {
    await assertAllSabotagesCaughtAsync(property3.name, [property3], P3_SABOTAGES);
  }, 120000);
});
