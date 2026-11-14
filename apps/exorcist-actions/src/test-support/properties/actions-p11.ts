import { deepStrictEqual, ok as assert, strictEqual } from "node:assert";
import fc from "fast-check";
import { SIGNAL_NAMES, scoreDeath } from "@last-rites/skeleton";
import type { PackageSignals, SignalName } from "@last-rites/skeleton";
import { parseReport, serializeReport } from "@last-rites/exorcist-npm/programmatic";
import { reportArb } from "@last-rites/exorcist-npm/programmatic/testing";
import type { ScanReport } from "@last-rites/exorcist-npm/programmatic";
import type { EvidenceResult } from "../../evidence/assemble.js";
import type { ActionUse, InventoryResult, SkippedUse } from "../../inventory/types.js";
import { buildScanReport } from "../../scan/report.js";
import { runScan } from "../../scan/scan.js";
import { memorySourceFs } from "../memory-source-fs.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test: the pure builder, the codec of the npm app, and the one clock reading of runScan. */
export interface ScanImpl {
  build: typeof buildScanReport;
  serialize: typeof serializeReport;
  parse: typeof parseReport;
  runScan: typeof runScan;
}

export const realScanImpl: ScanImpl = { build: buildScanReport, serialize: serializeReport, parse: parseReport, runScan };

// ------------------------------------------------------------------ generators

const BOOLEAN_SIGNALS: ReadonlySet<SignalName> = new Set(["deprecated", "repoArchived", "knownReplacementExists"]);

const signalValueArb = (name: SignalName): fc.Arbitrary<boolean | number | undefined> =>
  fc.option(
    BOOLEAN_SIGNALS.has(name) ? (fc.boolean() as fc.Arbitrary<boolean | number>) : fc.integer({ min: 0, max: 200 }),
    { nil: undefined },
  );

export const evidenceArb: fc.Arbitrary<EvidenceResult> = fc
  .tuple(
    fc.tuple(...SIGNAL_NAMES.map(signalValueArb)),
    fc.array(fc.constantFrom("w1", "w2", "evidence failed for x/y"), { maxLength: 2 }),
    fc.boolean(),
  )
  .map(([values, warnings, withReplacement]) => {
    const signals: Record<string, unknown> = {};
    const unknownReasons: EvidenceResult["unknownReasons"] = {};
    const urls: Partial<Record<SignalName, string>> = {};
    SIGNAL_NAMES.forEach((name, i) => {
      const v = values[i];
      if (v === undefined) {
        signals[name] = { kind: "unknown" };
        unknownReasons[name] = { source: "github", category: "not_found", message: `github: not_found (${name})` };
      } else {
        signals[name] = { kind: "known", value: v };
        urls[name] = `https://example.test/${name}`;
      }
    });
    signals["sourceUrls"] = urls;
    return {
      signals: signals as unknown as PackageSignals,
      unknownReasons,
      ...(withReplacement ? { replacement: { type: "replacement", replacement: "a/b", replacements: ["a/b"] } } : {}),
      warnings,
    } satisfies EvidenceResult;
  });

const ownerArb = fc.constantFrom("actions", "Actions", "actions-rs", "o", "O");
const repoArb = fc.constantFrom("checkout", "Checkout", "cargo", "toolchain", "r");
const refArb = fc.constantFrom("v1", "v2", "v10", "main", "b", "A", "1.0", "0123456789abcdef0123456789abcdef01234567");

export interface UseSpec {
  owner: string;
  repo: string;
  ref: string;
  path: string | undefined;
}

const useSpecArb: fc.Arbitrary<UseSpec> = fc.record({
  owner: ownerArb,
  repo: repoArb,
  ref: refArb,
  path: fc.option(fc.constantFrom("sub", "a/b"), { nil: undefined }),
});

const skippedArb: fc.Arbitrary<SkippedUse> = fc.record({
  file: fc.constantFrom(".github/workflows/a.yml", ".github/workflows/b.yaml"),
  line: fc.integer({ min: 1, max: 99 }),
  column: fc.integer({ min: 1, max: 40 }),
  specifier: fc.constantFrom("./local", "docker://img:1", "owner/repo", "a/b@${{ x }}"),
  reason: fc.constantFrom<SkippedUse["reason"][]>("docker", "local", "no_ref", "malformed", "unsupported_value"),
});

export interface ScanCase {
  specs: UseSpec[];
  skipped: SkippedUse[];
  warnings: string[];
  evidence: EvidenceResult[];
  /** A permutation seed for the insertion order of the evidence map. */
  reverse: boolean;
}

