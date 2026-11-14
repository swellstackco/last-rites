// toe-tag-polish 1.2: the new generators produce what the properties assume. Node, no network.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isProofName, parseProofReport, serializeProofReport } from "@last-rites/skeleton/proof";
import { MAX_TOMBSTONE_TEXT } from "./constants.js";
import { demoPackageArb, packageNameArb, proofLoadArb, snapshotSetArb } from "./test-support/arbitraries.js";

describe("toe-tag-polish generators", () => {
  it("demoPackageArb: the opened package has the requested grade and a valid Proof_Name", () => {
    const grades = new Set<string>();
    for (const c of fc.sample(demoPackageArb, { numRuns: 200, seed: 1 })) {
      const dep = c.report.dependencies.find((d) => d.name === c.name);
      expect(dep?.death.grade).toBe(c.grade);
      expect(isProofName(c.name)).toBe(true);
      expect(new Set(c.report.dependencies.map((d) => d.name)).size).toBe(c.report.dependencies.length);
      grades.add(c.grade);
    }
    expect([...grades].sort()).toEqual(["ailing", "alive", "dead", "dying"]);
  });

  it("proofLoadArb: every generated proof text parses; all states and orders occur", () => {
    const kinds = new Set<string>();
    const orders = new Set<string>();
    for (const d of fc.sample(proofLoadArb, { numRuns: 300, seed: 1 })) {
      kinds.add(d.load.kind);
      orders.add(d.order);
      if (d.load.kind === "report") expect(parseProofReport(serializeProofReport(d.load.report)).ok).toBe(true);
    }
    expect([...kinds].sort()).toEqual(["absent", "failed", "invalid", "report"]);
    expect([...orders].sort()).toEqual(["after", "before"]);
  });

  it("packageNameArb: names are within the cut limit and cover scoped, separator-free and hostile names", () => {
    const names = fc.sample(packageNameArb, { numRuns: 600, seed: 1 });
    expect(names.every((n) => n.length > 0 && n.length <= MAX_TOMBSTONE_TEXT)).toBe(true);
    expect(names).toContain("@scope/a-47-character-scoped-package-name-xxxxx");
    expect("@scope/a-47-character-scoped-package-name-xxxxx".length).toBe(47);
    expect(names.some((n) => !/[/-]/.test(n))).toBe(true);
    expect(names.some((n) => n.includes("<"))).toBe(true);
  });

  it("snapshotSetArb: four snapshots, a permutation of 0..3", () => {
    for (const s of fc.sample(snapshotSetArb, { numRuns: 50, seed: 1 })) {
      expect(s.snapshots).toHaveLength(4);
      expect([...s.order].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});
