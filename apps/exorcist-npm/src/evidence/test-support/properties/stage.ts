import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SIGNAL_NAMES, type SignalName } from "@graveyard-kit/skeleton";
import fc from "fast-check";
import { cachePath } from "../../http/cache.js";
import { monthsSince } from "../../months-since.js";
import type { EvidenceResult } from "../../types.js";
import type { FailureMode } from "../fake-http.js";
import { FIXTURES_ROOT } from "../fake-http.js";
import { evidenceResultProblems } from "../result-invariant.js";
import type { NamedAsyncProperty } from "../sabotage-runner.js";
import {
  CASES,
  MODE_CATEGORY,
  SOURCE_HOST,
  SOURCE_NAMES,
  hostOf,
  realStage,
  runCase,
  type FixtureCase,
  type SourceName,
  type StageFactory,
} from "../stage-harness.js";

const caseArb: fc.Arbitrary<FixtureCase> = fc.constantFrom(...CASES);
const MODES: FailureMode[] = ["network_error", "timeout", "http_500", "rate_limited", "malformed_body"];
const modeArb = fc.option(fc.constantFrom(...MODES), { nil: undefined });
const modeWithNotFoundArb = fc.option(fc.constantFrom<FailureMode>(...MODES, "not_found"), { nil: undefined });

/** Per source: no failure, or a failure mode. npm `not_found` is excluded on purpose (Requirement 1.7 wins). */
const failuresArb = fc.record({
  npm: modeArb,
  github: modeWithNotFoundArb,
  osv: modeWithNotFoundArb,
  e18e: modeWithNotFoundArb,
});

const nowArb = fc
  .tuple(fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) }), fc.boolean())
  .map(([ms, asString]) => (asString ? new Date(ms).toISOString() : new Date(ms)));

const rangeArb = fc.constantFrom<string | undefined>(undefined, "*", ">=0.0.0", "latest");

function fail(msg: string): never {
  throw new Error(msg);
}

const baselineMemo = new Map<string, Promise<EvidenceResult>>();
/** The oracle: the real stage with no failing source. */
function baseline(c: FixtureCase, now: Date | string, versionRange?: string): Promise<EvidenceResult> {
  const key = `${c.caseName}|${new Date(now).toISOString()}|${versionRange ?? ""}`;
  let p = baselineMemo.get(key);
  if (!p) {
    p = runCase({ make: realStage, fixtureCase: c, now, versionRange }).then((o) => o.result);
    baselineMemo.set(key, p);
  }
  return p;
}

type Failures = Partial<Record<SourceName, FailureMode | undefined>>;

/** The failed source a signal's value chain hits first (npm before github and osv), per the dependency table. */
function firstFailure(s: SignalName, c: FixtureCase, f: Failures): { source: SourceName; mode: FailureMode } | undefined {
  const hit = (source: SourceName) => (f[source] ? { source, mode: f[source] as FailureMode } : undefined);
  switch (s) {
    case "deprecated":
    case "monthsSinceLastPublish":
    case "maintainerCount":
      return hit("npm");
    case "repoArchived":
    case "monthsSinceLastCommit":
      return hit("npm") ?? (c.hasRepo ? hit("github") : undefined);
    case "openVulnsNoFix":
      return hit("npm") ?? hit("osv");
    case "knownReplacementExists":
      return hit("e18e");
  }
}

