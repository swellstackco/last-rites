import { describe, it, expect } from "vitest";
import { REAL_PARTS } from "./pipeline.js";
import { assertPropertyAsync } from "../evidence/test-support/fc-runner.js";
import { runAgainstAsync, assertAllSabotagesCaughtAsync } from "../evidence/test-support/sabotage-runner.js";
import { property1 } from "./test-support/properties/scan-p1.js";
import { SCAN_P1_SABOTAGES } from "./test-support/sabotage/scan-p1.js";

/** build(parts) for the central sabotage test. */
export const build = property1.build;

// Feature: npm-scanner, Property 1: Determinism and completion-order independence
describe("Property 1: Determinism and completion-order independence", () => {
  it("holds for the real pipeline", async () => {
    await assertPropertyAsync(property1.name, build(REAL_PARTS));
  }, 60_000);

  it("every sabotage is caught", async () => {
    expect(await runAgainstAsync([property1], REAL_PARTS)).toEqual([]);
    await assertAllSabotagesCaughtAsync(property1.name, [property1], SCAN_P1_SABOTAGES);
  }, 120_000);
});
