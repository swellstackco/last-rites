import { describe, it, expect } from "vitest";
import { monthsSince } from "./months-since.js";
import { assertProperty } from "./test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import { property6 } from "./test-support/properties/months-since.js";
import { P6_SABOTAGES } from "./test-support/sabotage/p6.js";

// Feature: npm-evidence, Property 6: Months_Since is non-negative and monotone in Now
describe("Property 6: Months_Since is non-negative and monotone in Now", () => {
  it("holds for the real monthsSince", () => {
    assertProperty(property6.name, property6.build(monthsSince));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property6], monthsSince)).toEqual([]);
    assertAllSabotagesCaught(property6.name, [property6], P6_SABOTAGES);
  });

  it("returns undefined for an unparseable timestamp", () => {
    expect(monthsSince("not a date", new Date("2026-01-01T00:00:00Z"))).toBeUndefined();
    expect(monthsSince("2021-02-30T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBeUndefined();
  });
});
