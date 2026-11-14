import { afterEach, describe, expect, it } from "vitest";
import { scoreDeath } from "@last-rites/skeleton";
import { DEFAULT_CONFIG, type EvidenceConfig } from "./config.js";
import { createEvidenceStage } from "./stage.js";
import { EvidenceConfigError, EvidenceInputError, type EvidenceResult } from "./types.js";
import { createFakeClock } from "./test-support/fake-clock.js";
import { createFakeSleep } from "./test-support/fake-sleep.js";
import { FakeHttp, loadFixtureCase } from "./test-support/fake-http.js";
import { createTempCache, type TempCache } from "./test-support/temp-cache.js";

const NOW = "2026-11-13T00:00:00Z";
let tmp: TempCache | undefined;
let http: FakeHttp;

afterEach(() => {
  // Requirement 12.4: no request ever missed a fixture.
  expect(http.unmatched).toEqual([]);
  tmp?.cleanup();
  tmp = undefined;
});

function build(caseName: string | undefined, config: Partial<EvidenceConfig> = {}) {
  tmp = createTempCache();
  http = new FakeHttp({
    fixtures: caseName ? [...loadFixtureCase(caseName), ...loadFixtureCase("shared")] : loadFixtureCase("shared"),
  });
  const clock = createFakeClock(NOW);
  return createEvidenceStage(
    { ...DEFAULT_CONFIG, cacheRoot: tmp.root, ...config },
    { http, clock: clock.clock, sleep: createFakeSleep(clock).sleep },
  );
}

async function runCase(caseName: string, name: string): Promise<EvidenceResult> {
  const r = await build(caseName)({ name, now: NOW });
  expect(() => scoreDeath(r.signals)).not.toThrow();
  return r;
}

describe("fixture cases", () => {
  it("picocolors: healthy", async () => {
    const r = await runCase("picocolors", "picocolors");
    expect(r.signals.deprecated).toEqual({ kind: "known", value: false });
    expect(r.signals.knownReplacementExists).toEqual({ kind: "known", value: false });
    expect(r.replacement).toBeUndefined();
  });

  it("request: deprecated", async () => {
    const r = await runCase("request", "request");
    expect(r.signals.deprecated).toEqual({ kind: "known", value: true });
  });

  it("left-pad: known replacement with a non-empty name", async () => {
    const r = await runCase("left-pad", "left-pad");
    expect(r.signals.knownReplacementExists).toEqual({ kind: "known", value: true });
    expect(r.replacement?.replacement).toBeTruthy();
  });

  it("gulp-util: archived repository", async () => {
    const r = await runCase("archived-repo", "gulp-util");
    expect(r.signals.repoArchived).toEqual({ kind: "known", value: true });
  });

  it("demo: no repository field", async () => {
    const r = await runCase("no-repository", "demo");
    expect(r.signals.repoArchived.kind).toBe("unknown");
    expect(r.signals.monthsSinceLastCommit.kind).toBe("unknown");
    expect(r.unknownReasons.repoArchived?.category).toBe("not_applicable");
    expect(r.unknownReasons.monthsSinceLastCommit?.category).toBe("not_applicable");
    expect(http.requests.some((q) => q.url.includes("api.github.com"))).toBe(false);
  });

  it("every known signal has an absolute source URL and unknown signals have none", async () => {
    const r = await runCase("picocolors", "picocolors");
    for (const [k, v] of Object.entries(r.signals)) {
      if (k === "sourceUrls") continue;
      const sig = v as { kind: string };
      const url = r.signals.sourceUrls?.[k as keyof typeof r.signals.sourceUrls];
      if (sig.kind === "known") expect(() => new URL(url!)).not.toThrow();
      else expect(url).toBeUndefined();
    }
  });
});

describe("input and configuration", () => {
  for (const name of ["", "   ", "\t\n"]) {
    it(`rejects name ${JSON.stringify(name)} with zero client calls`, async () => {
      const stage = build("picocolors");
      await expect(stage({ name, now: NOW })).rejects.toBeInstanceOf(EvidenceInputError);
      expect(http.requests).toHaveLength(0);
    });
  }

  for (const now of ["not a date", "", "2026-13-45", new Date(NaN)]) {
    it(`rejects invalid now ${String(now)} with zero client calls and no cache files`, async () => {
      const stage = build("picocolors");
      await expect(stage({ name: "picocolors", now })).rejects.toBeInstanceOf(EvidenceInputError);
      expect(http.requests).toHaveLength(0);
    });
  }

  it("now is validated before the name", async () => {
    const stage = build("picocolors");
    await expect(stage({ name: "", now: "garbage" })).rejects.toThrow(/now/);
  });

  for (const bad of [
    { maxConcurrency: 0 },
    { maxConcurrency: 33 },
    { maxConcurrency: 1.5 },
    { maxRetries: -1 },
    { maxRetries: 11 },
    { ttlSeconds: { npm: 0, github: 1, osv: 1, e18e: 1, depsdev: 1 } },
  ] as Partial<EvidenceConfig>[]) {
    it(`rejects invalid config ${JSON.stringify(bad)} before any request`, () => {
      expect(() => build("picocolors", bad)).toThrow(EvidenceConfigError);
      expect(http.requests).toHaveLength(0);
    });
  }
});

describe("short-circuit paths", () => {
  const allUnknownNotFound = (r: EvidenceResult) => {
    for (const k of Object.keys(r.unknownReasons) as (keyof typeof r.unknownReasons)[]) {
      expect(r.unknownReasons[k]?.category).toBe("not_found");
    }
    expect(Object.keys(r.unknownReasons)).toHaveLength(7);
    expect(Object.keys(r.signals.sourceUrls ?? {})).toHaveLength(0);
    expect(() => scoreDeath(r.signals)).not.toThrow();
  };

  it("npm 404 yields all seven unknown not_found and only the registry request", async () => {
    const stage = build(undefined);
    http = new FakeHttp({
      fixtures: [{ method: "GET", url: "https://registry.npmjs.org/ghost", response: { status: 404, headers: {}, body: "{}" } }],
    });
    const clock = createFakeClock(NOW);
    const s = createEvidenceStage({ ...DEFAULT_CONFIG, cacheRoot: tmp!.root, depsdev: { enabled: true } }, { http, clock: clock.clock, sleep: createFakeSleep(clock).sleep });
    void stage;
    allUnknownNotFound(await s({ name: "ghost", now: NOW }));
    expect(http.requests.map((q) => q.url)).toEqual(["https://registry.npmjs.org/ghost"]);
  });

  it("a range matching no version yields all seven unknown not_found and one request", async () => {
    const stage = build("picocolors");
    const r = await stage({ name: "picocolors", versionRange: ">=999.0.0", now: NOW });
    allUnknownNotFound(r);
    expect(http.requests).toHaveLength(1);
  });

  it("a satisfiable range still produces an evidence result", async () => {
    const r = await build("picocolors")({ name: "picocolors", versionRange: "^1.0.0", now: NOW });
    expect(r.signals.deprecated.kind).toBe("known");
  });
});
