import { describe, it, expect } from "vitest";
import { createLocalRepoFiles } from "./local-files.js";
import { memoryProbe } from "./test-support/fakes.js";

const T = { owner: "local", repo: "x", ref: "HEAD" };

describe("createLocalRepoFiles", () => {
  it("reads both files when present", async () => {
    const files = createLocalRepoFiles(memoryProbe({ "/c/package.json": "P", "/c/package-lock.json": "L" }), "/c");
    expect(await files(T, "package.json")).toEqual({ kind: "ok", text: "P" });
    expect(await files(T, "package-lock.json")).toEqual({ kind: "ok", text: "L" });
  });

  it("reports an absent lockfile and an absent manifest as not_found", async () => {
    const files = createLocalRepoFiles(memoryProbe({ "/c/package.json": "P" }), "/c");
    expect(await files(T, "package-lock.json")).toEqual({ kind: "not_found" });
    const none = createLocalRepoFiles(memoryProbe({}), "/c");
    expect(await none(T, "package.json")).toEqual({ kind: "not_found" });
  });

  it("ignores the target", async () => {
    const files = createLocalRepoFiles(memoryProbe({ "/c/package.json": "P" }), "/c");
    expect(await files({ owner: "a", repo: "b", ref: "v1" }, "package.json")).toEqual(await files(T, "package.json"));
  });
});
