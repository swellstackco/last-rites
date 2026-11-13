import fc from "fast-check";
import { buildGraveyard } from "../../build-graveyard.js";
import { GRADE_ORDER } from "../../grade-order.js";
import type { GraveRecord } from "../../types.js";
import { graveRecordsArb } from "../arbitraries.js";
import { ensure } from "../sabotage-runner.js";
import type { BuildGraveyardFn } from "./p1.js";

/**
 * Property 4 (view-model half): counts equal group sizes, equal an independent
 * recount by `death.grade`, and sum to `total`. The header half lives in the page.
 */
export function build(impl: BuildGraveyardFn = buildGraveyard): fc.IPropertyWithHooks<[GraveRecord[]]> {
  return fc.property(graveRecordsArb, (records) => {
    const view = impl(records);
    let sum = 0;
    view.groups.forEach((g, i) => {
      const grade = GRADE_ORDER[i]!;
      const recount = records.filter((r) => r.death.grade === grade).length;
      ensure(view.counts[grade] === g.graves.length, `counts.${grade} ${view.counts[grade]} must equal group size ${g.graves.length}`);
      ensure(view.counts[grade] === recount, `counts.${grade} ${view.counts[grade]} must equal recount ${recount}`);
      sum += view.counts[grade];
    });
    ensure(view.total === records.length, `total ${view.total} must equal ${records.length}`);
    ensure(sum === view.total, `counts sum ${sum} must equal total ${view.total}`);
  });
}