export const scanCaseArb: fc.Arbitrary<ScanCase> = fc.record({
  specs: fc.array(useSpecArb, { maxLength: 10 }),
  skipped: fc.array(skippedArb, { maxLength: 4 }),
  warnings: fc.array(fc.constantFrom("no .github/workflows directory", "x.yml: unreadable"), { maxLength: 2 }),
  evidence: fc.array(evidenceArb, { minLength: 10, maxLength: 10 }),
  reverse: fc.boolean(),
});

export function useOf(spec: UseSpec, i: number): ActionUse {
  return {
    file: ".github/workflows/ci.yml",
    line: i + 1,
    column: 15,
    offset: i * 40,
    length: 10,
    owner: spec.owner,
    repo: spec.repo,
    ...(spec.path !== undefined ? { path: spec.path } : {}),
    ref: spec.ref,
    refKind: /^[0-9a-f]{40}$/.test(spec.ref) ? "sha" : "mutable",
    with: {},
    withKeys: [],
    jobId: "build",
    site: "step",
    stepIndex: i,
    outputRefs: [],
  };
}

export interface Prepared {
  inventory: InventoryResult;
  /** The Action_Name of each group in inventory order (first use's casing) and its evidence. */
  groups: Array<{ name: string; refs: string[]; evidence: EvidenceResult }>;
  evidence: Map<string, EvidenceResult>;
}

