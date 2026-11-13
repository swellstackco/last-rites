import fc from "fast-check";

// Mirrors skeleton/src/death-score/fc-runner.ts (the skeleton does not export it; no deep imports).

/** numRuns for internal properties (tech steering / proof-rules.md). */
export const NUM_RUNS = 100;

/** Fixed seed used in CI and for all sabotage runs, so output is reproducible. */
export const FIXED_SEED = 20261113;

interface EnvLike {
  env?: Record<string, string | undefined>;
}

function readEnv(name: string): string | undefined {
  return (globalThis as { process?: EnvLike }).process?.env?.[name];
}

/**
 * Seed policy (proof-rules.md "Determinism"):
 * - `FC_SEED` wins (replay a recorded failure);
 * - with `CI` set the seed is fixed;
 * - otherwise a fresh random seed, recorded on failure.
 */
export function resolveSeed(): number {
  const fromEnv = readEnv("FC_SEED");
  if (fromEnv !== undefined && fromEnv !== "" && !Number.isNaN(Number(fromEnv))) {
    return Number(fromEnv);
  }
  if (readEnv("CI")) return FIXED_SEED;
  return Math.floor(Math.random() * 0x7fffffff);
}

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

/** Run a property; return a report if it failed, undefined if it held. */
export function checkProperty(
  name: string,
  prop: fc.IProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  seed: number = resolveSeed(),
): CounterexampleReport | undefined {
  const details = fc.check(prop, { numRuns: NUM_RUNS, seed });
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

/** Minimal console access (no @types/node in this workspace). */
export function log(kind: "log" | "error", text: string): void {
  (globalThis as unknown as { console: Record<"log" | "error", (t: string) => void> }).console[kind](text);
}

/** Format a report for logs / the UI proof panel. */
export function formatReport(r: CounterexampleReport): string {
  return (
    `Property "${r.property}" failed (seed=${r.seed}, numRuns=${r.numRuns}, shrinks=${r.numShrinks}).\n` +
    `Shrunk counterexample: ${r.counterexample}\n` +
    `Replay: FC_SEED=${r.seed} (path ${r.path ?? "n/a"})` +
    (r.error ? `\nError: ${r.error}` : "")
  );
}

/** Assert a property holds; on failure log and throw the seed and shrunk counterexample. */
export function assertProperty(
  name: string,
  prop: fc.IProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
  const report = checkProperty(name, prop);
  if (report) {
    const text = formatReport(report);
    log("error", text);
    throw new Error(text);
  }
}

/** Async variant of checkProperty, for `fc.asyncProperty`. */
export async function checkPropertyAsync(
  name: string,
  prop: fc.IAsyncProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  seed: number = resolveSeed(),
): Promise<CounterexampleReport | undefined> {
  const details = await fc.check(prop, { numRuns: NUM_RUNS, seed });
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

/** Async variant of assertProperty. */
export async function assertPropertyAsync(
  name: string,
  prop: fc.IAsyncProperty<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<void> {
  const report = await checkPropertyAsync(name, prop);
  if (report) {
    const text = formatReport(report);
    log("error", text);
    throw new Error(text);
  }
}
