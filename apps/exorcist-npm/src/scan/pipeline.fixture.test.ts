import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CacheLayer } from "../evidence/http/cache.js";
import { DEFAULT_CONFIG, type EvidenceConfig } from "../evidence/config.js";
import { createEvidenceStage } from "../evidence/index.js";
import { createFakeClock } from "../evidence/test-support/fake-clock.js";
import { createFakeSleep } from "../evidence/test-support/fake-sleep.js";
import { FIXTURES_ROOT, FakeHttp, loadFixtureCase, type FixtureEntry } from "../evidence/test-support/fake-http.js";
import { createTempCache, type TempCache } from "../evidence/test-support/temp-cache.js";
import { ResilientClient } from "../evidence/http/resilient-client.js";
import { createRepoFileSource } from "./repo-fetch.js";
import { createScanPipeline } from "./pipeline.js";
import { SCAN_FIXTURES_ROOT } from "./test-support/record-scan-fixtures.js";

const meta = JSON.parse(readFileSync(join(SCAN_FIXTURES_ROOT, "pump", "meta.json"), "utf8")) as {
  owner: string;
  repo: string;
  sha: string;
  dependencies: string[];
};

function fixtures(): FixtureEntry[] {
  return [
    ...loadFixtureCase("pump/repo", SCAN_FIXTURES_ROOT),
    ...meta.dependencies.flatMap((d) => loadFixtureCase(`pump/${d}`, SCAN_FIXTURES_ROOT)),
    ...loadFixtureCase("shared", FIXTURES_ROOT),
  ];
}

let tmp: TempCache | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

function make(fake: FakeHttp, root: string) {
  const clock = createFakeClock("2026-11-13T00:00:00.000Z");
  const sleep = createFakeSleep(clock).sleep;
  const config: EvidenceConfig = { ...DEFAULT_CONFIG, cacheRoot: root };
  const evidence = createEvidenceStage(config, { http: fake, clock: clock.clock, sleep });
  const cache = new CacheLayer(
    root,
    new ResilientClient(fake, clock.clock, sleep, {
      maxConcurrency: config.maxConcurrency,
      maxRetries: config.maxRetries,
      githubMaxWaitSeconds: config.githubMaxWaitSeconds,
    }),
    clock.clock,
    config.ttlSeconds,
  );
  return createScanPipeline({
    evidence,
    files: createRepoFileSource(cache, config.requestTimeoutMs),
    clock: clock.clock,
    limits: { maxDependencies: 300, concurrency: config.maxConcurrency },
  });
}

describe("scan of the recorded repository", () => {
  it("scans the pump fixture end to end with no unmatched requests", async () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    const out = await make(fake, tmp.root)({ owner: meta.owner, repo: meta.repo, ref: meta.sha });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const names = [...out.report.dependencies.map((d) => d.name), ...out.report.skipped.map((s) => s.name)].sort();
    expect(names).toEqual([...meta.dependencies].sort());
    expect(new Set(names).size).toBe(names.length);

    const lock = JSON.parse(
      (JSON.parse(readFileSync(join(SCAN_FIXTURES_ROOT, "pump/repo/package-lock-json.json"), "utf8")) as {
        response: { body: string };
      }).response.body,
    ) as { packages: Record<string, { version: string }> };
    for (const d of out.report.dependencies) {
      expect(d.versionSource).toBe("lockfile");
      expect(d.resolvedVersion).toBe(lock.packages[`node_modules/${d.name}`]?.version);
    }
    expect(fake.unmatched).toEqual([]);
  });

  it("a second scan on the same cache directory makes no repeat registry requests", async () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    const pipeline = make(fake, tmp.root);
    const input = { owner: meta.owner, repo: meta.repo, ref: meta.sha };
    await pipeline(input);
    const registry = (): number => fake.requests.filter((r) => r.url.startsWith("https://registry.npmjs.org/")).length;
    const first = registry();
    expect(first).toBe(meta.dependencies.length);
    await pipeline(input);
    expect(registry()).toBe(first);
    expect(fake.unmatched).toEqual([]);
  });

  it("never exceeds the evidence concurrency in flight", async () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    await make(fake, tmp.root)({ owner: meta.owner, repo: meta.repo, ref: meta.sha });
    expect(fake.maxInFlight).toBeLessThanOrEqual(DEFAULT_CONFIG.maxConcurrency);
  });
});
