import { GRADE_ORDER } from "../../grade-order.js";
import type { GradeBand } from "../../../death-score/index.js";
import type { GradeGroup, Grave, GraveRecord, GraveyardView } from "../../types.js";
import type { BuildGraveyardFn } from "../properties/p1.js";
import type { Sabotage } from "../sabotage-runner.js";

type Cmp = (a: Grave<GraveRecord>, b: Grave<GraveRecord>) => number;

function codeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build a view with a custom comparator and group order. */
function viewWith(
  order: readonly GradeBand[],
  cmp: Cmp,
): BuildGraveyardFn {
  return (records) => {
    const buckets: Record<GradeBand, Grave<(typeof records)[number]>[]> = { dead: [], dying: [], ailing: [], alive: [] };
    const seen = new Map<string, number>();
    records.forEach((record, index) => {
      const n = (seen.get(record.name) ?? 0) + 1;
      seen.set(record.name, n);
      buckets[record.death.grade].push({ key: n === 1 ? record.name : `${record.name}#${n}`, index, record });
    });
    const groups = order.map((grade): GradeGroup<(typeof records)[number]> => {
      const graves = buckets[grade].sort(cmp);
      return { grade, graves, count: graves.length, defaultCollapsed: grade === "alive" };
    });
    return {
      groups: groups as GraveyardView<(typeof records)[number]>["groups"],
      counts: {
        dead: buckets.dead.length,
        dying: buckets.dying.length,
        ailing: buckets.ailing.length,
        alive: buckets.alive.length,
      },
      total: records.length,
    };
  };
}

const score = (a: Grave<GraveRecord>, b: Grave<GraveRecord>) => b.record.death.score - a.record.death.score;
const name = (a: Grave<GraveRecord>, b: Grave<GraveRecord>) => codeUnit(a.record.name, b.record.name);
const idx = (a: Grave<GraveRecord>, b: Grave<GraveRecord>) => a.index - b.index;
const then = (...cs: Cmp[]): Cmp => (a, b) => {
  for (const c of cs) {
    const r = c(a, b);
    if (r !== 0) return r;
  }
  return 0;
};

const REVERSED = [...GRADE_ORDER].reverse();

export const P2_SABOTAGES: readonly Sabotage<BuildGraveyardFn>[] = [
  { name: "score ascending", impl: viewWith(GRADE_ORDER, then((a, b) => -score(a, b), name, idx)) },
  { name: "no name tiebreak (input order only)", impl: viewWith(GRADE_ORDER, then(score, idx)) },
  { name: "band order reversed (alive first)", impl: viewWith(REVERSED, then(score, name, idx)) },
  { name: "name before score", impl: viewWith(GRADE_ORDER, then(name, score, idx)) },
  {
    name: "localeCompare for names",
    impl: viewWith(GRADE_ORDER, then(score, (a, b) => a.record.name.localeCompare(b.record.name), idx)),
  },
  {
    name: "score compared as a string",
    impl: viewWith(
      GRADE_ORDER,
      then((a, b) => (String(a.record.death.score) < String(b.record.death.score) ? 1 : String(a.record.death.score) > String(b.record.death.score) ? -1 : 0), name, idx),
    ),
  },
  { name: "Math.random tiebreak", impl: viewWith(GRADE_ORDER, then(score, name, () => Math.random() - 0.5)) },
  { name: "name descending", impl: viewWith(GRADE_ORDER, then(score, (a, b) => -name(a, b), idx)) },
];
