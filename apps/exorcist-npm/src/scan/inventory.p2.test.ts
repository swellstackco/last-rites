import { describe, it, expect } from "vitest";
import { inventory } from "./inventory.js";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "../evidence/test-support/sabotage-runner.js";
import { property2 } from "./test-support/properties/scan-p2.js";
import { SCAN_P2_SABOTAGES } from "./test-support/sabotage/scan-p2.js";

/** build(impl) for the central sabotage test. */
export const build = property2.build;

// Feature: npm-scanner, Property 2: Inventory completeness and partition
describe("Property 2: Inventory completeness and partition", () => {
  it("holds for the real inventory", () => {
    assertProperty(property2.name, build(inventory));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property2], inventory)).toEqual([]);
    assertAllSabotagesCaught(property2.name, [property2], SCAN_P2_SABOTAGES);
  });
});
