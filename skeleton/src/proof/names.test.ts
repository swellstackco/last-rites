import { describe, expect, it } from "vitest";
import { PROOF_NAME_PATTERN, isProofName, parseProofReportPath, proofReportPath } from "./names.js";

describe("isProofName", () => {
  it("accepts valid names", () => {
    for (const n of ["parse-server", "intersect", "a", "0", "a".repeat(64)]) expect(isProofName(n)).toBe(true);
  });
  it("rejects invalid names", () => {
    for (const n of ["a".repeat(65), "Upper", ".", "..", "a/b", "", "-x", "%2e", "a.b", "a b", "a\n"]) {
      expect(isProofName(n), JSON.stringify(n)).toBe(false);
    }
  });
  it("exposes the pattern", () => {
    expect(PROOF_NAME_PATTERN.source).toBe("^[a-z0-9][a-z0-9-]{0,63}$");
  });
});

describe("proofReportPath / parseProofReportPath", () => {
  it("builds the path shape", () => {
    expect(proofReportPath("parse-server", "intersect")).toBe("demo/proofs/parse-server/intersect.json");
  });
  it("refuses bad names", () => {
    expect(proofReportPath("..", "x")).toBeUndefined();
    expect(proofReportPath("x", "a/b")).toBeUndefined();
    expect(proofReportPath("x", "@babel/core")).toBeUndefined();
  });
  it("parses its own output", () => {
    expect(parseProofReportPath("demo/proofs/parse-server/intersect.json")).toEqual({
      repo: "parse-server",
      package: "intersect",
    });
  });
  it("rejects other shapes", () => {
    for (const p of [
      "demo/proofs/a.json",
      "demo/proofs/a/b/c.json",
      "demo/proofs/../b.json",
      "demo/proofs/a/b.txt",
      "other/a/b.json",
      "demo/proofs/A/b.json",
      "demo/proofs//b.json",
    ]) {
      expect(parseProofReportPath(p), p).toBeUndefined();
    }
  });
});
