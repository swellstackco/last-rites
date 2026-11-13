import { readFileSync } from "node:fs";
import { basename } from "node:path";
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  assembleReport,
  createScanPipeline,
  createUsageSurface,
  exorcise,
  serializeReport,
  type CliArgs,
  type ReportFs,
  type ScanOutcome,
} from "@graveyard-kit/exorcist-npm/programmatic";
import { createFakeClock, createMemoryFs } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import { serializeProofReport } from "@graveyard-kit/skeleton/proof";
import { SIGNAL_NAMES } from "@graveyard-kit/skeleton";
import { createLocalRepoFiles } from "../local-files.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "../test-support/sabotage-runner.js";
import { REAL_TOOLS, type Tools } from "../test-support/validators.js";
import { counting, makeDeps, memoryProbe, recordingReportFs, type CountedDeps } from "../test-support/fakes.js";
import { e18eOutcomeArb, npmNameArb, proofPartsFor, proofScenarioArb, scanOutcomeArb } from "../test-support/arbitraries/tool-outcomes.js";

export const name = "Property 3: Thin-wrapper equivalence";

const fail = (m: string): never => {
  throw new Error(m);
};
const text = (r: CallToolResult, i = 0): string => (r.content[i] as { text: string }).text;
const same = (a: unknown, b: unknown, what: string): void => {
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${what}: ${JSON.stringify(a)?.slice(0, 120)} !== ${JSON.stringify(b)?.slice(0, 120)}`);
};

const fixture = (rel: string) => readFileSync(new URL(`../__fixtures__/${rel}`, import.meta.url), "utf8");
const PKG_JSON = JSON.parse(fixture("checkout/package.json")) as Record<string, unknown>;
const LOCK = fixture("checkout/package-lock.json");
const LIB_NAMES = ["alpha-lib", "beta-lib", "gamma-lib"] as const;

const evidence = async () => ({
  signals: Object.fromEntries(SIGNAL_NAMES.map((n) => [n, { kind: "unknown" }])) as never,
  unknownReasons: {},
  warnings: [],
});

/** Total number of calls to counted Deps other than the listed ones. */
const others = (d: CountedDeps, except: Array<keyof CountedDeps["counts"]>): number =>
  (Object.keys(d.counts) as Array<keyof CountedDeps["counts"]>).filter((k) => !except.includes(k)).reduce((n, k) => n + d.counts[k].calls.length, 0);

const SOURCE_FOR = (pkg: string, n: number): string =>
  `const m = require(${JSON.stringify(pkg)});\n` + Array.from({ length: n }, (_, i) => `m(${i}, "x${i}");`).join("\n") + "\n";

export function build(impl: Tools) {
  return fc.asyncProperty(
    fc.oneof(
      fc.tuple(scanOutcomeArb, fc.constantFrom<string | undefined>(undefined, "main", "v1.2.3")).map(([outcome, ref]) => ({ kind: "github" as const, outcome, ref })),
      fc
        .tuple(fc.subarray([...LIB_NAMES]), fc.constantFrom("proj", "my.app", "a-b"))
        .map(([libs, dir]) => ({ kind: "local" as const, libs, dir })),
      fc.tuple(scanOutcomeArb, fc.nat({ max: 9 })).map(([outcome, pick]) => ({ kind: "death" as const, outcome, pick })),
      fc.tuple(npmNameArb, fc.integer({ min: 0, max: 4 })).map(([pkg, n]) => ({ kind: "usage" as const, pkg, n })),
      fc.tuple(e18eOutcomeArb, npmNameArb).map(([outcome, pkg]) => ({ kind: "find" as const, outcome, pkg })),
      fc.tuple(proofScenarioArb, fc.boolean()).map(([scenario, withOut]) => ({ kind: "pin" as const, scenario, withOut })),
    ),
    async (s) => {
      if (s.kind === "github") {
        const github = counting(async (): Promise<ScanOutcome> => s.outcome);
        const deps = makeDeps({ scan: { ...makeDeps().scan, github } });
        const r = await impl.scanRepo(deps, { repo: "octo/cat", ...(s.ref === undefined ? {} : { ref: s.ref }) });
        same(github.calls.length, 1, "pipeline calls");
        same((github.calls[0] as unknown[])[0], s.ref === undefined ? { owner: "octo", repo: "cat" } : { owner: "octo", repo: "cat", ref: s.ref }, "RepoInput");
        if (others(deps, ["github"]) !== 0) fail("another function was called");
        if (s.outcome.ok) same(text(r), serializeReport(s.outcome.report), "scan_repo github text");
        else if (r.isError !== true) fail("pipeline error not an error");
        return true;
      }
      if (s.kind === "local") {
        const pkg = { ...PKG_JSON, dependencies: Object.fromEntries(s.libs.map((l) => [l, "^1.0.0"])), devDependencies: {} };
        const dirAbs = `/work/${s.dir}`;
        const files = { [`${dirAbs}/package.json`]: JSON.stringify(pkg), [`${dirAbs}/package-lock.json`]: LOCK };
        const probe = memoryProbe(files);
        const clock = createFakeClock().clock;
        const make = (dir: string) =>
          createScanPipeline({ evidence, files: createLocalRepoFiles(probe, dir), clock, limits: { maxDependencies: 300, concurrency: 2 } });
        const local = counting(make);
        const deps = makeDeps({ probe, scan: { ...makeDeps().scan, local, clock } });
        const r = await impl.scanRepo(deps, { repo: `./${s.dir}` });
        same(local.calls, [[dirAbs]], "local pipeline dirs");
        if (others(deps, ["local"]) !== 0 || deps.counts.github.calls.length !== 0) fail("another function was called");
        const direct = await make(dirAbs)({ owner: "local", repo: s.dir });
        if (direct.ok) same(text(r), serializeReport(direct.report), "scan_repo local text");
        else if (r.isError !== true) fail("local pipeline error not an error");
        return true;
      }
      if (s.kind === "death") {
        const renamed: ScanOutcome = s.outcome.ok
          ? { ok: true, report: { ...s.outcome.report, dependencies: s.outcome.report.dependencies.map((d, i) => ({ ...d, name: `pkg-${i}` })), skipped: [] } }
          : s.outcome;
        const github = counting(async (): Promise<ScanOutcome> => renamed);
        const deps = makeDeps({ scan: { ...makeDeps().scan, github } });
        const n = renamed.ok ? renamed.report.dependencies.length : 0;
        const index = n === 0 ? 0 : s.pick % n;
        const r = await impl.deathReport(deps, { repo: "octo/cat", package: `pkg-${index}` });
        same(github.calls.length, 1, "pipeline calls");
        if (others(deps, ["github"]) !== 0) fail("another function was called");
        if (!renamed.ok || n === 0) {
          if (r.isError !== true) fail("expected an error");
          return true;
        }
        const rep = renamed.report;
        const slash = rep.repo.indexOf("/");
        const one = assembleReport({
          target: { owner: rep.repo.slice(0, Math.max(slash, 0)), repo: rep.repo.slice(slash + 1), ref: rep.ref },
          scannedAt: rep.scannedAt,
          scanned: [rep.dependencies[index]!],
          skipped: [],
          warnings: rep.warnings,
        });
        same(text(r), serializeReport({ ...one, repo: rep.repo }), "death_report text");
        return true;
      }
      if (s.kind === "usage") {
        const files = { "src/a.js": SOURCE_FOR(s.pkg, s.n) };
        const surface = createUsageSurface({ fs: createMemoryFs(files, "/work/proj") });
        const counted = counting(surface);
        const deps = makeDeps({ probe: memoryProbe({ "/work/proj/src/a.js": files["src/a.js"] }), usageSurface: counted });
        const r = await impl.usageSurface(deps, { path: "./proj", package: s.pkg });
        same(counted.calls, [[{ root: "/work/proj", package: s.pkg }]], "usage surface calls");
        if (others(deps, ["usageSurface"]) !== 0) fail("another function was called");
        const u = await surface({ root: "/work/proj", package: s.pkg });
        same(
          text(r),
          serializeProofReport({ repo: "proj", package: s.pkg, filesScanned: u.filesScanned, callSites: u.callSites, importSites: u.importSites, attempts: [] }),
          "usage_surface text",
        );
        return true;
      }
      if (s.kind === "find") {
        const e18e = counting(async () => s.outcome);
        const deps = makeDeps({ e18e });
        const r = await impl.findReplacement(deps, { package: s.pkg });
        same(e18e.calls, [[s.pkg]], "e18e calls");
        if (others(deps, ["e18e"]) !== 0) fail("another function was called");
        if (!s.outcome.ok) {
          if (r.isError !== true) fail("expected evidence_unavailable");
          return true;
        }
        const ev = s.outcome.value;
        same(text(r), JSON.stringify({ package: s.pkg, replacement: ev.known && ev.replacement !== undefined ? ev.replacement : "none", sourceUrl: ev.sourceUrl }), "find_replacement text");
        return true;
      }
      // pin
      const sc = s.scenario;
      const base = makeDeps();
      const parts = proofPartsFor(sc, base.proof);
      const reportFs = recordingReportFs();
      const out = "proofs/proj/x.json";
      const usageCalls = counting(parts.usageSurface);
      const loadCalls = counting(parts.proof.loadCandidate);
      const deps = makeDeps({
        probe: memoryProbe({ "/work/proj/a.js": "", "/work/cand.js": "" }),
        usageSurface: usageCalls,
        proof: { ...parts.proof, loadCandidate: loadCalls, nodeReportFs: reportFs },
      });
      const r = await impl.generatePinTests(deps, {
        path: "./proj",
        package: parts.package,
        candidate: "cand.js",
        runs: sc.runs,
        ...(s.withOut ? { out } : {}),
      });
      same(usageCalls.calls.length, 1, "usage surface calls");
      same(loadCalls.calls.length, 1, "candidate loads");
      if (deps.counts.github.calls.length + deps.counts.local.calls.length + deps.counts.e18e.calls.length !== 0) fail("another function was called");

      // The direct call: same CliArgs, in-memory ReportFs.
      let written: string | undefined;
      const memFs: ReportFs = { readText: async () => undefined, writeAtomic: async (_p, t) => void (written = t) };
      const cli: CliArgs = {
        repo: "/work/proj",
        package: parts.package,
        candidate: "/work/cand.js",
        runs: sc.runs,
        seed: 20261113,
        out: s.withOut ? `/work/${out}` : `memory/proofs/dry-run/${parts.package}.json`,
        label: basename("/work/proj"),
        fresh: false,
      };
      await exorcise(
        {
          usageSurface: parts.usageSurface,
          fs: memFs,
          recipes: parts.proof.recipes,
          loadOracle: parts.proof.loadOracle,
          loadCandidate: parts.proof.loadCandidate,
          repoRoot: "/work",
          print: () => {},
        },
        cli,
      );
      same(text(r), written, "generate_pin_tests text");
      if (s.withOut) same(reportFs.writes.map((w) => [w.path, w.text]), [[`/work/${out}`, written]], "recording ReportFs");
      else same(reportFs.writes, [], "nothing written without out");
      return true;
    },
  );
}

export const property3: NamedAsyncProperty<Tools> = { name, build };

describe(name, () => {
  it("holds for the real tools", async () => {
    await assertPropertyAsync(name, build(REAL_TOOLS));
  });

  it("a sabotaged tool is caught (smoke; the full list is task 5.14)", async () => {
    const R = REAL_TOOLS;
    await expect(
      assertAllSabotagesCaughtAsync(name, [property3], [
        {
          name: "extra field",
          impl: {
            ...R,
            findReplacement: async (d, a) => {
              const r = await R.findReplacement(d, a);
              if (r.isError === true) return r;
              const j = JSON.parse((r.content[0] as { text: string }).text) as object;
              return { content: [{ type: "text", text: JSON.stringify({ ...j, source: "mcp" }) }] };
            },
          },
        },
      ]),
    ).resolves.toBeUndefined();
  });
});