/** The model: groups by lowercase name, first casing wins. Written without the helpers of the implementation. */
export function prepare(c: ScanCase): Prepared {
  const uses = c.specs.map(useOf);
  const order: string[] = [];
  const byKey = new Map<string, { name: string; refs: string[] }>();
  for (const u of uses) {
    const name = `${u.owner}/${u.repo}`;
    const key = name.toLowerCase();
    const g = byKey.get(key);
    if (g) g.refs.push(u.ref);
    else {
      byKey.set(key, { name, refs: [u.ref] });
      order.push(key);
    }
  }
  const groups = order.map((key, i) => ({ ...byKey.get(key)!, evidence: c.evidence[i]! }));
  const entries: Array<[string, EvidenceResult]> = groups.map((g) => [g.name, g.evidence]);
  if (c.reverse) entries.reverse();
  return {
    inventory: { uses, skipped: c.skipped, warnings: c.warnings, filesRead: 1 },
    groups,
    evidence: new Map(entries),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const LABEL = "owner/name";
const REF = "abc1234";
const AT = "2026-01-01T00:00:00.000Z";

// ------------------------------------------------------------------ properties

export const scanProperties: NamedProperty<ScanImpl>[] = [
  {
    name: "P11 one dependency per Action_Name with the declared fields and the order of assembleReport",
    build: (impl) =>
      fc.property(scanCaseArb, (c) => {
        const p = prepare(c);
        const report = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        strictEqual(report.repo, LABEL);
        strictEqual(report.ref, REF);
        strictEqual(report.scannedAt, AT);
        strictEqual(report.ecosystem, "github-actions");
        const expected = p.groups
          .map((g) => ({
            name: g.name,
            declaredRange: [...new Set(g.refs)].sort(cmp).join(", "),
            score: scoreDeath(g.evidence.signals).score,
            grade: scoreDeath(g.evidence.signals).grade,
          }))
          .sort((a, b) => b.score - a.score || cmp(a.name, b.name));
        deepStrictEqual(
          report.dependencies.map((d) => ({ name: d.name, declaredRange: d.declaredRange, score: d.death.score, grade: d.death.grade })),
          expected,
        );
        for (const d of report.dependencies) {
          deepStrictEqual(d.kinds, ["dependencies"]);
          strictEqual(d.versionSource, "range");
          strictEqual("resolvedVersion" in d, false);
          const g = p.groups.find((x) => x.name === d.name)!;
          deepStrictEqual(d.signals, g.evidence.signals);
          deepStrictEqual(d.unknownReasons, g.evidence.unknownReasons);
          deepStrictEqual(d.evidenceWarnings, g.evidence.warnings);
          deepStrictEqual(d.replacement, g.evidence.replacement);
        }
      }),
  },
  {
    name: "P11 the summary counts every grade and equals the number of dependencies",
    build: (impl) =>
      fc.property(scanCaseArb, (c) => {
        const p = prepare(c);
        const r = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        const s = r.summary;
        strictEqual(s.total, r.dependencies.length);
        strictEqual(s.alive + s.ailing + s.dying + s.dead, s.total);
        strictEqual(s.skipped, c.skipped.length);
        for (const grade of ["alive", "ailing", "dying", "dead"] as const) {
          strictEqual(s[grade], r.dependencies.filter((d) => d.death.grade === grade).length);
        }
      }),
  },
  {
    name: "P11 every skipped use is a skipped entry plus a warning, and every inventory warning is kept",
    build: (impl) =>
      fc.property(scanCaseArb, (c) => {
        const p = prepare(c);
        const r = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        deepStrictEqual(
          r.skipped,
          c.skipped.map((s) => ({ name: s.specifier, kind: "dependencies", specifier: s.specifier, reason: "other" })),
        );
        deepStrictEqual(r.warnings, [
          ...c.warnings,
          ...c.skipped.map((s) => `${s.file}:${s.line}: skipped ${s.reason}: ${s.specifier}`),
        ]);
      }),
  },
  {
    name: "P11 the report is valid for parseReport and canonical, with ecosystem right after ref",
    build: (impl) =>
      fc.property(scanCaseArb, (c) => {
        const p = prepare(c);
        const r = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        const text = impl.serialize(r);
        const parsed = impl.parse(text);
        assert(parsed.ok, "the serialized report must parse");
        deepStrictEqual(parsed.report, r);
        strictEqual(impl.serialize(parsed.report), text);
        deepStrictEqual(Object.keys(JSON.parse(text) as object).slice(0, 4), ["repo", "ref", "ecosystem", "scannedAt"]);
      }),
  },
  {
    name: "P11 the result does not depend on the order of the evidence map",
    build: (impl) =>
      fc.property(scanCaseArb, (c) => {
        const p = prepare(c);
        const a = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        const reversed = new Map([...p.evidence].reverse());
        const b = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: reversed });
        deepStrictEqual(b, a);
      }),
  },
  {
    name: "P11 npm reports serialize without the ecosystem key, byte for byte as before",
    build: (impl) =>
      fc.property(reportArb, (r) => {
        const { ecosystem: _drop, ...plain } = r as ScanReport;
        void _drop;
        const base = impl.serialize(plain as ScanReport);
        strictEqual(impl.serialize({ ...plain, ecosystem: "npm" } as ScanReport), base);
        strictEqual(base.includes("ecosystem"), false);
        deepStrictEqual(Object.keys(JSON.parse(base) as object), ["repo", "ref", "scannedAt", "dependencies", "skipped", "warnings", "summary"]);
        const parsed = impl.parse(base);
        assert(parsed.ok, "an npm report parses");
        strictEqual(parsed.report.ecosystem, undefined);
        strictEqual(impl.serialize(parsed.report), base);
      }),
  },
  {
    name: "P11 parseReport rejects ecosystem npm and any other value",
    build: (impl) =>
      fc.property(scanCaseArb, fc.constantFrom("npm", "x", "GitHub Actions", ""), (c, value) => {
        const p = prepare(c);
        const r = impl.build({ label: LABEL, ref: REF, scannedAt: AT, inventory: p.inventory, evidence: p.evidence });
        const text = impl.serialize(r);
        const edited = text.replace('"ecosystem": "github-actions"', `"ecosystem": ${JSON.stringify(value)}`);
        assert(edited !== text, "the key is written");
        strictEqual(impl.parse(edited).ok, false);
        // and the value without the key is the plain npm report
        strictEqual(impl.parse(text).ok, true);
      }),
  },
  {
    name: "P11 runScan reads the clock exactly once and scannedAt is that reading",
    build: (impl) =>
      fc.asyncProperty(scanCaseArb, async (c) => {
        const files: Record<string, string> = {
          ".github/workflows/ci.yml": `jobs:\n  b:\n    steps:\n${c.specs.map((s) => `      - uses: ${s.owner}/${s.repo}@${s.ref}\n`).join("")}`,
        };
        const fs = memorySourceFs(files, [{ name: "ci.yml", kind: "file" }]);
        let reads = 0;
        const clock = (): Date => {
          reads += 1;
          return new Date(Date.UTC(2026, 0, 1, 0, 0, reads));
        };
        const stage = async (): Promise<EvidenceResult> => c.evidence[0]!;
        const r = await impl.runScan({ root: "/repo", label: LABEL, ref: REF }, { fs, evidence: stage, clock });
        strictEqual(reads, 1);
        strictEqual(r.scannedAt, "2026-01-01T00:00:01.000Z");
      }),
  },
];
