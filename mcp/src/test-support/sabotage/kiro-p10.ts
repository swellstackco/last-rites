import { REAL_NEW_DEAD, type NewDead } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

type Report = Parameters<NewDead["deadNames"]>[0];
type Grade = string;

const names = (r: Report, keep: (g: Grade) => boolean): string[] => r.dependencies.filter((d) => keep(d.death.grade)).map((d) => d.name);

export const KIRO_P10_SABOTAGES: Sabotage<NewDead>[] = [
  {
    name: "(a) include dying packages",
    impl: {
      deadNames: (r) => [...new Set(names(r, (g) => g === "dead" || g === "dying"))].sort(),
      newDeadPackages: (b, r) => [...new Set(names(r, (g) => g === "dead" || g === "dying"))].sort().filter((n) => !b.includes(n)),
    },
  },
  {
    name: "(b) report packages already in the baseline",
    impl: { ...REAL_NEW_DEAD, newDeadPackages: (_b, r) => REAL_NEW_DEAD.deadNames(r) },
  },
  {
    name: "(c) return names in score order instead of code-unit order",
    impl: {
      deadNames: (r) => [...new Set([...r.dependencies].filter((d) => d.death.grade === "dead").sort((x, y) => y.death.score - x.death.score).map((d) => d.name))],
      newDeadPackages: (b, r) =>
        [...new Set([...r.dependencies].filter((d) => d.death.grade === "dead").sort((x, y) => y.death.score - x.death.score).map((d) => d.name))].filter((n) => !b.includes(n)),
    },
  },
  {
    name: "(d) return duplicates",
    impl: {
      deadNames: (r) => names(r, (g) => g === "dead").sort(),
      newDeadPackages: (b, r) => names(r, (g) => g === "dead").sort().filter((n) => !b.includes(n)),
    },
  },
  {
    name: "(e) compare names case-insensitively",
    impl: {
      ...REAL_NEW_DEAD,
      newDeadPackages: (b, r) => {
        const known = new Set(b.map((n) => n.toLowerCase()));
        return REAL_NEW_DEAD.deadNames(r).filter((n) => !known.has(n.toLowerCase()));
      },
    },
  },
];
