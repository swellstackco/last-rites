import { describe, it, expect } from "vitest";
import { cachePath } from "./cache.js";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, runAgainst } from "../test-support/sabotage-runner.js";
import { property9 } from "../test-support/properties/cache.js";
import { P9_SABOTAGES } from "../test-support/sabotage/p9.js";

// Feature: npm-evidence, Property 9: Cache keys map one-to-one to files
describe("Property 9: Cache keys map one-to-one to files", () => {
  it("holds for the real cachePath", () => {
    assertProperty(property9.name, property9.build(cachePath));
    expect(runAgainst([property9], cachePath)).toEqual([]);
  });

  it("every sabotage is caught", () => {
    assertAllSabotagesCaught(property9.name, [property9], P9_SABOTAGES);
  });
});
