// Runs an async fast-check property with the repo's seed policy (FC_SEED, CI fixed seed, else random).
import fc from "fast-check";
import { NUM_RUNS, resolveSeed } from "@graveyard-kit/skeleton/graveyard/testing";

export interface AsyncReport {
  property: string;
  seed: number;
  numShrinks: number;
  counterexample: string;
  error: string | null;
}

export async function checkAsyncProperty(
  name: string,
  prop: fc.IAsyncProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  seed: number = resolveSeed(),
): Promise<AsyncReport | undefined> {
  const details = await fc.check(prop, { numRuns: NUM_RUNS, seed });
  if (!details.failed) return undefined;
  return {
    property: name,
    seed,
    numShrinks: details.numShrinks,
    counterexample: fc.stringify(details.counterexample),
    error: details.errorInstance instanceof Error ? details.errorInstance.message : null,
  };
}

export function formatAsyncReport(r: AsyncReport): string {
  return (
    `Property "${r.property}" failed (seed=${r.seed}, numRuns=${NUM_RUNS}, shrinks=${r.numShrinks}).\n` +
    `Shrunk counterexample: ${r.counterexample}\nReplay: FC_SEED=${r.seed}` +
    (r.error ? `\nError: ${r.error}` : "")
  );
}
