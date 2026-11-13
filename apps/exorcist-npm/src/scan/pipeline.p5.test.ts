import { describe, it, expect } from "vitest";
import { REAL_PARTS } from "./pipeline.js";
import { assertPropertyAsync } from "../evidence/test-support/fc-runner.js";
import { runAgainstAsync, assertAllSabotagesCaughtAsync } from "../evidence/test-support/sabotage-runner.js";
import { property5 } from "./test-support/properties/scan-p5.js";
import { SCAN_P5_SABOTAGES } from "./test-support/sabotage/scan-p5.js";

/** build(parts) for the central sabotage test. */
export const build = property5.build;

// Feature: npm-scanner, Property 5: Failure isolation
describe("Property 5: Failure isolation", () => {
  it("holds for the real pipeline", async () => {
    await assertPropertyAsync(property5.name, build(REAL_PARTS));
  }, 60_000);

  it("every sabotage is caught", async () => {
    expect(await runAgainstAsync([property5], REAL_PARTS)).toEqual([]);
    await assertAllSabotagesCaughtAsync(property5.name, [property5], SCAN_P5_SABOTAGES);
  }, 120_000);
});
