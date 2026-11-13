import { FIXED_SEED, checkProperty } from "../../death-score/fc-runner.js";
import type { CounterexampleReport } from "../../death-score/fc-runner.js";

/** A deliberately wrong implementation with a name. */
export interface Sabotage<F> {
  name: string;
  impl: F;
}

/** Throw a plain error with a message when a condition does not hold (used inside properties). */
export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Run a property against every sabotage and fail with
 * `Sabotage "<name>" stayed green for "<property>"` for the first one that holds.
 * `runProperty` must run the property with the fixed seed and return a report on failure.
 */
export function assertAllSabotagesCaught<F>(
  propertyName: string,
  list: readonly Sabotage<F>[],
  runProperty: (impl: F) => CounterexampleReport | undefined,
): CounterexampleReport[] {
  if (list.length === 0) throw new Error(`No sabotages listed for "${propertyName}"`);
  const reports: CounterexampleReport[] = [];
  for (const s of list) {
    const report = runProperty(s.impl);
    if (report === undefined) {
      throw new Error(`Sabotage "${s.name}" stayed green for "${propertyName}"`);
    }
    reports.push(report);
  }
  return reports;
}

export { FIXED_SEED, checkProperty };
