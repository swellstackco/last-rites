import { describe, it, expect } from "vitest";
import { parseRepoUrl } from "./repo-url.js";
import { assertProperty } from "./test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "./test-support/sabotage-runner.js";
import { property1 } from "./test-support/properties/repo-url.js";
import { P1_SABOTAGES } from "./test-support/sabotage/p1.js";

// Feature: npm-evidence, Property 1: Every GitHub URL form maps to the same Repo_Ref
describe("Property 1: Every GitHub URL form maps to the same Repo_Ref", () => {
  it("holds for the real parseRepoUrl", () => {
    assertProperty(property1.name, property1.build(parseRepoUrl));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property1], parseRepoUrl)).toEqual([]);
    assertAllSabotagesCaught(property1.name, [property1], P1_SABOTAGES);
  });

  it("parses the common npm forms", () => {
    const want = { owner: "facebook", repo: "react" };
    expect(parseRepoUrl("git+https://github.com/facebook/react.git")).toEqual(want);
    expect(parseRepoUrl({ type: "git", url: "git://github.com/facebook/react.git", directory: "packages/x" })).toEqual(want);
    expect(parseRepoUrl("github:facebook/react")).toEqual(want);
    expect(parseRepoUrl("facebook/react")).toEqual(want);
    expect(parseRepoUrl("git@github.com:facebook/react.git")).toEqual(want);
  });
});
