import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { reportArb } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_NEW_DEAD, type NewDead } from "../test-support/validators.js";
import { KIRO_P10_SABOTAGES } from "../test-support/sabotage/kiro-p10.js";

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const isSortedUnique = (a: readonly string[]): boolean => a.every((x, i) => i === 0 || a[i - 1]! < x);

export const name = "Property 10: New dead packages";

export function build(impl: NewDead) {
  return fc.property(
    reportArb,
    fc.array(fc.string({ maxLength: 6 }), { maxLength: 6 }),
    fc.infiniteStream(fc.boolean()),
    fc.boolean(),
    (report, extra, picks, shuffle) => {
      const dead = [...new Set(report.dependencies.filter((d) => d.death.grade === "dead").map((d) => d.name))].sort();
      const got = impl.deadNames(report);
      if (!sameList(got, dead)) throw new Error(`deadNames ${JSON.stringify(got)}, expected ${JSON.stringify(dead)}`);
      if (!isSortedUnique(got)) throw new Error("deadNames not sorted or has duplicates");

      // baseline: a subset of the dead names, plus unrelated names (case variants included), duplicated and maybe reversed
      const subset = dead.filter(() => picks.next().value as boolean);
      const caseVariants = dead.map((n) => n.toUpperCase()).filter((n) => !dead.includes(n));
      let baseline = [...subset, ...subset, ...extra, ...caseVariants];
      if (shuffle) baseline = baseline.reverse();

      const expected = dead.filter((n) => !baseline.includes(n));
      const fresh = impl.newDeadPackages(baseline, report);
      if (!sameList(fresh, expected)) throw new Error(`newDeadPackages ${JSON.stringify(fresh)}, expected ${JSON.stringify(expected)}`);
      if (!fresh.every((n) => dead.includes(n))) throw new Error("not a subset of deadNames");

      if (impl.newDeadPackages(got, report).length !== 0) throw new Error("baseline of all dead names still reports");
      const updated = impl.newDeadPackages(fresh.concat(baseline), report);
      if (updated.length !== 0) throw new Error(`not idempotent after the baseline update: ${JSON.stringify(updated)}`);

      // a dying (or any non-dead) package is never reported
      const nonDead = new Set(report.dependencies.filter((d) => d.death.grade !== "dead").map((d) => d.name));
      for (const n of fresh) if (!dead.includes(n) && nonDead.has(n)) throw new Error(`non-dead ${n} reported`);
      return true;
    },
  );
}

export const property10: NamedProperty<NewDead> = { name, build };

describe("Property 10: New dead packages", () => {
  it("holds for the real helpers", () => {
    assertProperty(name, build(REAL_NEW_DEAD));
  });

  it("every sabotage is caught", () => {
    expect(KIRO_P10_SABOTAGES.length).toBeGreaterThan(0);
    assertAllSabotagesCaught(name, [property10], KIRO_P10_SABOTAGES);
  });
});

describe("new dead packages: examples", () => {
  const dep = (n: string, grade: string, score = 0) => ({ name: n, death: { grade, score } });
  const report = { dependencies: [dep("b", "dead", 90), dep("a", "dead", 95), dep("c", "dying"), dep("B", "dead"), dep("a", "dead")] } as never;

  it("sorts by code unit, drops duplicates and ignores dying", () => {
    expect(REAL_NEW_DEAD.deadNames(report)).toEqual(["B", "a", "b"]);
    expect(REAL_NEW_DEAD.newDeadPackages(["a"], report)).toEqual(["B", "b"]);
    expect(REAL_NEW_DEAD.newDeadPackages([], { dependencies: [] })).toEqual([]);
  });
});
