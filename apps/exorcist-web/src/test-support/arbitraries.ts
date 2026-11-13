// Generators for the graveyard-ui-polish properties: whole Scan_Reports and the package to open.
import fc from "fast-check";
import type { PackageSignals, SignalName, SignalValue } from "@graveyard-kit/skeleton";
import { hostileUrlArb } from "@graveyard-kit/skeleton/graveyard/testing";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { buildReport, tamperUrl } from "./build-report.js";
import type { FixtureDependency } from "./build-report.js";

/** Names shaped like the real ones plus long scoped, hostile and grade-word names. */
const NAMES: readonly string[] = [
  "left-pad",
  "ldapjs",
  "@babel/plugin-proposal-object-rest-spread",
  "@saithodev/semantic-release-backmerge",
  "@scope/a-47-character-scoped-package-name-xxxxx",
  "<img src=x onerror=alert(1)>",
  "<script>alert(1)</script>",
  "dead",
  "Dead",
  "alive",
  "é-ü",
  "a b",
  "constructor",
  "__proto__",
  "emoji-\u{1F480}",
];

const SIGNAL_NAMES_FOR_TAMPER: readonly SignalName[] = [
  "deprecated",
  "repoArchived",
  "monthsSinceLastPublish",
  "monthsSinceLastCommit",
  "maintainerCount",
  "openVulnsNoFix",
  "knownReplacementExists",
];

type Scored = { signals: PackageSignals };

const known = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<SignalValue<T>> => a.map((value) => ({ kind: "known" as const, value }));
const maybe = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<SignalValue<T>> =>
  fc.oneof({ weight: 5, arbitrary: known(a) }, { weight: 1, arbitrary: fc.constant<SignalValue<T>>({ kind: "unknown" }) });

// Biased toward the dead end (true flags, stale publishes) so declared-abandoned packages are common.
const flagArb = maybe(fc.boolean());
const monthsArb = maybe(fc.oneof(fc.integer({ min: 0, max: 6 }), fc.integer({ min: 20, max: 120 })));

const scoredArb: fc.Arbitrary<Scored> = fc
  .record({
    deprecated: flagArb,
    repoArchived: flagArb,
    monthsSinceLastPublish: monthsArb,
    monthsSinceLastCommit: monthsArb,
    maintainerCount: maybe(fc.integer({ min: 0, max: 9 })),
    openVulnsNoFix: maybe(fc.integer({ min: 0, max: 3 })),
    knownReplacementExists: flagArb,
  })
  .map((signals): Scored => ({ signals }));

const skippedArb = fc.array(
  fc.record({
    name: fc.constantFrom("local-lib", "tools"),
    kind: fc.constant("dependencies" as const),
    specifier: fc.constantFrom("file:../x", "file:./y"),
    reason: fc.constant("file" as const),
  }),
  { maxLength: 2 },
);

const tamperArb = fc.option(
  fc.record({ at: fc.nat({ max: 11 }), signal: fc.constantFrom(...SIGNAL_NAMES_FOR_TAMPER), url: hostileUrlArb }),
  { nil: undefined, freq: 4 },
);

/** A Scan_Report with 1-12 dependencies (unique names), built with the real scoreDeath. */
export const scanReportArb: fc.Arbitrary<ScanReport> = fc
  .tuple(
    fc.array(fc.tuple(fc.constantFrom(...NAMES), scoredArb, fc.constantFrom<"lockfile" | "range">("lockfile", "range")), {
      minLength: 1,
      maxLength: 12,
    }),
    skippedArb,
    tamperArb,
  )
  .map(([rows, skipped, tamper]) => {
    const seen = new Set<string>();
    const deps: FixtureDependency[] = [];
    for (const [name, scored, versionSource] of rows) {
      if (seen.has(name)) continue;
      seen.add(name);
      deps.push({ name, signals: scored.signals, versionSource });
    }
    let report = buildReport(deps, { skipped });
    if (tamper) {
      const target = report.dependencies[tamper.at % report.dependencies.length];
      if (target) report = tamperUrl(report, target.name, tamper.signal, tamper.url);
    }
    return report;
  });

/** An index into the report's dependencies; use it modulo the dependency count. */
export const openPackageArb: fc.Arbitrary<number> = fc.nat({ max: 11 });
