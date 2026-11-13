import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, type EvidenceConfig } from "../evidence/config.js";
import { EvidenceConfigError } from "../evidence/index.js";
import { createFakeClock } from "../evidence/test-support/fake-clock.js";
import { createFakeSleep } from "../evidence/test-support/fake-sleep.js";
import { FIXTURES_ROOT, FakeHttp, loadFixtureCase, type FixtureEntry } from "../evidence/test-support/fake-http.js";
import { createTempCache, type TempCache } from "../evidence/test-support/temp-cache.js";
import { createScanRuntime } from "./runtime.js";
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

function deps(fake: FakeHttp, root: string, override: Partial<EvidenceConfig> = {}) {
  const clock = createFakeClock("2026-11-13T00:00:00.000Z");
  return {
    http: fake,
    clock: clock.clock,
    sleep: createFakeSleep(clock).sleep,
    evidenceConfig: { ...DEFAULT_CONFIG, cacheRoot: root, ...override } as EvidenceConfig,
    maxDependencies: 300,
  };
}

const target = { owner: meta.owner, repo: meta.repo, ref: meta.sha };

describe("createScanRuntime", () => {
  it("scans through the runtime with no unmatched requests", async () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    const { pipeline } = createScanRuntime(deps(fake, tmp.root));
    const out = await pipeline(target);
    expect(out.ok).toBe(true);
    expect(fake.unmatched).toEqual([]);
    expect(fake.requests.length).toBeGreaterThan(0);
  });

  it("shares the cache directory across scans: the second scan makes no request", async () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    const { pipeline } = createScanRuntime(deps(fake, tmp.root));
    const first = await pipeline(target);
    const requestsAfterFirst = fake.requests.length;
    const second = await pipeline(target);
    expect(first.ok && second.ok).toBe(true);
    expect(fake.requests.length).toBe(requestsAfterFirst);
    if (first.ok && second.ok) expect(second.report).toEqual(first.report);
  });

  it("throws EvidenceConfigError before any request when the config is bad", () => {
    tmp = createTempCache();
    const fake = new FakeHttp({ fixtures: fixtures() });
    expect(() => createScanRuntime(deps(fake, tmp!.root, { maxConcurrency: 0 }))).toThrow(EvidenceConfigError);
    expect(fake.requests).toEqual([]);
  });
});