/** Property 3: Failure isolation. */
export const property3: NamedAsyncProperty<StageFactory> = {
  name: "Property 3: Failure isolation",
  build: (make) =>
    fc.asyncProperty(caseArb, failuresArb, nowArb, async (c, failures, now) => {
      const base = await baseline(c, now);
      const baseProblems = evidenceResultProblems(base);
      if (baseProblems.length) fail(`baseline violates the result invariant: ${baseProblems.join("; ")}`);

      const { result: r } = await runCase({ make, fixtureCase: c, failures, now });
      const problems = evidenceResultProblems(r);
      if (problems.length) fail(`result invariant: ${problems.join("; ")}`);

      for (const s of SIGNAL_NAMES) {
        const ff = firstFailure(s, c, failures);
        if (ff) {
          if (r.signals[s].kind !== "unknown") fail(`${s} depends on failed ${ff.source} but is known`);
          const reason = r.unknownReasons[s];
          if (reason?.category !== MODE_CATEGORY[ff.mode]) {
            fail(`${s}: expected category ${MODE_CATEGORY[ff.mode]} (${ff.source} ${ff.mode}), got ${reason?.category}`);
          }
          if (reason.source !== ff.source) fail(`${s}: expected reason source ${ff.source}, got ${reason.source}`);
        } else {
          if (JSON.stringify(r.signals[s]) !== JSON.stringify(base.signals[s])) fail(`${s} changed although none of its sources failed`);
          if (r.signals.sourceUrls?.[s] !== base.signals.sourceUrls?.[s]) fail(`${s}: source URL changed`);
          if (JSON.stringify(r.unknownReasons[s]) !== JSON.stringify(base.unknownReasons[s])) fail(`${s}: reason changed`);
        }
      }
      const expectedReplacement = failures.e18e ? undefined : base.replacement;
      if (JSON.stringify(r.replacement) !== JSON.stringify(expectedReplacement)) fail("replacement differs from the baseline");
      if (JSON.stringify(r.warnings) !== JSON.stringify(base.warnings)) fail("warnings differ from the baseline");

      if (SOURCE_NAMES.every((src) => failures[src])) {
        if (SIGNAL_NAMES.some((s) => r.signals[s].kind !== "unknown")) fail("all sources failed but a signal is known");
        if (Object.keys(r.signals.sourceUrls ?? {}).length !== 0) fail("all sources failed but sourceUrls is not empty");
      }
    }),
};

/** Timestamps recorded in the fixtures, read independently of the stage code. */
export function fixtureTimestamps(caseName: string): { publish?: string; commit?: string } {
  const read = (file: string): { response: { body: string } } | undefined => {
    try {
      return JSON.parse(readFileSync(join(FIXTURES_ROOT, caseName, file), "utf8")) as { response: { body: string } };
    } catch {
      return undefined;
    }
  };
  const out: { publish?: string; commit?: string } = {};
  const npm = read("npm.json");
  if (npm) {
    const time = (JSON.parse(npm.response.body) as { time?: Record<string, string> }).time ?? {};
    let best = -Infinity;
    for (const [k, v] of Object.entries(time)) {
      if (k === "created" || k === "modified") continue;
      const ms = Date.parse(v);
      if (!Number.isNaN(ms) && ms > best) {
        best = ms;
        out.publish = v;
      }
    }
  }
  const commit = read("github-commit.json");
  if (commit) {
    const c = (JSON.parse(commit.response.body) as Array<{ commit: { committer?: { date?: string }; author?: { date?: string } } }>)[0];
    const d = c?.commit.committer?.date ?? c?.commit.author?.date;
    if (d) out.commit = d;
  }
  return out;
}

const picksArb = fc.array(fc.nat({ max: 1000 }), { minLength: 50, maxLength: 50 });

/** Property 5: Determinism and dependence on the injected Now only. */
export const property5: NamedAsyncProperty<StageFactory> = {
  name: "Property 5: Determinism and dependence on the injected Now only",
  build: (make) =>
    fc.asyncProperty(
      caseArb,
      rangeArb,
      failuresArb,
      nowArb,
      fc.integer({ min: 1, max: 8 }),
      picksArb,
      picksArb,
      async (c, versionRange, failures, now, maxConcurrency, picksA, picksB) => {
        const a = await runCase({ make, fixtureCase: c, failures, now, versionRange, maxConcurrency, picks: picksA });
        const b = await runCase({ make, fixtureCase: c, failures, now, versionRange, maxConcurrency, picks: picksB });
        // Order-sensitive comparison: key order is part of determinism.
        if (JSON.stringify(a.result) !== JSON.stringify(b.result)) {
          fail(`two runs differ:\n${JSON.stringify(a.result)}\n${JSON.stringify(b.result)}`);
        }
        const problems = evidenceResultProblems(a.result);
        if (problems.length) fail(`result invariant: ${problems.join("; ")}`);

        const ts = fixtureTimestamps(c.caseName);
        const nowDate = new Date(now);
        const check = (s: "monthsSinceLastPublish" | "monthsSinceLastCommit", stamp: string | undefined) => {
          const v = a.result.signals[s];
          if (v.kind !== "known") return;
          if (stamp === undefined) fail(`${s} known but the fixture has no timestamp`);
          const expected = monthsSince(stamp, nowDate);
          if (v.value !== expected) fail(`${s} = ${v.value}, expected monthsSince(${stamp}, ${nowDate.toISOString()}) = ${expected}`);
        };
        check("monthsSinceLastPublish", ts.publish);
        check("monthsSinceLastCommit", ts.commit);
      },
    ),
};

const ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");
const tokenArb = fc
  .array(fc.constantFrom(...ALNUM), { minLength: 12, maxLength: 40 })
  .map((cs) => `tok_${cs.join("")}`);

const hasAuth = (headers: Record<string, string> | undefined): boolean =>
  Object.keys(headers ?? {}).some((h) => h.toLowerCase() === "authorization");
const authValue = (headers: Record<string, string> | undefined): string | undefined =>
  Object.entries(headers ?? {}).find(([h]) => h.toLowerCase() === "authorization")?.[1];

/** Property 11: The GitHub token is confined to GitHub requests and never persisted. */
export const property11: NamedAsyncProperty<StageFactory> = {
  name: "Property 11: The GitHub token is confined to GitHub requests and never persisted",
  build: (make) =>
    fc.asyncProperty(tokenArb, caseArb, fc.boolean(), fc.boolean(), async (token, c, rejectTokenOnce, osvDown) => {
      const now = "2026-11-13T00:00:00Z";
      const out = await runCase({
        make,
        fixtureCase: c,
        now,
        token,
        rejectTokenOnce,
        failures: osvDown ? { osv: "http_500" } : {},
      });
      const { result, log } = out;

      const gh = log.filter((l) => hostOf(l.req.url) === SOURCE_HOST.github);
      for (const l of log) {
        if (hostOf(l.req.url) !== SOURCE_HOST.github && hasAuth(l.req.headers)) {
          fail(`token sent to non-GitHub host: ${l.req.url}`);
        }
      }
      let rejectedAt = -1;
      gh.forEach((l, i) => {
        if (l.status === 401) rejectedAt = i;
      });
      gh.forEach((l, i) => {
        const authed = hasAuth(l.req.headers);
        const mustBeAuthed = rejectedAt < 0 || i <= rejectedAt;
        if (mustBeAuthed && authValue(l.req.headers) !== `Bearer ${token}`) fail(`GitHub request #${i} lacks the bearer token`);
        if (!mustBeAuthed && authed) fail(`GitHub request #${i} after a rejected token still carries it`);
      });
      const expectedWarnings = rejectedAt >= 0 ? 1 : 0;
      if (result.warnings.length !== expectedWarnings) {
        fail(`expected ${expectedWarnings} warning(s), got ${JSON.stringify(result.warnings)}`);
      }
      if (expectedWarnings === 1 && !/token/i.test(result.warnings[0] ?? "")) fail("warning must mention the token");

      // The token appears nowhere that is persisted or returned.
      const leaks: Array<[string, string]> = [
        ["serialized result", JSON.stringify(result)],
        ...Object.entries(result.unknownReasons).map(([k, v]) => [`reason ${k}`, v?.message ?? ""] as [string, string]),
        ...result.warnings.map((w, i) => [`warning ${i}`, w] as [string, string]),
        ...out.cacheFiles.flatMap((f) => [[`cache file name ${f.name}`, f.name], [`cache file ${f.name}`, f.content]] as Array<[string, string]>),
      ];
      for (const [where, text] of leaks) if (text.includes(token)) fail(`token leaked into ${where}`);

      // Cache keys ignore headers: the files on disk are exactly the keys of the cacheable (2xx) requests.
      const expected = new Set(
        log
          .filter((l) => l.status !== undefined && l.status >= 200 && l.status <= 299)
          .map((l) => cachePath(out.cacheRoot, l.req).split("/").pop() as string),
      );
      const actual = new Set(out.cacheFiles.map((f) => f.name));
      for (const e of expected) if (!actual.has(e)) fail(`expected cache file ${e} (key from method, URL and body only) is missing`);
      for (const a of actual) if (!expected.has(a)) fail(`unexpected cache file ${a}`);
    }),
};
