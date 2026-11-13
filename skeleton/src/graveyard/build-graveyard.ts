import type { GradeBand } from "../death-score/index.js";
import { GRADE_ORDER } from "./grade-order.js";
import type { GradeGroup, Grave, GraveRecord, GraveyardView } from "./types.js";

/** Score descending, then name ascending in UTF-16 code-unit order, then input index ascending. */
export function compareGraves(a: Grave<GraveRecord>, b: Grave<GraveRecord>): number {
  const byScore = b.record.death.score - a.record.death.score;
  if (byScore !== 0) return byScore;
  const an = a.record.name;
  const bn = b.record.name;
  if (an < bn) return -1;
  if (an > bn) return 1;
  return a.index - b.index;
}

export function buildGraveyard<T extends GraveRecord>(records: readonly T[]): GraveyardView<T> {
  const names = new Set<string>(records.map((r) => r.name));
  const used = new Set<string>();
  const seen = new Map<string, number>();
  const buckets: Record<GradeBand, Grave<T>[]> = { dead: [], dying: [], ailing: [], alive: [] };
  // Reserve every first-of-name key (the name itself) so a suffixed key can never collide with it.
  for (const r of records) if (!used.has(r.name)) used.add(r.name);
  records.forEach((record, index) => {
    const n = (seen.get(record.name) ?? 0) + 1;
    seen.set(record.name, n);
    let key = record.name;
    if (n > 1) {
      // `<name>#<n>`; if that equals another record's name or key (e.g. a record named "a#2"), bump n.
      let k = n;
      key = `${record.name}#${k}`;
      while (used.has(key) || names.has(key)) key = `${record.name}#${++k}`;
      used.add(key);
    }
    buckets[record.death.grade].push({ key, index, record });
  });
  const group = (grade: GradeBand): GradeGroup<T> => {
    const graves = buckets[grade].sort(compareGraves);
    return { grade, graves, count: graves.length, defaultCollapsed: grade === "alive" };
  };
  const [g0, g1, g2, g3] = GRADE_ORDER.map(group) as GradeGroup<T>[] as [
    GradeGroup<T>,
    GradeGroup<T>,
    GradeGroup<T>,
    GradeGroup<T>,
  ];
  return {
    groups: [g0, g1, g2, g3],
    counts: { dead: g0.count, dying: g1.count, ailing: g2.count, alive: g3.count },
    total: records.length,
  };
}
