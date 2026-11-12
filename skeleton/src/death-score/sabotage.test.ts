import { describe, it, expect } from "vitest";
import { scoreDeath } from "./score.js";
import { log } from "./fc-runner.js";
import { runAgainst, runSabotageChecks, SABOTAGES } from "./sabotage.js";

describe("sabotage checks (proof-rules.md)", () => {
  it("the real implementation passes every property under the same seed", () => {
    expect(runAgainst(scoreDeath)).toEqual([]);
  });

  it.each(SABOTAGES.map((s) => s.name))("%s is caught by at least one property", (name) => {
    const outcome = runSabotageChecks().find((o) => o.sabotage === name)!;
    for (const r of outcome.caught) {
      log(
      "log",
        `[sabotage: ${name}] caught by "${r.property}" (seed=${r.seed}, shrinks=${r.numShrinks})\n` +
          `  shrunk counterexample: ${r.counterexample}`,
      );
    }
    expect(outcome.caught.length).toBeGreaterThan(0);
  });
});
