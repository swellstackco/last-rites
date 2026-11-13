import fc from "fast-check";
import { buildGraveyard } from "../../build-graveyard.js";
import { GRADE_ORDER } from "../../grade-order.js";
import { graveRecordsArb } from "../arbitraries.js";
import { ensure } from "../sabotage-runner.js";
import type { GraveRecord } from "../../types.js";

export type BuildGraveyardFn = typeof buildGraveyard;

/**
 * Property 1: grouping is a partition.
 * `impl` is the function under test; the real one by default.
 */
export function build(impl: BuildGraveyardFn = buildGraveyard): fc.IPropertyWithHooks<[GraveRecord[]]> {
  return fc.property(graveRecordsArb, (records) => {
    const snapshot = JSON.stringify(records);
    const before = [...records];

    const view = impl(records);

    ensure(view.groups.length === 4, "view must have four groups");
    view.groups.forEach((g, i) => {
      ensure(g.grade === GRADE_ORDER[i], `group ${i} must be ${GRADE_ORDER[i]}, got ${g.grade}`);
    });

    // Every input position appears exactly once across the groups.
    const seen: number[] = [];
    for (const g of view.groups) {
      for (const grave of g.graves) {
        seen.push(grave.index);
        ensure(
          grave.record === records[grave.index],
          `grave at index ${grave.index} must carry the input record`,
        );
        ensure(
          grave.record.death.grade === g.grade,
          `record ${grave.record.name} (grade ${grave.record.death.grade}) sits in group ${g.grade}`,
        );
      }
    }
    seen.sort((a, b) => a - b);
    ensure(
      seen.length === records.length && seen.every((v, i) => v === i),
      `positions across groups must be 0..${records.length - 1} once each, got [${seen.join(",")}]`,
    );

    // Keys are unique; the first record of a name has key === name.
    const keys = view.groups.flatMap((g) => g.graves.map((x) => x.key));
    ensure(new Set(keys).size === keys.length, "keys must be unique");
    const firstOfName = new Map<string, number>();
    records.forEach((r, i) => {
      if (!firstOfName.has(r.name)) firstOfName.set(r.name, i);
    });
    for (const g of view.groups) {
      for (const grave of g.graves) {
        if (firstOfName.get(grave.record.name) === grave.index) {
          ensure(grave.key === grave.record.name, `first record of "${grave.record.name}" must have key === name`);
        } else {
          ensure(grave.key !== grave.record.name, `later record of "${grave.record.name}" must have a suffixed key`);
        }
      }
    }

    // total is the input length; the input is unchanged.
    ensure(view.total === records.length, `total ${view.total} must equal ${records.length}`);
    ensure(
      before.length === records.length && before.every((r, i) => r === records[i]),
      "input array must not be reordered or changed",
    );
    ensure(JSON.stringify(records) === snapshot, "input records must not be mutated");
  });
}
