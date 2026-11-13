import { describe, it, expect } from "vitest";
import { monthsSince } from "./months-since.js";
import { assertProperty } from "./test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import { property7 } from "./test-support/properties/months-since.js";
import { P7_SABOTAGES } from "./test-support/sabotage/p7.js";

// Feature: npm-evidence, Property 7: Months_Since counts whole calendar months
describe("Property 7: Months_Since counts whole calendar months", () => {
  it("holds for the real monthsSince", () => {
    assertProperty(property7.name, property7.build(monthsSince));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property7], monthsSince)).toEqual([]);
    assertAllSabotagesCaught(property7.name, [property7], P7_SABOTAGES);
  });

  it("Jan 31 to Feb 28 is 0 months (documented month-end rule)", () => {
    expect(monthsSince("2025-01-31T00:00:00Z", new Date("2025-02-28T00:00:00Z"))).toBe(0);
    expect(monthsSince("2025-01-31T00:00:00Z", new Date("2025-03-31T00:00:00Z"))).toBe(2);
  });
});
