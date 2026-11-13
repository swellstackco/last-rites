import { describe, it, expect } from "vitest";
import { countOpenVulnsNoFix } from "./osv-count.js";
import { assertProperty } from "./test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import { property8 } from "./test-support/properties/osv-count.js";
import { P8_SABOTAGES } from "./test-support/sabotage/p8.js";

// Feature: npm-evidence, Property 8: Open-vulnerability count matches the unfixed-id model
describe("Property 8: Open-vulnerability count matches the unfixed-id model", () => {
  it("holds for the real countOpenVulnsNoFix", () => {
    assertProperty(property8.name, property8.build(countOpenVulnsNoFix));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property8], countOpenVulnsNoFix)).toEqual([]);
    assertAllSabotagesCaught(property8.name, [property8], P8_SABOTAGES);
  });

  it("examples: fixed, unfixed, last_affected and unmatched", () => {
    const npm = (name: string, events: object[]) => ({
      package: { ecosystem: "npm", name },
      ranges: [{ type: "SEMVER", events }],
    });
    expect(countOpenVulnsNoFix([], "p")).toBe(0);
    expect(countOpenVulnsNoFix([{ id: "A", affected: [npm("p", [{ introduced: "0" }, { fixed: "1" }])] }], "p")).toBe(0);
    expect(countOpenVulnsNoFix([{ id: "A", affected: [npm("p", [{ introduced: "0" }, { last_affected: "1" }])] }], "p")).toBe(1);
    expect(countOpenVulnsNoFix([{ id: "A" }], "p")).toBe(1);
    expect(countOpenVulnsNoFix([{ id: "A", affected: [npm("q", [{ fixed: "1" }])] }], "p")).toBe(1);
  });
});
