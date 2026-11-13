import fc from "fast-check";
import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import type { GradeBand, PackageSignals, SignalName } from "@graveyard-kit/skeleton";
import type { ReplacementInfo, UnknownReason } from "../../../evidence/index.js";
import { KIND_PRECEDENCE } from "../../types.js";
import type { ScanReport, ScanSummary, ScannedDependency, SkippedEntry, SkipReason } from "../../types.js";

const text: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 2, arbitrary: fc.fullUnicodeString({ maxLength: 8 }) },
  { weight: 1, arbitrary: fc.constantFrom("", "a\"b", "line\nbreak", "tab\t", "back\\slash", "é☃😀", "\u2028", "</script>") },
);

/** Integers only, and never -0. */
const nat = (max: number): fc.Arbitrary<number> => fc.integer({ min: 0, max });

const BOOLEAN_SIGNALS = new Set<SignalName>(["deprecated", "repoArchived", "knownReplacementExists"]);

const signalValue = (name: SignalName) =>
  fc.oneof(
    fc.constant({ kind: "unknown" as const }),
    BOOLEAN_SIGNALS.has(name)
      ? fc.boolean().map((value) => ({ kind: "known" as const, value }))
      : nat(500).map((value) => ({ kind: "known" as const, value })),
  );

const signals: fc.Arbitrary<PackageSignals> = fc
  .tuple(
    fc.tuple(...SIGNAL_NAMES.map(signalValue)),
    fc.option(
      fc.record({ present: fc.array(fc.boolean(), { minLength: 7, maxLength: 7 }), urls: fc.array(text, { minLength: 7, maxLength: 7 }) }),
      { nil: undefined },
    ),
  )
  .map(([values, urlSpec]) => {
    const out: Record<string, unknown> = {};
    SIGNAL_NAMES.forEach((n, i) => {
      out[n] = values[i];
    });
    if (urlSpec !== undefined) {
      // May be empty: an empty `sourceUrls` object is a valid, distinct state.
      const urls: Partial<Record<SignalName, string>> = {};
      SIGNAL_NAMES.forEach((n, i) => {
        if (urlSpec.present[i]) urls[n] = urlSpec.urls[i]!;
      });
      out["sourceUrls"] = urls;
    }
    return out as unknown as PackageSignals;
  });

const unknownReason: fc.Arbitrary<UnknownReason> = fc.record({
  source: fc.constantFrom("npm", "github", "osv", "e18e", "depsdev"),
  category: fc.constantFrom("not_found", "timeout", "rate_limited", "malformed_response", "network_error", "not_applicable", "incomplete"),
  message: text,
});

const unknownReasons: fc.Arbitrary<Partial<Record<SignalName, UnknownReason>>> = fc
  .array(fc.option(unknownReason, { nil: undefined }), { minLength: 7, maxLength: 7 })
  .map((rs) => {
    const out: Partial<Record<SignalName, UnknownReason>> = {};
    SIGNAL_NAMES.forEach((n, i) => {
      if (rs[i] !== undefined) out[n] = rs[i]!;
    });
    return out;
  });

const replacement: fc.Arbitrary<ReplacementInfo | undefined> = fc.option(
  fc.record({ type: text, list: fc.array(text, { maxLength: 3 }), hasFirst: fc.boolean() }).map(({ type, list, hasFirst }) => {
    const r: { type: string; replacement?: string; replacements: string[] } = { type, replacements: list };
    if (hasFirst && list.length > 0) r.replacement = list[0]!;
    return r as ReplacementInfo;
  }),
  { nil: undefined },
);

const grade: fc.Arbitrary<GradeBand> = fc.constantFrom("alive", "ailing", "dying", "dead");

const part = fc.record(
  {
    signal: fc.constantFrom(...SIGNAL_NAMES),
    rawValue: text,
    weight: fc.oneof(nat(100), nat(1000).map((n) => n / 10)),
    points: nat(100),
    status: fc.constantFrom("known" as const, "unknown" as const),
    sourceUrl: text,
  },
  { requiredKeys: ["signal", "rawValue", "weight", "points", "status"] },
);

const death = fc.record({ score: nat(100), grade, parts: fc.array(part, { maxLength: 7 }) });

const dependency: fc.Arbitrary<ScannedDependency> = fc
  .record(
    {
      name: text,
      kinds: fc.shuffledSubarray([...KIND_PRECEDENCE], { minLength: 1 }),
      declaredRange: text,
      resolvedVersion: text,
      versionSource: fc.constantFrom("lockfile" as const, "range" as const),
      signals,
      unknownReasons,
      replacement: replacement.filter((r): r is ReplacementInfo => r !== undefined),
      evidenceWarnings: fc.array(text, { maxLength: 3 }),
      death,
    },
    { requiredKeys: ["name", "kinds", "declaredRange", "versionSource", "signals", "unknownReasons", "evidenceWarnings", "death"] },
  )
  .map((d) => d as ScannedDependency);

const REASONS: SkipReason[] = ["npm_alias", "git", "file", "link", "http", "workspace", "other"];
const skippedEntry: fc.Arbitrary<SkippedEntry> = fc.record({
  name: text,
  kind: fc.constantFrom(...KIND_PRECEDENCE),
  specifier: text,
  reason: fc.constantFrom(...REASONS),
});

const summary: fc.Arbitrary<ScanSummary> = fc.record({
  total: nat(60),
  skipped: nat(60),
  alive: nat(60),
  ailing: nat(60),
  dying: nat(60),
  dead: nat(60),
});

/** A valid ScanReport built field by field, not through the pipeline. */
export const reportArb: fc.Arbitrary<ScanReport> = fc.record({
  repo: text,
  ref: text,
  scannedAt: text,
  dependencies: fc.array(dependency, { maxLength: 4 }),
  skipped: fc.array(skippedEntry, { maxLength: 4 }),
  warnings: fc.array(text, { maxLength: 4 }),
  summary,
});
