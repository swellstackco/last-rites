import { describe, it, expect } from "vitest";
import { parseRepoUrl } from "./repo-url.js";
import { assertProperty } from "./test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import { property2 } from "./test-support/properties/repo-url.js";
import { P2_SABOTAGES } from "./test-support/sabotage/p2.js";

// Feature: npm-evidence, Property 2: Non-GitHub and invalid values map to no Repo_Ref and never throw
describe("Property 2: Non-GitHub and invalid values map to no Repo_Ref and never throw", () => {
  it("holds for the real parseRepoUrl", () => {
    assertProperty(property2.name, property2.build(parseRepoUrl));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property2], parseRepoUrl)).toEqual([]);
    assertAllSabotagesCaught(property2.name, [property2], P2_SABOTAGES);
  });

  it("rejects other hosts, shorthands and dot names", () => {
    expect(parseRepoUrl("https://gitlab.com/o/r")).toBeUndefined();
    expect(parseRepoUrl("gitlab:o/r")).toBeUndefined();
    expect(parseRepoUrl("o/..")).toBeUndefined();
    expect(parseRepoUrl("o/.")).toBeUndefined();
    expect(parseRepoUrl(undefined)).toBeUndefined();
  });
});
