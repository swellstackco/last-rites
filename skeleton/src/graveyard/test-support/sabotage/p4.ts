import { buildGraveyard } from "../../build-graveyard.js";
import type { BuildGraveyardFn } from "../properties/p1.js";
import type { Sabotage } from "../sabotage-runner.js";

const dyingAsDead: BuildGraveyardFn = (records) => {
  const v = buildGraveyard(records);
  return { ...v, counts: { ...v.counts, dead: v.counts.dead + v.counts.dying, dying: 0 } };
};

const aliveOffByOne: BuildGraveyardFn = (records) => {
  const v = buildGraveyard(records);
  return { ...v, counts: { ...v.counts, alive: v.counts.alive + 1 } };
};

const firstFiftyOnly: BuildGraveyardFn = (records) => {
  const v = buildGraveyard(records);
  return { ...v, counts: buildGraveyard(records.slice(0, 50)).counts };
};

/** View-model sabotages. The header sabotages are added in the page (task 5.5). */
export const P4_VIEW_SABOTAGES: readonly Sabotage<BuildGraveyardFn>[] = [
  { name: "counts dying as dead", impl: dyingAsDead },
  { name: "off-by-one in the alive count", impl: aliveOffByOne },
  { name: "counts computed from the first 50 records only", impl: firstFiftyOnly },
];
