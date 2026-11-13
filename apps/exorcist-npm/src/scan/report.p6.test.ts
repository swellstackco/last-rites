import { describe, it, expect } from "vitest";
import { REAL_CODEC } from "./report.js";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "../evidence/test-support/sabotage-runner.js";
import { property6 } from "./test-support/properties/scan-p6.js";
import { SCAN_P6_SABOTAGES } from "./test-support/sabotage/scan-p6.js";

/** build(codec) for the central sabotage test. */
export const build = property6.build;

// Feature: npm-scanner, Property 6: Canonical_Json round trip and strictness
describe("Property 6: Canonical_Json round trip and strictness", () => {
  it("holds for the real codec", () => {
    assertProperty(property6.name, build(REAL_CODEC));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property6], REAL_CODEC)).toEqual([]);
    assertAllSabotagesCaught(property6.name, [property6], SCAN_P6_SABOTAGES);
  });
});
