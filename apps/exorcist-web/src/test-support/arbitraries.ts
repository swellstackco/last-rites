// Generators for the graveyard-ui-polish properties: whole Scan_Reports and the package to open.
import fc from "fast-check";
import type { PackageSignals, SignalName, SignalValue } from "@graveyard-kit/skeleton";
import { hostileUrlArb } from "@graveyard-kit/skeleton/graveyard/testing";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import type { ProofReport } from "@graveyard-kit/skeleton/proof";
import { buildProofReport } from "./build-proof-report.js";
import type { ProofKind } from "./build-proof-report.js";
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

// ---- Proof_Reports (toe-tag-redesign Property 2) -----------------------------------------------------

export const proofKindArb: fc.Arbitrary<ProofKind> = fc.constantFrom<ProofKind>(
  "proved",
  "weak",
  "counterexample",
  "no_call_sites",
  "error",
);

const HOSTILE_TEXT: readonly string[] = [
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  "&lt;b&gt;",
  '"><script>',
  "data:text/html,x",
  "x".repeat(200),
  "line one\nline two\r\n  indented\ttab\n",
  "  leading and trailing  ",
  "é😀 ü",
  "",
];

/** Free text: arbitrary (well-formed unicode, multi-line) or from the hostile corpus. */
const textArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.fullUnicodeString({ maxLength: 24 }) },
  { weight: 2, arbitrary: fc.constantFrom(...HOSTILE_TEXT) },
  { weight: 1, arbitrary: fc.array(fc.string({ maxLength: 8 }), { maxLength: 4 }).map((l) => l.join("\n")) },
);

/**
 * A consistent Proof_Report: 1-3 attempts, the last of any of the five kinds, 0-80 call sites (0 only when the
 * report has no call sites), every free-text field arbitrary or hostile. Built with the real builders; it parses
 * with the real `parseProofReport` (checked by an example test).
 */
export const proofReportArb: fc.Arbitrary<ProofReport> = fc
  .tuple(
    proofKindArb,
    fc.array(fc.constantFrom<ProofKind>("counterexample", "error", "no_call_sites"), { maxLength: 2 }),
    fc.integer({ min: 1, max: 80 }),
    fc.integer({ min: 0, max: 3 }),
    fc.array(textArb, { minLength: 8, maxLength: 8 }),
  )
  .map(([last, history, sites, imports, texts]) => {
    // proved/weak attempts need call sites; no-call-sites attempts need none. Keep the report consistent.
    const noSites = last === "no_call_sites" || history.includes("no_call_sites");
    const kinds: ProofKind[] = noSites ? history.filter((k) => k !== "proved" && k !== "weak") : history;
    const lastKind: ProofKind = noSites && (last === "proved" || last === "weak") ? "no_call_sites" : last;
    const report = buildProofReport(lastKind, { callSites: sites, importSites: imports }, kinds);
    const t = (i: number): string => texts[i] as string;
    if (noSites) report.callSites = [];
    report.callSites.forEach((c, i) => {
      c.file = `${t(0)}#${i}`;
      c.callee = t(1);
      c.argTexts = [t(2)];
    });
    for (const a of report.attempts) {
      if (a.candidate) a.candidate = { name: t(3), source: t(4) };
      if (a.counterexample) {
        a.counterexample = {
          ...a.counterexample,
          input: t(5),
          oldOutput: t(6),
          newOutput: t(7),
          oldProjected: t(6),
          newProjected: t(7),
        };
      }
      if (a.error) a.error = { ...a.error, message: t(3) };
      if (a.sabotage.survivors.length > 0) a.sabotage.survivors = a.sabotage.survivors.map(() => t(4));
      if (a.recommendation) a.recommendation = report.importSites.length === 0 ? "remove-dependency" : "review-imports";
    }
    return report;
  });
