import fc from "fast-check";
import { scoreDeath } from "@graveyard-kit/skeleton";
import type { NamedAsyncProperty } from "../../../evidence/test-support/sabotage-runner.js";
import type { EvidenceStage } from "../../../evidence/index.js";
import type { PipelineParts } from "../../pipeline.js";
import type { DependencyEntry, ScannedDependency, SkippedEntry } from "../../types.js";
import { evidenceFor } from "../gated-evidence.js";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const codeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const nameArb = fc.stringOf(fc.constantFrom(..."abcxyzABCXYZ019-._".split("")), { minLength: 1, maxLength: 5 });

const inputArb = fc
  .uniqueArray(fc.tuple(nameArb, fc.integer({ min: 0, max: 5 })), {
    selector: ([n]) => n,
    minLength: 0,
    maxLength: 50,
  })
  .chain((items) =>
    fc.tuple(
      fc.constant(items),
      fc.array(fc.nat(), { minLength: items.length, maxLength: items.length }),
      fc.nat({ max: 5 }),
    ),
  );

/** Property 4: sort order, summary counts and scoring. */
export const property4: NamedAsyncProperty<PipelineParts> = {
  name: "Property 4: Sort order, summary counts and scoring",
  build: (parts) =>
    fc.asyncProperty(inputArb, async ([items, keys, skippedCount]) => {
      const profiles = new Map(items);
      const evidence: EvidenceStage = (input) => Promise.resolve(evidenceFor(profiles.get(input.name) ?? 0, input.name));
      const entries: DependencyEntry[] = items.map(([name]) => ({
        name,
        kinds: ["dependencies"],
        declaredRange: "^1.0.0",
        versionSource: "range",
      }));
      const scanned: ScannedDependency[] = [];
      for (const e of entries) scanned.push((await parts.scanOne(e, { evidence, now: NOW })).dep);

      const skipped: SkippedEntry[] = Array.from({ length: skippedCount }, (_, i) => ({
        name: `skip-${i}`,
        kind: "dependencies",
        specifier: "file:../x",
        reason: "file",
      }));
      const target = { owner: "o", repo: "r", ref: "HEAD" };
      const base = { target, scannedAt: NOW.toISOString(), skipped, warnings: [] as string[] };

      // A permutation of the scanned values driven by the generated keys.
      const permuted = scanned
        .map((d, i) => ({ d, k: keys[i] ?? 0, i }))
        .sort((a, b) => a.k - b.k || a.i - b.i)
        .map((x) => x.d);

      const report = parts.assemble({ ...base, scanned });
      const reportPermuted = parts.assemble({ ...base, scanned: permuted });
      if (!same(report, reportPermuted)) throw new Error("report depends on the order of the scanned values");

      const deps = report.dependencies;
      for (let i = 1; i < deps.length; i++) {
        const a = deps[i - 1]!;
        const b = deps[i]!;
        if (a.death.score < b.death.score) throw new Error(`score order broken at ${i}`);
        if (a.death.score === b.death.score && codeUnit(a.name, b.name) >= 0) throw new Error(`name tiebreak broken at ${i}`);
      }

      const counts = { alive: 0, ailing: 0, dying: 0, dead: 0 };
      for (const d of deps) counts[d.death.grade] += 1;
      const s = report.summary;
      if (s.total !== deps.length) throw new Error(`summary.total ${s.total}, expected ${deps.length}`);
      if (s.skipped !== skipped.length) throw new Error(`summary.skipped ${s.skipped}, expected ${skipped.length}`);
      for (const g of ["alive", "ailing", "dying", "dead"] as const) {
        if (s[g] !== counts[g]) throw new Error(`summary.${g} ${s[g]}, expected ${counts[g]}`);
      }
      if (s.alive + s.ailing + s.dying + s.dead !== s.total) throw new Error("grade counts do not sum to total");
      if (deps.length !== scanned.length) throw new Error("dependencies were dropped or added");

      for (const d of deps) {
        const ev = evidenceFor(profiles.get(d.name) ?? 0, d.name);
        if (!same(d.death, scoreDeath(ev.signals))) throw new Error(`${d.name}: death differs from scoreDeath(signals)`);
        if (!same(d.signals, ev.signals)) throw new Error(`${d.name}: signals changed`);
        if (!same(d.unknownReasons, ev.unknownReasons)) throw new Error(`${d.name}: unknownReasons changed`);
        if (!same(d.replacement, ev.replacement)) throw new Error(`${d.name}: replacement changed`);
        if (!same(d.evidenceWarnings, ev.warnings)) throw new Error(`${d.name}: evidenceWarnings changed`);
      }
    }),
};
