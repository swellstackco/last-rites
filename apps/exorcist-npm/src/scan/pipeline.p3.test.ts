import { describe, it, expect } from "vitest";
import { REAL_PARTS } from "./pipeline.js";
import { assertPropertyAsync } from "../evidence/test-support/fc-runner.js";
import { runAgainstAsync, assertAllSabotagesCaughtAsync } from "../evidence/test-support/sabotage-runner.js";
import { property3 } from "./test-support/properties/scan-p3.js";
import { SCAN_P3_SABOTAGES } from "./test-support/sabotage/scan-p3.js";

/** build(parts) for the central sabotage test. */
export const build = property3.build;

// Feature: npm-scanner, Property 3: Lockfile precedence and what the evidence stage receives
describe("Property 3: Lockfile precedence and what the evidence stage receives", () => {
  it("holds for the real pipeline", async () => {
    await assertPropertyAsync(property3.name, build(REAL_PARTS));
  }, 60_000);

  it("every sabotage is caught", async () => {
    expect(await runAgainstAsync([property3], REAL_PARTS)).toEqual([]);
    await assertAllSabotagesCaughtAsync(property3.name, [property3], SCAN_P3_SABOTAGES);
  }, 120_000);
});
