import { describe, it, expect } from "vitest";
import { resolveVersion } from "./version.js";

const doc = {
  "dist-tags": { latest: "2.0.0", next: "3.0.0-beta.1", stale: "9.9.9" },
  versions: { "1.0.0": {}, "1.5.0": {}, "2.0.0": {}, "3.0.0-beta.1": {}, "3.0.0-beta.2": {} },
};

describe("resolveVersion", () => {
  it("uses latest when no range is given", () => {
    expect(resolveVersion(doc)).toEqual({ kind: "resolved", version: "2.0.0" });
  });

  it("treats a whitespace-only range as no range", () => {
    expect(resolveVersion(doc, "   ")).toEqual({ kind: "resolved", version: "2.0.0" });
  });

  it("picks the highest satisfying version", () => {
    expect(resolveVersion(doc, "^1.0.0")).toEqual({ kind: "resolved", version: "1.5.0" });
  });

  it("includes pre-releases only when the range names a pre-release", () => {
    expect(resolveVersion(doc, ">=3.0.0")).toEqual({ kind: "no_match" });
    expect(resolveVersion(doc, ">=3.0.0-beta.1")).toEqual({ kind: "resolved", version: "3.0.0-beta.2" });
  });

  it("resolves dist-tag ranges", () => {
    expect(resolveVersion(doc, "latest")).toEqual({ kind: "resolved", version: "2.0.0" });
    expect(resolveVersion(doc, "next")).toEqual({ kind: "resolved", version: "3.0.0-beta.1" });
  });

  it("returns no_match for unmatched ranges, unknown tags and tags pointing nowhere", () => {
    expect(resolveVersion(doc, "^7.0.0")).toEqual({ kind: "no_match" });
    expect(resolveVersion(doc, "nonexistent")).toEqual({ kind: "no_match" });
    expect(resolveVersion(doc, "stale")).toEqual({ kind: "no_match" });
    expect(resolveVersion(doc, "__proto__")).toEqual({ kind: "no_match" });
  });

  it("returns none when latest is missing from versions or absent", () => {
    expect(resolveVersion({ "dist-tags": { latest: "5.0.0" }, versions: { "1.0.0": {} } })).toEqual({ kind: "none" });
    expect(resolveVersion({ versions: { "1.0.0": {} } })).toEqual({ kind: "none" });
    expect(resolveVersion({})).toEqual({ kind: "none" });
  });
});
