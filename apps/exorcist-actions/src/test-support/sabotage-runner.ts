import type fc from "fast-check";
import { FIXED_SEED, checkPropertyAsync, type CounterexampleReport } from "./fc-runner.js";

/** A property (sync or async) built over a swappable implementation `Impl` (the seam under test). */
export interface NamedProperty<Impl> {
  name: string;
  build(impl: Impl): fc.IProperty<any> | fc.IAsyncProperty<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface Sabotage<Impl> {
  name: string;
  impl: Impl;
}

/** Reports of every property that fails against `impl` (empty: the impl satisfies them all). */
export async function runAgainst<Impl>(
  properties: ReadonlyArray<NamedProperty<Impl>>,
  impl: Impl,
  seed: number = FIXED_SEED,
): Promise<CounterexampleReport[]> {
  const out: CounterexampleReport[] = [];
  for (const p of properties) {
    const r = await checkPropertyAsync(p.name, p.build(impl), seed);
    if (r) out.push(r);
  }
  return out;
}

/** Throws `Sabotage "<name>" stayed green for "<property>"` for any sabotage no property catches. */
export async function assertAllSabotagesCaught<Impl>(
  propertyName: string,
  properties: ReadonlyArray<NamedProperty<Impl>>,
  sabotages: ReadonlyArray<Sabotage<Impl>>,
  seed: number = FIXED_SEED,
): Promise<void> {
  for (const s of sabotages) {
    if ((await runAgainst(properties, s.impl, seed)).length === 0) {
      throw new Error(`Sabotage "${s.name}" stayed green for "${propertyName}"`);
    }
  }
}
