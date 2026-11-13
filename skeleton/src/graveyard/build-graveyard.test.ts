import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHT_CONFIG, scoreDeath } from "../death-score/index.js";
import type { DeathScoreResult } from "../death-score/index.js";
import { buildGraveyard } from "./build-graveyard.js";
import type { GraveRecord } from "./types.js";
import { toGrade } from "../death-score/index.js";

const real = scoreDeath(
  {
    deprecated: { kind: "known", value: false },
    repoArchived: { kind: "known", value: false },
    monthsSinceLastPublish: { kind: "known", value: 0 },
    monthsSinceLastCommit: { kind: "known", value: 0 },
    maintainerCount: { kind: "known", value: 5 },
    openVulnsNoFix: { kind: "known", value: 0 },
    knownReplacementExists: { kind: "known", value: false },
  },
  DEFAULT_WEIGHT_CONFIG,
);

function rec(name: string, score: number): GraveRecord {
  const death: DeathScoreResult = { ...real, score, grade: toGrade(score) };
  return { name, death };
}

const names = (v: ReturnType<typeof buildGraveyard>, i: number) => v.groups[i]!.graves.map((g) => g.record.name);

describe("buildGraveyard", () => {
  it("returns four empty groups for empty input", () => {
    const v = buildGraveyard([]);
    expect(v.groups.map((g) => g.grade)).toEqual(["dead", "dying", "ailing", "alive"]);
    expect(v.groups.every((g) => g.graves.length === 0 && g.count === 0)).toBe(true);
    expect(v.counts).toEqual({ dead: 0, dying: 0, ailing: 0, alive: 0 });
    expect(v.total).toBe(0);
  });

  it("orders by score descending, then name", () => {
    const v = buildGraveyard([rec("b", 80), rec("a", 80), rec("c", 90), rec("d", 76)]);
    expect(names(v, 0)).toEqual(["c", "a", "b", "d"]);
  });

  it("orders names by UTF-16 code unit", () => {
    const v = buildGraveyard([rec("a", 80), rec("é", 80), rec("Z", 80), rec("A", 80)]);
    expect(names(v, 0)).toEqual(["A", "Z", "a", "é"]);
  });

  it("suffixes duplicate names and keeps input order", () => {
    const v = buildGraveyard([rec("x", 80), rec("x", 80), rec("x", 80), rec("y", 80)]);
    expect(v.groups[0]!.graves.map((g) => [g.key, g.index])).toEqual([
      ["x", 0],
      ["x#2", 1],
      ["x#3", 2],
      ["y", 3],
    ]);
  });

  it("puts boundary scores in the right groups", () => {
    const v = buildGraveyard([75, 74, 50, 49, 25, 24].map((s) => rec(`p${s}`, s)));
    expect(names(v, 0)).toEqual(["p75"]);
    expect(names(v, 1)).toEqual(["p74", "p50"]);
    expect(names(v, 2)).toEqual(["p49", "p25"]);
    expect(names(v, 3)).toEqual(["p24"]);
    expect(v.counts).toEqual({ dead: 1, dying: 2, ailing: 2, alive: 1 });
    expect(v.total).toBe(6);
  });

  it("collapses only alive by default", () => {
    const v = buildGraveyard([]);
    expect(v.groups.map((g) => g.defaultCollapsed)).toEqual([false, false, false, true]);
  });

  it("does not mutate the input", () => {
    const input = [rec("b", 10), rec("a", 90), rec("c", 50)];
    const before = JSON.stringify(input);
    const copy = [...input];
    buildGraveyard(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(input).toEqual(copy);
    expect(input.map((r) => r.name)).toEqual(["b", "a", "c"]);
  });
});
