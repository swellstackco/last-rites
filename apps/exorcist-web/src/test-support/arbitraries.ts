// Generators for the graveyard-ui-polish properties: whole Scan_Reports and the package to open.
import fc from "fast-check";
import type { PackageSignals, SignalName, SignalValue } from "@last-rites/skeleton";
import { hostileUrlArb } from "@last-rites/skeleton/graveyard/testing";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import type { ProofReport } from "@last-rites/skeleton/proof";
import { buildProofReport, buildProofText } from "./build-proof-report.js";
import type { ProofKind } from "./build-proof-report.js";
import { buildReport, tamperUrl } from "./build-report.js";
import type { FixtureDependency } from "./build-report.js";
import { AILING_SIGNALS, ALIVE_SIGNALS, DEAD_SIGNALS, DYING_SIGNALS } from "./signals.js";
import type { GradeBand } from "@last-rites/skeleton";

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

// ---- toe-tag-polish generators ----------------------------------------------------------------------------

const GRADE_SIGNALS: Record<GradeBand, PackageSignals> = {
  dead: DEAD_SIGNALS,
  dying: DYING_SIGNALS,
  ailing: AILING_SIGNALS,
  alive: ALIVE_SIGNALS,
};

/** Valid Proof_Names (see `isProofName`), shaped like the real demo packages. */
const PROOF_SAFE_NAMES: readonly string[] = [
  "intersect",
  "deep-diff",
  "node-abort-controller",
  "gone",
  "ldapjs",
  "left-pad",
  "request",
  "chalk",
  "ms",
  "uuid",
];

export interface DemoPackageCase {
  /** A demo-style Scan_Report with a valid Proof_Name for every package. */
  report: ScanReport;
  /** The package to open. */
  name: string;
  grade: GradeBand;
}

/** A report whose package `name` has `grade`, with 0-4 other packages of random grades. */
export const demoPackageArb: fc.Arbitrary<DemoPackageCase> = fc
  .tuple(
    fc.constantFrom<GradeBand>("dead", "dying", "ailing", "alive"),
    fc.constantFrom(...PROOF_SAFE_NAMES),
    fc.array(
      fc.tuple(fc.constantFrom(...PROOF_SAFE_NAMES), fc.constantFrom<GradeBand>("dead", "dying", "ailing", "alive")),
      { maxLength: 4 },
    ),
  )
  .map(([grade, name, others]) => {
    const seen = new Set<string>([name]);
    const deps: FixtureDependency[] = [{ name, signals: GRADE_SIGNALS[grade] }];
    for (const [n, g] of others) {
      if (seen.has(n)) continue;
      seen.add(n);
      deps.push({ name: n, signals: GRADE_SIGNALS[g] });
    }
    return { report: buildReport(deps), name, grade };
  });

export type ProofLoadCase = { kind: "report"; report: ProofReport } | { kind: "absent" | "failed" | "invalid" };

export interface ProofLoadDraw {
  load: ProofLoadCase;
  /** `before`: the report is settled when the panel opens again; `after`: it arrives after the panel opened. */
  order: "before" | "after";
}

export const proofLoadArb: fc.Arbitrary<ProofLoadDraw> = fc.record({
  load: fc.oneof(
    { weight: 8, arbitrary: proofReportArb.map((report): ProofLoadCase => ({ kind: "report", report })) },
    { weight: 3, arbitrary: fc.constantFrom<ProofLoadCase>({ kind: "absent" }, { kind: "failed" }, { kind: "invalid" }) },
  ),
  order: fc.constantFrom<"before" | "after">("before", "after"),
});

const NAME_ATOM = fc.constantFrom("a", "b", "x1", "core", "utils", "semantic", "release", "backmerge", "é", "0");

