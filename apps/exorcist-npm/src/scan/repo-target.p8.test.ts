import { describe, it, expect } from "vitest";
import { parseRepoTarget } from "./repo-target.js";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "../evidence/test-support/sabotage-runner.js";
import { property8 } from "./test-support/properties/scan-p8.js";
import { SCAN_P8_SABOTAGES } from "./test-support/sabotage/scan-p8.js";

/** build(impl) for the central sabotage test. */
export const build = property8.build;

// Feature: npm-scanner, Property 8: Repo target validation
describe("Property 8: Repo target validation", () => {
  it("holds for the real parseRepoTarget", () => {
    assertProperty(property8.name, build(parseRepoTarget));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property8], parseRepoTarget)).toEqual([]);
    assertAllSabotagesCaught(property8.name, [property8], SCAN_P8_SABOTAGES);
  });

  it("never throws on odd input", () => {
    expect(parseRepoTarget({ owner: 1, repo: null, ref: {} } as never).ok).toBe(false);
    expect(parseRepoTarget({ owner: "a", repo: "b", ref: 5 } as never)).toMatchObject({ ok: false, error: { code: "invalid_ref" } });
  });
});
