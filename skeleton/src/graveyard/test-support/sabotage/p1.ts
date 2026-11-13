import { buildGraveyard } from "../../build-graveyard.js";
import type { BuildGraveyardFn } from "../properties/p1.js";
import type { Sabotage } from "../sabotage-runner.js";
import type { GradeGroup, Grave, GraveRecord, GraveyardView } from "../../types.js";

function withGroups<T extends GraveRecord>(
  view: GraveyardView<T>,
  edit: (groups: GradeGroup<T>[]) => GradeGroup<T>[],
  total: number = view.total,
): GraveyardView<T> {
  const groups = edit(view.groups.map((g) => ({ ...g, graves: [...g.graves] })));
  return { ...view, total, groups: groups as GraveyardView<T>["groups"] };
}

const dropSharedName: BuildGraveyardFn = (records) => {
  const seen = new Set<string>();
  const kept = records.filter((r) => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
  return buildGraveyard(kept);
};

const dropAlive: BuildGraveyardFn = (records) =>
  withGroups(buildGraveyard(records), (groups) =>
    groups.map((g) => (g.grade === "alive" ? { ...g, graves: [], count: 0 } : g)),
  );

const boundaryInTwoGroups: BuildGraveyardFn = (records) =>
  withGroups(buildGraveyard(records), (groups) => {
    const dead = groups.find((g) => g.grade === "dead");
    const dying = groups.find((g) => g.grade === "dying");
    if (!dead || !dying) return groups;
    const copies = dead.graves.filter((x) => x.record.death.score === 75);
    dying.graves = [...dying.graves, ...copies];
    dying.count = dying.graves.length;
    return groups;
  });

const keysWithoutSuffix: BuildGraveyardFn = (records) =>
  withGroups(buildGraveyard(records), (groups) =>
    groups.map((g) => ({
      ...g,
      graves: g.graves.map((x): Grave<(typeof records)[number]> => ({ ...x, key: x.record.name })),
    })),
  );

const dropScoreZero: BuildGraveyardFn = (records) =>
  buildGraveyard(records.filter((r) => r.death.score !== 0));

const sortsInputInPlace: BuildGraveyardFn = (records) => {
  (records as unknown as GraveRecord[]).sort((a, b) => b.death.score - a.death.score);
  return buildGraveyard(records);
};

export const P1_SABOTAGES: readonly Sabotage<BuildGraveyardFn>[] = [
  { name: "drops a record that shares a name with another", impl: dropSharedName },
  { name: "drops the alive group", impl: dropAlive },
  { name: "puts a boundary-score (75) record in two groups", impl: boundaryInTwoGroups },
  { name: "assigns key = name without a suffix", impl: keysWithoutSuffix },
  { name: "filters out records with score 0", impl: dropScoreZero },
  { name: "sorts the input array in place", impl: sortsInputInPlace },
];
