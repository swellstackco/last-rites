import fc from "fast-check";
import { buildGraveyard } from "../../build-graveyard.js";
import { GRADE_ORDER } from "../../grade-order.js";
import type { GraveRecord } from "../../types.js";
import { graveRecordsArb } from "../arbitraries.js";
import { ensure } from "../sabotage-runner.js";
import type { BuildGraveyardFn } from "./p1.js";

/** Code-unit sequence of a string, written independently of the implementation. */
function units(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

function compareUnits(a: string, b: string): number {
  const x = units(a);
  const y = units(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i]! !== y[i]!) return x[i]! - y[i]!;
  }
  return x.length - y.length;
}

interface Item {
  record: GraveRecord;
  index: number;
}

/** Band, then score descending, then name by code unit, then input index. */
export function referenceCompare(a: Item, b: Item): number {
  const band = GRADE_ORDER.indexOf(a.record.death.grade) - GRADE_ORDER.indexOf(b.record.death.grade);
  if (band !== 0) return band;
  const score = b.record.death.score - a.record.death.score;
  if (score !== 0) return score;
  const name = compareUnits(a.record.name, b.record.name);
  if (name !== 0) return name;
  return a.index - b.index;
}

function order(view: ReturnType<typeof buildGraveyard>): string[] {
  return view.groups.flatMap((g) => g.graves.map((x) => `${x.key}|${x.record.death.score}`));
}

function permute<T>(items: readonly T[], picks: readonly number[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (picks[i % picks.length] ?? 0) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Property 2: ordering is band, score descending, name, input position; deterministic. */
export function build(impl: BuildGraveyardFn = buildGraveyard): fc.IPropertyWithHooks<[GraveRecord[], number[]]> {
  return fc.property(
    graveRecordsArb,
    fc.array(fc.nat(), { minLength: 1, maxLength: 60 }),
    (records, picks) => {
      const view = impl(records);

      const expected = records
        .map((record, index): Item => ({ record, index }))
        .sort(referenceCompare)
        .map((x) => x.index);
      const actual = view.groups.flatMap((g) => g.graves.map((x) => x.index));
      ensure(
        JSON.stringify(actual) === JSON.stringify(expected),
        `order of input positions was [${actual.join(",")}], expected [${expected.join(",")}]`,
      );

      // Two calls give deep-equal results.
      const again = impl(JSON.parse(JSON.stringify(records)) as GraveRecord[]);
      ensure(JSON.stringify(again) === JSON.stringify(view), "a call on a deep-equal copy must give a deep-equal view");

      // With distinct names, shuffling the input does not change the order.
      const seen = new Set<string>();
      const distinct = records.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
      const a = order(impl(distinct));
      const b = order(impl(permute(distinct, picks)));
      ensure(JSON.stringify(a) === JSON.stringify(b), "shuffling distinct-name input must not change the order");
    },
  );
}
