import { describe, it, expect } from "vitest";
import { REAL_PARTS } from "./pipeline.js";
import { assertPropertyAsync } from "../evidence/test-support/fc-runner.js";
import { runAgainstAsync, assertAllSabotagesCaughtAsync } from "../evidence/test-support/sabotage-runner.js";
import { property4 } from "./test-support/properties/scan-p4.js";
import { SCAN_P4_SABOTAGES } from "./test-support/sabotage/scan-p4.js";

/** build(parts) for the central sabotage test. */
export const build = property4.build;

// Feature: npm-scanner, Property 4: Sort order, summary counts and scoring
describe("Property 4: Sort order, summary counts and scoring", () => {
  it("holds for the real pipeline", async () => {
    await assertPropertyAsync(property4.name, build(REAL_PARTS));
  }, 60_000);

  it("every sabotage is caught", async () => {
    expect(await runAgainstAsync([property4], REAL_PARTS)).toEqual([]);
    await assertAllSabotagesCaughtAsync(property4.name, [property4], SCAN_P4_SABOTAGES);
  }, 120_000);
});
