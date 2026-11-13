import fc from "fast-check";
import { SIGNAL_NAMES, scoreDeath } from "@graveyard-kit/skeleton";
import type { NamedAsyncProperty } from "../../../evidence/test-support/sabotage-runner.js";
import { REAL_PARTS } from "../../pipeline.js";
import type { PipelineParts } from "../../pipeline.js";
import { parseReport, serializeReport } from "../../report.js";
import { KIND_PRECEDENCE } from "../../types.js";
import { manifestArb } from "../arbitraries/manifest.js";
import type { GateFailure } from "../gated-evidence.js";
import { profileFromTable, runScan } from "../run-scan.js";

const FAILURE_KINDS: readonly GateFailure[] = ["reject", "throw", "input_error"];

const inputArb = fc.tuple(
  manifestArb,
  fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
  fc.array(fc.constantFrom(...FAILURE_KINDS), { minLength: 8, maxLength: 8 }),
  fc.integer({ min: 1, max: 8 }),
  fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 12 }),
  fc.array(fc.nat(), { minLength: 1, maxLength: 100 }),
  fc.boolean(),
);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Property 5: failure isolation. The oracle is the real pipeline with no failing name. */
export const property5: NamedAsyncProperty<PipelineParts> = {
  name: "Property 5: Failure isolation",
  build: (parts) =>
    fc.asyncProperty(inputArb, async ([manifest, mask, kinds, concurrency, table, picks, failAll]) => {
      const profileOf = profileFromTable(table);
      const registry: string[] = [];
      for (const [name, perKind] of manifest.declared) {
        const first = perKind.get(KIND_PRECEDENCE.find((k) => perKind.has(k))!)!;
        if (first.cls === "registry") registry.push(name);
      }
      registry.sort();
      const failures = new Map<string, GateFailure>();
      registry.forEach((name, i) => {
        if (failAll || mask[i % mask.length]) failures.set(name, kinds[i % kinds.length]!);
      });

      const base = await runScan(REAL_PARTS, manifest.text, undefined, { concurrency, profileOf, picks });
      if (!base.outcome.ok) throw new Error("oracle scan failed");
      const oracle = base.outcome.report;

      const { outcome } = await runScan(parts, manifest.text, undefined, { concurrency, profileOf, picks, failures });
      if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code} ${outcome.error.message}`);
      const report = outcome.report;

      const reparsed = parseReport(serializeReport(report));
      if (!reparsed.ok) throw new Error(`report does not round trip: ${reparsed.error.message}`);
      if (report.dependencies.length !== registry.length) {
        throw new Error(`${report.dependencies.length} dependencies, expected ${registry.length}`);
      }
      if (!same(report.skipped, oracle.skipped)) throw new Error("skipped differs from the no-failure run");

      const oracleByName = new Map(oracle.dependencies.map((d) => [d.name, d]));
      const expectedFailureWarnings: string[] = [];
      for (const dep of report.dependencies) {
        const good = oracleByName.get(dep.name);
        if (!good) throw new Error(`${dep.name} is not in the oracle report`);
        if (!failures.has(dep.name)) {
          if (!same(dep, good)) throw new Error(`${dep.name}: unaffected entry differs from the no-failure run`);
          continue;
        }
        for (const s of SIGNAL_NAMES) {
          if ((dep.signals[s] as { kind: string }).kind !== "unknown") throw new Error(`${dep.name}: ${s} is not unknown`);
          const r = dep.unknownReasons[s];
          if (!r || r.source !== "npm" || r.category !== "network_error") throw new Error(`${dep.name}: bad reason for ${s}`);
        }
        if (Object.keys(dep.unknownReasons).length !== SIGNAL_NAMES.length) throw new Error(`${dep.name}: reason count`);
        if (dep.evidenceWarnings.length === 0) throw new Error(`${dep.name}: no evidence warning`);
        if (!same(dep.death, scoreDeath(dep.signals))) throw new Error(`${dep.name}: death differs from scoreDeath`);
      }
      for (const name of registry) {
        if (!failures.has(name)) continue;
        const good = oracleByName.get(name)!;
        expectedFailureWarnings.push(`evidence failed for ${name} (requested "${good.resolvedVersion ?? good.declaredRange}")`);
      }

      // Inventory warnings first (identical to the oracle), then one warning per failed name in report order.
      const expectedWarnings = [...oracle.warnings, ...expectedFailureWarnings];
      if (!same(report.warnings, expectedWarnings)) {
        throw new Error(`warnings ${JSON.stringify(report.warnings)}, expected ${JSON.stringify(expectedWarnings)}`);
      }
    }),
};
