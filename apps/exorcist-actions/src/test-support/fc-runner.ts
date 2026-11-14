import fc from "fast-check";

// Seed policy of the npm fc-runner, without environment access: a fixed seed, printed on failure.

/** numRuns for internal properties (tech steering / proof-rules.md). */
export const NUM_RUNS = 100;

/** The one seed of this app (environment-free constant). */
export const FIXED_SEED = 20261113;

export interface CounterexampleReport {
  property: string;
  seed: number;
  numRuns: number;
  numShrinks: number;
  /** Shrunk counterexample, rendered with fc.stringify. */
  counterexample: string;
  path: string | null;
  error: string | null;
}

function toReport(
  name: string,
  seed: number,
  details: fc.RunDetails<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): CounterexampleReport | undefined {
  if (!details.failed) return undefined;
  return {
    property: name,
    seed,
    numRuns: NUM_RUNS,
    numShrinks: details.numShrinks,
    counterexample: fc.stringify(details.counterexample),
    path: details.counterexamplePath,
    error: details.errorInstance instanceof Error ? details.errorInstance.message : null,
  };
}

/** Run a property; return a report if it failed, undefined if it held. */
export function checkProperty(
  name: string,
  prop: fc.IProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  seed: number = FIXED_SEED,
): CounterexampleReport | undefined {
  return toReport(name, seed, fc.check(prop, { numRuns: NUM_RUNS, seed }));
}

/** Async variant of checkProperty, for `fc.asyncProperty`. */
export async function checkPropertyAsync(
  name: string,
  prop: fc.IProperty<any> | fc.IAsyncProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  seed: number = FIXED_SEED,
): Promise<CounterexampleReport | undefined> {
  return toReport(name, seed, await fc.check(prop as fc.IAsyncProperty<unknown>, { numRuns: NUM_RUNS, seed }));
}

/** Format a report for logs: seed and shrunk counterexample. */
export function formatReport(r: CounterexampleReport): string {
  return (
    `Property "${r.property}" failed (seed=${r.seed}, numRuns=${r.numRuns}, shrinks=${r.numShrinks}).\n` +
    `Shrunk counterexample: ${r.counterexample}\n` +
    `Replay: seed ${r.seed} (path ${r.path ?? "n/a"})` +
    (r.error ? `\nError: ${r.error}` : "")
  );
}

/** Assert a property holds; on failure throw with the seed and the shrunk counterexample. */
export function assertProperty(
  name: string,
  prop: fc.IProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
  const report = checkProperty(name, prop);
  if (report) throw new Error(formatReport(report));
}

/** Async variant of assertProperty. */
export async function assertPropertyAsync(
  name: string,
  prop: fc.IProperty<any> | fc.IAsyncProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  const report = await checkPropertyAsync(name, prop);
  if (report) throw new Error(formatReport(report));
}
