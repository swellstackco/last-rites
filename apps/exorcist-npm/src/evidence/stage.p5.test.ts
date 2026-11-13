import { describe, it } from "vitest";
import { assertPropertyAsync } from "./test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync } from "./test-support/sabotage-runner.js";
import { property5 } from "./test-support/properties/stage.js";
import { realStage } from "./test-support/stage-harness.js";
import { P5_SABOTAGES } from "./test-support/sabotage/p5.js";

// Feature: npm-evidence, Property 5: Determinism and dependence on the injected Now only
describe("Property 5: Determinism and dependence on the injected Now only", () => {
  it("holds for the real stage", async () => {
    await assertPropertyAsync(property5.name, property5.build(realStage));
  }, 180000);

  it("every sabotage is caught", async () => {
    await assertAllSabotagesCaughtAsync(property5.name, [property5], P5_SABOTAGES);
  }, 180000);
});
