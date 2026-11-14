import type { SabotageSummary } from "@last-rites/skeleton/proof";
import { isWeak } from "../../proof/attempt.js";
import { CONTRACT_MUTANTS, PIN_MUTANTS, runSabotage, sabotageFor } from "../../proof/mutants.js";
import type { Mutant } from "../../proof/mutants.js";
import type { SabotageImpl } from "../properties/actions-p10.js";
import type { Sabotage } from "../sabotage-runner.js";

const real: SabotageImpl = { runSabotage, weakOf: isWeak, sabotageFor, pinMutants: PIN_MUTANTS, contractMutants: CONTRACT_MUTANTS };

/** A runSabotage with the three ways to get the accounting wrong, selected by `how`. */
function badRun(how: "inapplicable-caught" | "throw-caught" | "no-survivors"): typeof runSabotage {
  return <I,>(shape: string, input: I, check: (i: I) => boolean, mutants: readonly Mutant<I>[]): SabotageSummary => {
    let applied = 0;
    let caught = 0;
    const survivors: string[] = [];
    for (const m of mutants) {
      const ok = m.applicable(input);
      if (!ok) {
        if (how === "inapplicable-caught") {
          applied++;
          caught++;
        }
        continue;
      }
      applied++;
      let accepted: boolean;
      try {
        accepted = check(m.apply(input));
      } catch {
        accepted = how === "throw-caught" ? false : true;
      }
      if (accepted) {
        if (how !== "no-survivors") survivors.push(`${shape}:${m.id}`);
        else caught++;
      } else caught++;
    }
    return { applied, caught, survivors };
  };
}

/** (f) the pin Mutants edit the original texts instead of the rewritten ones. */
const onOriginals: Mutant<Parameters<typeof PIN_MUTANTS[0]["apply"]>[0]>[] = PIN_MUTANTS.map((m) => ({
  ...m,
  apply: (i) => {
    const out = m.apply({ ...i, rewritten: i.originals });
    return { ...i, originals: out.rewritten };
  },
}));

export const sabotages: Sabotage<SabotageImpl>[] = [
  { name: "(a) count an inapplicable Mutant as caught", impl: { ...real, runSabotage: badRun("inapplicable-caught") } },
  { name: "(b) count a Mutant as caught when the check throws", impl: { ...real, runSabotage: badRun("throw-caught") } },
  { name: "(c) never list survivors", impl: { ...real, runSabotage: badRun("no-survivors") } },
  { name: "(d) weak is false when applied is 0", impl: { ...real, weakOf: (status, s) => status === "proved" && s.applied > 0 && s.survivors.length > 0 } },
  {
    name: "(e) run the Mutants on a counterexample attempt",
    impl: { ...real, sabotageFor: (_status, run) => run() },
  },
  { name: "(f) apply the Mutant to the original text instead of the rewritten one", impl: { ...real, pinMutants: onOriginals } },
  { name: "(g) weak from survivors only", impl: { ...real, weakOf: (status, s) => status === "proved" && s.survivors.length > 0 } },
];
