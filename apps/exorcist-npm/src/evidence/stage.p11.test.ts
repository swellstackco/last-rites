import { describe, it } from "vitest";
import { assertPropertyAsync } from "./test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync } from "./test-support/sabotage-runner.js";
import { property11 } from "./test-support/properties/stage.js";
import { realStage } from "./test-support/stage-harness.js";
import { P11_SABOTAGES } from "./test-support/sabotage/p11.js";

// Feature: npm-evidence, Property 11: The GitHub token is confined to GitHub requests and never persisted
describe("Property 11: The GitHub token is confined to GitHub requests and never persisted", () => {
  it("holds for the real stage", async () => {
    await assertPropertyAsync(property11.name, property11.build(realStage));
  }, 120000);

  it("every sabotage is caught", async () => {
    await assertAllSabotagesCaughtAsync(property11.name, [property11], P11_SABOTAGES);
  }, 120000);
});