/** Package names: scoped, hyphenated, slashed, 1-80 chars, plus the fixed awkward ones. */
export const packageNameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.array(fc.tuple(NAME_ATOM, fc.constantFrom("", "-", "/", "--", "-/")), { minLength: 1, maxLength: 14 }).map((parts) => parts.map(([a, s]) => a + s).join("").slice(0, 80)).filter((n) => n.length > 0) },
  { weight: 2, arbitrary: fc.constantFrom(...NAMES) },
  { weight: 1, arbitrary: fc.constantFrom("@saithodev/semantic-release-backmerge", "@scope/a-47-character-scoped-package-name-xxxxx", "plainname", "-lead", "trail-", "/lead", "trail/") },
  { weight: 1, arbitrary: fc.stringOf(fc.constantFrom("a", "b", "-", "/", "<", ">", "&"), { minLength: 1, maxLength: 80 }) },
);

export type SnapshotCase = { kind: "ok"; report: ScanReport } | { kind: "failed" } | { kind: "invalid" };

/** The four demo snapshots, each readable, failing or unreadable, and the order their responses arrive in. */
export const snapshotSetArb: fc.Arbitrary<{ snapshots: SnapshotCase[]; order: number[] }> = fc.record({
  snapshots: fc.array(
    fc.oneof(
      { weight: 3, arbitrary: scanReportArb.map((report): SnapshotCase => ({ kind: "ok", report })) },
      { weight: 1, arbitrary: fc.constantFrom<SnapshotCase>({ kind: "failed" }, { kind: "invalid" }) },
    ),
    { minLength: 4, maxLength: 4 },
  ),
  order: fc.shuffledSubarray([0, 1, 2, 3], { minLength: 4, maxLength: 4 }),
});

// ---- graveyard-ui-actions generators --------------------------------------------------------------------------

const ACTION_SEGMENT = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom("actions", "actions-rs", "docker", "DeterminateSystems", "Swatinem", "softprops", "peter-evans", "mikepenz") },
  { weight: 3, arbitrary: fc.stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_."), { minLength: 1, maxLength: 12 }).filter((s) => /^[A-Za-z0-9]/.test(s)) },
);

/** Action_Names (`owner/repo[/sub/path]`) shaped like the real `uses:` values of demo/nixpacks-actions.json, plus upper case, dots and sub paths. */
export const actionNameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom("actions/checkout", "actions-rs/toolchain", "actions-rs/cargo", "DeterminateSystems/nix-installer-action", "Swatinem/rust-cache", "docker/build-push-action", "softprops/action-gh-release", "github/codeql-action/analyze", "owner/repo.name/sub/path") },
  { weight: 4, arbitrary: fc.tuple(ACTION_SEGMENT, ACTION_SEGMENT).map(([o, r]) => `${o}/${r}`) },
  { weight: 2, arbitrary: fc.tuple(ACTION_SEGMENT, ACTION_SEGMENT, fc.array(ACTION_SEGMENT, { minLength: 1, maxLength: 2 })).map(([o, r, p]) => [o, r, ...p].join("/")) },
);

export interface ActionsProofCase {
  /** A github-actions Scan_Report (every version a range, as for refs read from `uses:` lines). */
  report: ScanReport;
  /** proof name -> report text, for the subset of dependencies that has a report. */
  store: Record<string, string>;
}

/**
 * github-actions reports of 1-8 distinct Action_Names with mixed grades and a random proof store keyed by `nameOf`
 * (the Action_Proof_Name; the caller supplies an independent model, so the generator needs no Node built-in).
 */
export function actionsReportArb(nameOf: (actionName: string) => string): fc.Arbitrary<ActionsProofCase> {
  return fc
    .array(fc.tuple(actionNameArb, fc.constantFrom<GradeBand>("dead", "dying", "ailing", "alive"), fc.boolean()), { minLength: 1, maxLength: 8 })
    .map((rows) => {
      const seen = new Set<string>();
      const names = new Set<string>();
      const deps: FixtureDependency[] = [];
      const store: Record<string, string> = {};
      for (const [name, grade, present] of rows) {
        const proofName = nameOf(name);
        if (seen.has(name) || names.has(proofName)) continue;
        seen.add(name);
        names.add(proofName);
        deps.push({ name, signals: GRADE_SIGNALS[grade], versionSource: "range" });
        if (present) store[proofName] = buildProofText("proved", { repo: "nixpacks-actions", package: proofName });
      }
      return { report: { ...buildReport(deps, { repo: "owner/repo" }), ecosystem: "github-actions" as const }, store };
    });
}
