import { describe, expect, it } from "vitest";
import { formatUses, isSha, parseUses } from "./uses.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { realUsesImpl, usesProperties, urlProblem, type UsesImpl } from "../test-support/properties/actions-p2.js";

/** Property 2 over a swappable implementation, for the central sabotage test. */
export async function build(impl: UsesImpl = realUsesImpl): Promise<void> {
  for (const p of usesProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 2: the Uses_String grammar and the URL guards", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("examples", () => {
    expect(parseUses("actions/checkout@v4")).toEqual({
      kind: "action",
      owner: "actions",
      repo: "checkout",
      ref: "v4",
      refKind: "mutable",
    });
    expect(parseUses("a/b/c/d@" + "a".repeat(40))).toMatchObject({ path: "c/d", refKind: "sha" });
    expect(parseUses("a/b@" + "A".repeat(40))).toMatchObject({ refKind: "sha" });
    expect(parseUses("a/b@" + "a".repeat(39))).toMatchObject({ refKind: "mutable" });
    expect(parseUses("docker://x@y")).toEqual({ kind: "skip", reason: "docker" });
    expect(parseUses("./local@x")).toEqual({ kind: "skip", reason: "local" });
    expect(parseUses("a/b")).toEqual({ kind: "skip", reason: "no_ref" });
    expect(parseUses("a/b@${{ x }}")).toEqual({ kind: "skip", reason: "malformed" });
    expect(parseUses("a/b/../c@v1")).toEqual({ kind: "skip", reason: "malformed" });
    expect(formatUses({ owner: "a", repo: "b", path: "c", ref: "v1" })).toBe("a/b/c@v1");
    expect(isSha("a".repeat(40))).toBe(true);
  });

  it("rejects a dot-segment ref, so no URL can be normalized", () => {
    for (const ref of [".", "..", "a/../b", "a/./b", "../.."]) {
      expect(parseUses(`a/b@${ref}`)).toEqual({ kind: "skip", reason: "malformed" });
    }
    expect(parseUses("a/b@release/v1.0")).toMatchObject({ kind: "action", ref: "release/v1.0" });
  });
});
