import type fc from "fast-check";
import { FIXED_SEED, checkProperty, type CounterexampleReport } from "./fc-runner.js";

/** A property built over a swappable implementation `Impl` (the seam under test). */
export interface NamedProperty<Impl> {
  name: string;
  build(impl: Impl): fc.IProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Sabotage<Impl> {
  name: string;
  impl: Impl;
}

export interface SabotageOutcome {
  sabotage: string;
  /** Reports for every property that caught it (empty = sabotage stayed green). */
  caught: CounterexampleReport[];
}

/** Run every property against one implementation; fixed seed for reproducible output. */
export function runAgainst<Impl>(
  properties: ReadonlyArray<NamedProperty<Impl>>,
  impl: Impl,
  seed: number = FIXED_SEED,
): CounterexampleReport[] {
  return properties.flatMap((p) => {
    const r = checkProperty(p.name, p.build(impl), seed);
    return r ? [r] : [];
  });
}

export function runSabotageChecks<Impl>(
  properties: ReadonlyArray<NamedProperty<Impl>>,
  sabotages: ReadonlyArray<Sabotage<Impl>>,
  seed: number = FIXED_SEED,
): SabotageOutcome[] {
  return sabotages.map(({ name, impl }) => ({ sabotage: name, caught: runAgainst(properties, impl, seed) }));
}

/** Throws `Sabotage "<name>" stayed green for "<property>"` for any sabotage no property catches. */
export function assertAllSabotagesCaught<Impl>(
  propertyName: string,
  properties: ReadonlyArray<NamedProperty<Impl>>,
  sabotages: ReadonlyArray<Sabotage<Impl>>,
  seed: number = FIXED_SEED,
): void {
  for (const o of runSabotageChecks(properties, sabotages, seed)) {
    if (o.caught.length === 0) {
      throw new Error(`Sabotage "${o.sabotage}" stayed green for "${propertyName}"`);
    }
  }
}
