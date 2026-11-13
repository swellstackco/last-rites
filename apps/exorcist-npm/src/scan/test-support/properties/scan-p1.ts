import fc from "fast-check";
import type { NamedAsyncProperty } from "../../../evidence/test-support/sabotage-runner.js";
import type { PipelineParts } from "../../pipeline.js";
import { serializeReport } from "../../report.js";
import { lockfileFor } from "../arbitraries/lockfile.js";
import { manifestArbUpTo } from "../arbitraries/manifest.js";
import { profileFromTable, runScan } from "../run-scan.js";

const picksArb = fc.array(fc.nat(), { minLength: 1, maxLength: 400 });

const inputArb = manifestArbUpTo(50)
  .chain((m) => lockfileFor(m))
  .chain((lock) =>
    fc.tuple(
      fc.constant(lock),
      fc.integer({ min: 1, max: 8 }),
      fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 12 }),
      picksArb,
      picksArb,
    ),
  );

/** Property 1: determinism and completion-order independence. */
export const property1: NamedAsyncProperty<PipelineParts> = {
  name: "Property 1: Determinism and completion-order independence",
  build: (parts) =>
    fc.asyncProperty(inputArb, async ([lock, concurrency, table, picksA, picksB]) => {
      const profileOf = profileFromTable(table);
      const texts: string[] = [];
      for (const picks of [picksA, picksA, picksB]) {
        const { outcome, gate, counting } = await runScan(parts, lock.manifest.text, lock.text, {
          concurrency,
          profileOf,
          picks,
        });
        if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code} ${outcome.error.message}`);
        if (counting.reads !== 1) throw new Error(`clock read ${counting.reads} times`);
        if (outcome.report.scannedAt !== counting.instant.toISOString()) throw new Error("scannedAt is not the clock reading");
        for (const c of gate.calls) {
          if (new Date(c.now).getTime() !== counting.instant.getTime()) throw new Error(`evidence call for ${c.name} got a different now`);
        }
        if (gate.maxInFlight > concurrency) throw new Error(`${gate.maxInFlight} calls in flight, limit ${concurrency}`);
        texts.push(serializeReport(outcome.report));
      }
      if (texts[0] !== texts[1]) throw new Error("two scans with the same release order differ");
      if (texts[0] !== texts[2]) throw new Error("scans with different release orders differ");
    }),
};
