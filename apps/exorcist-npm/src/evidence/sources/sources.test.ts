import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DEFAULT_TTL_SECONDS, type EvidenceConfig } from "../config.js";
import { CacheLayer } from "../http/cache.js";
import type { HttpRequest, HttpResponse } from "../http/types.js";
import { createFakeClock } from "../test-support/fake-clock.js";
import { createFakeSleep } from "../test-support/fake-sleep.js";
import { FakeHttp, type FailureRule, type FixtureEntry } from "../test-support/fake-http.js";
import { createTempCache, type TempCache } from "../test-support/temp-cache.js";
import { createEvidenceStage } from "../stage.js";
import { fetchDepsDev } from "./depsdev.js";
import { E18E_DIRECTORY_URL, e18eManifestUrl, fetchE18e } from "./e18e.js";
import { fetchGithub } from "./github.js";
import { fetchNpm, npmDocUrl } from "./npm.js";
import { fetchOsv, OSV_QUERY_URL, osvRequestBody } from "./osv.js";
import type { SourceContext } from "./outcome.js";

let tmp: TempCache | undefined;
let http: FakeHttp;
afterEach(() => {
  expect(http.unmatched).toEqual([]);
  tmp?.cleanup();
  tmp = undefined;
});

const resp = (body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const get = (url: string, response: HttpResponse): FixtureEntry => ({ method: "GET", url, response });

function setup(
  fixtures: FixtureEntry[],
  opts: { failures?: FailureRule[]; config?: Partial<EvidenceConfig> } = {},
): SourceContext {
  tmp = createTempCache();
  http = new FakeHttp({ fixtures, failures: opts.failures ?? [] });
  const config: EvidenceConfig = { ...DEFAULT_CONFIG, cacheRoot: tmp.root, ...opts.config };
  return { config, cache: new CacheLayer(tmp.root, http, createFakeClock().clock, DEFAULT_TTL_SECONDS) };
}

describe("npm source", () => {
  const doc = (extra: Record<string, unknown> = {}) => ({
    "dist-tags": { latest: "1.0.0" },
    versions: { "1.0.0": {} },
    time: { created: "2020-01-01T00:00:00Z", modified: "2024-01-01T00:00:00Z", "1.0.0": "2021-05-05T00:00:00Z" },
    maintainers: [{ name: "a" }],
    ...extra,
  });
  const run = async (d: Record<string, unknown>, range?: string) => {
    const ctx = setup([get(npmDocUrl("pkg"), resp(d))]);
    return fetchNpm(ctx, "pkg", range);
  };

  it("missing maintainers only costs maintainerCount", async () => {
    const { maintainers: _m, ...rest } = doc();
    const r = await run(rest);
    expect(r.ok && r.value.maintainerCount).toEqual({ ok: false, reason: { source: "npm", category: "malformed_response" } });
    expect(r.ok && r.value.deprecated).toEqual({ ok: true, value: false });
    expect(r.ok && r.value.lastPublish.ok).toBe(true);
  });

  it("missing time only costs lastPublish; created/modified are ignored", async () => {
    const { time: _t, ...rest } = doc();
    const r1 = await run(rest);
    expect(r1.ok && r1.value.lastPublish.ok).toBe(false);
    const r2 = await run(doc({ time: { created: "2020-01-01T00:00:00Z", modified: "2024-01-01T00:00:00Z" } }));
    expect(r2.ok && r2.value.lastPublish.ok).toBe(false);
  });

  it("absent Resolved_Version makes deprecated malformed; resolution is none", async () => {
    const r = await run(doc({ "dist-tags": {} }));
    expect(r.ok && r.value.resolution).toEqual({ kind: "none" });
    expect(r.ok && r.value.deprecated.ok).toBe(false);
  });

  it("empty maintainers list counts 0", async () => {
    const r = await run(doc({ maintainers: [] }));
    expect(r.ok && r.value.maintainerCount).toEqual({ ok: true, value: 0 });
  });

  it("deprecation message makes deprecated true", async () => {
    const r = await run(doc({ versions: { "1.0.0": { deprecated: "use x" } } }));
    expect(r.ok && r.value.deprecated).toEqual({ ok: true, value: true });
  });

  it("404 is not_found", async () => {
    const ctx = setup([get(npmDocUrl("pkg"), resp("{}", 404))]);
    expect(await fetchNpm(ctx, "pkg")).toEqual({ ok: false, reason: { source: "npm", category: "not_found" } });
  });
});

describe("github source", () => {
  const ref = { owner: "o", repo: "r" };
  const base = "https://api.github.com/repos/o/r";
  const commitsUrl = `${base}/commits?per_page=1&sha=main`;
  const meta = resp({ archived: false, default_branch: "main" });
  const commits = resp([{ commit: { committer: { date: "2024-02-02T00:00:00Z" } } }]);

  it("metadata 404 -> not_found", async () => {
    const ctx = setup([get(base, resp("{}", 404))]);
    expect(await fetchGithub(ctx, ref)).toEqual({ ok: false, reason: { source: "github", category: "not_found" } });
  });

  it("metadata 5xx -> network_error", async () => {
    const ctx = setup([get(base, resp("x", 503))]);
    expect(await fetchGithub(ctx, ref)).toMatchObject({ ok: false, reason: { category: "network_error" } });
  });

  it("metadata rate limit -> rate_limited", async () => {
    const ctx = setup([get(base, resp("x", 403, { "x-ratelimit-remaining": "0" }))]);
    expect(await fetchGithub(ctx, ref)).toMatchObject({ ok: false, reason: { category: "rate_limited" } });
  });

  it("no commits keeps repoArchived and marks commit malformed", async () => {
    const ctx = setup([get(base, resp({ archived: true, default_branch: "main" })), get(commitsUrl, resp([]))]);
    const r = await fetchGithub(ctx, ref);
    expect(r.ok && r.value.repoArchived).toEqual({ ok: true, value: true });
    expect(r.ok && r.value.lastCommit).toEqual({ ok: false, reason: { source: "github", category: "malformed_response" } });
  });

  it("commit request failure keeps repoArchived", async () => {
    const ctx = setup([get(base, meta), get(commitsUrl, resp("x", 500))]);
    const r = await fetchGithub(ctx, ref);
    expect(r.ok && r.value.repoArchived.ok).toBe(true);
    expect(r.ok && r.value.lastCommit.ok).toBe(false);
  });

  it("falls back to author.date", async () => {
    const ctx = setup([get(base, meta), get(commitsUrl, resp([{ commit: { author: { date: "2023-03-03T00:00:00Z" } } }]))]);
    const r = await fetchGithub(ctx, ref);
    expect(r.ok && r.value.lastCommit).toEqual({ ok: true, value: "2023-03-03T00:00:00Z" });
  });

  it("sends the bearer token only when configured", async () => {
    const withTok = setup([get(base, meta), get(commitsUrl, commits)], { config: { githubToken: "sekret" } });
    await fetchGithub(withTok, ref);
    expect(http.requests.map((r) => r.headers?.["authorization"])).toEqual(["Bearer sekret", "Bearer sekret"]);
    tmp?.cleanup();

    const without = setup([get(base, meta), get(commitsUrl, commits)]);
    await fetchGithub(without, ref);
    expect(http.requests.every((r) => r.headers?.["authorization"] === undefined)).toBe(true);
  });

  it("401 with a token retries once without it and warns", async () => {
    tmp = createTempCache();
    const seen: HttpRequest[] = [];
    http = new FakeHttp({ fixtures: [get(base, meta), get(commitsUrl, commits)] });
    const inner = http;
    const client = {
      async request(req: HttpRequest) {
        seen.push(req);
        if (req.headers?.["authorization"]) return resp("bad credentials", 401);
        return inner.request(req);
      },
    };
    const config = { ...DEFAULT_CONFIG, cacheRoot: tmp.root, githubToken: "sekret" };
    const ctx = { config, cache: new CacheLayer(tmp.root, client, createFakeClock().clock, DEFAULT_TTL_SECONDS) };
    const r = await fetchGithub(ctx, ref);
    expect(r.ok && r.value.repoArchived.ok).toBe(true);
    expect(r.ok && r.value.warnings).toHaveLength(1);
    expect(r.ok && r.value.warnings[0]).not.toContain("sekret");
    // token sent exactly once (first metadata attempt); everything after is unauthenticated
    expect(seen.filter((q) => q.headers?.["authorization"])).toHaveLength(1);
  });

  it("a followed redirect is invisible: the recorded 200 parses", async () => {
    const ctx = setup([get(base, meta), get(commitsUrl, commits)]);
    expect((await fetchGithub(ctx, ref)).ok).toBe(true);
  });
});

describe("osv source", () => {
  const vuln = (id: string, fixed: boolean) => ({
    id,
    affected: [{ package: { ecosystem: "npm", name: "p" }, ranges: [{ type: "SEMVER", events: [{ introduced: "0" }, ...(fixed ? [{ fixed: "2.0.0" }] : [])] }] }],
  });
  const post = (token: string | undefined, response: HttpResponse): FixtureEntry => ({
    method: "POST",
    url: OSV_QUERY_URL,
    body: osvRequestBody("p", "1.0.0", token),
    response,
  });

  it("sends name, ecosystem and version", async () => {
    const ctx = setup([post(undefined, resp({ vulns: [vuln("A", false), vuln("B", true)] }))]);
    expect(await fetchOsv(ctx, "p", "1.0.0")).toEqual({ ok: true, value: 1 });
    expect(JSON.parse(http.requests[0]!.body!)).toEqual({ package: { name: "p", ecosystem: "npm" }, version: "1.0.0" });
  });

  it("follows three pages", async () => {
    const ctx = setup([
      post(undefined, resp({ vulns: [vuln("A", false)], next_page_token: "t1" })),
      post("t1", resp({ vulns: [vuln("B", false)], next_page_token: "t2" })),
      post("t2", resp({ vulns: [vuln("C", false)] })),
    ]);
    expect(await fetchOsv(ctx, "p", "1.0.0")).toEqual({ ok: true, value: 3 });
    expect(http.requests).toHaveLength(3);
  });

  it("accepts exactly ten pages", async () => {
    const fx: FixtureEntry[] = [];
    for (let i = 0; i < 10; i++) {
      fx.push(post(i === 0 ? undefined : `t${i}`, resp(i === 9 ? { vulns: [] } : { next_page_token: `t${i + 1}` })));
    }
    const ctx = setup(fx);
    expect(await fetchOsv(ctx, "p", "1.0.0")).toEqual({ ok: true, value: 0 });
    expect(http.requests).toHaveLength(10);
  });

  it("an endless token gives incomplete after ten pages", async () => {
    const fx: FixtureEntry[] = [];
    for (let i = 0; i < 10; i++) fx.push(post(i === 0 ? undefined : `t${i}`, resp({ next_page_token: `t${i + 1}` })));
    const ctx = setup(fx);
    expect(await fetchOsv(ctx, "p", "1.0.0")).toEqual({ ok: false, reason: { source: "osv", category: "incomplete" } });
    expect(http.requests).toHaveLength(10);
  });

  it("makes zero calls when the stage has no Resolved_Version", async () => {
    tmp = createTempCache();
    const doc = { "dist-tags": {}, versions: { "1.0.0": {} }, time: {}, maintainers: [] };
    http = new FakeHttp({
      fixtures: [get(npmDocUrl("p"), resp(doc))],
      failures: [{ match: (r) => r.url.includes("raw.githubusercontent"), mode: "not_found" }],
    });
    const clock = createFakeClock();
    const stage = createEvidenceStage({ ...DEFAULT_CONFIG, cacheRoot: tmp.root }, { http, clock: clock.clock, sleep: createFakeSleep(clock).sleep });
    const r = await stage({ name: "p", now: "2026-01-01T00:00:00Z" });
    expect(http.requests.some((q) => q.url === OSV_QUERY_URL)).toBe(false);
    expect(r.signals.openVulnsNoFix.kind).toBe("unknown");
  });
});

describe("e18e source", () => {
  const manifest = (mappings: Record<string, unknown>) => resp(`{"mappings":${JSON.stringify(mappings)}}`);
  const entry = { type: "module", moduleName: "x", replacements: ["a", "b"] };
  const files = ["native", "micro-utilities", "preferred"] as const;
  const fx = (m: Partial<Record<(typeof files)[number], HttpResponse>>): FixtureEntry[] =>
    files.map((f) => get(e18eManifestUrl(f), m[f] ?? manifest({})));

  for (const f of files) {
    it(`matches in ${f}`, async () => {
      const ctx = setup(fx({ [f]: manifest({ pkg: entry }) }));
      const r = await fetchE18e(ctx, "pkg");
      expect(r).toMatchObject({ ok: true, value: { known: true, sourceUrl: e18eManifestUrl(f) } });
      expect(r.ok && r.value.replacement).toEqual({ type: "module", replacement: "a", replacements: ["a", "b"] });
    });
  }

  it("duplicate across manifests: first manifest in order wins", async () => {
    const ctx = setup(fx({ native: manifest({ pkg: { ...entry, replacements: ["n"] } }), preferred: manifest({ pkg: entry }) }));
    const r = await fetchE18e(ctx, "pkg");
    expect(r.ok && r.value.replacement?.replacement).toBe("n");
    expect(r.ok && r.value.sourceUrl).toBe(e18eManifestUrl("native"));
  });

  it("__proto__ is not a match", async () => {
    const ctx = setup(fx({}));
    expect(await fetchE18e(ctx, "__proto__")).toMatchObject({ ok: true, value: { known: false, sourceUrl: E18E_DIRECTORY_URL } });
  });

  it("known with no replacements has no replacement name", async () => {
    const ctx = setup(fx({ native: manifest({ pkg: { type: "none" } }) }));
    const r = await fetchE18e(ctx, "pkg");
    expect(r.ok && r.value.known).toBe(true);
    expect(r.ok && r.value.replacement).toEqual({ type: "none", replacements: [] });
  });

  it("matching entry without a type is malformed", async () => {
    const ctx = setup(fx({ native: manifest({ pkg: { replacements: ["a"] } }) }));
    expect(await fetchE18e(ctx, "pkg")).toEqual({ ok: false, reason: { source: "e18e", category: "malformed_response" } });
  });

  it("one manifest failing with no match elsewhere is unknown; a match elsewhere still wins", async () => {
    const failing: FailureRule[] = [{ match: (r) => r.url === e18eManifestUrl("native"), mode: "http_500" }];
    const ctx1 = setup(fx({}), { failures: failing });
    expect(await fetchE18e(ctx1, "pkg")).toMatchObject({ ok: false, reason: { source: "e18e" } });
    tmp?.cleanup();
    const ctx2 = setup(fx({ preferred: manifest({ pkg: entry }) }), { failures: failing });
    expect(await fetchE18e(ctx2, "pkg")).toMatchObject({ ok: true, value: { known: true } });
  });
});

describe("deps.dev source", () => {
  const dd = {
    versions: [
      { versionKey: { version: "1.0.0" }, publishedAt: "2021-01-01T00:00:00Z", isDefault: true, isDeprecated: true },
    ],
  };
  const url = "https://api.deps.dev/v3/systems/npm/packages/pkg";
  const both = { deprecated: true, monthsSinceLastPublish: true };

  it("disabled gives zero calls", async () => {
    const ctx = setup([get(url, resp(dd))]);
    expect(await fetchDepsDev(ctx, "pkg", both)).toEqual({ ok: true, value: {} });
    expect(http.requests).toHaveLength(0);
  });

  it("nothing unknown gives zero calls", async () => {
    const ctx = setup([get(url, resp(dd))], { config: { depsdev: { enabled: true } } });
    await fetchDepsDev(ctx, "pkg", { deprecated: false, monthsSinceLastPublish: false });
    expect(http.requests).toHaveLength(0);
  });

  it("one call fills only the gaps asked for", async () => {
    const ctx = setup([get(url, resp(dd))], { config: { depsdev: { enabled: true } } });
    const r = await fetchDepsDev(ctx, "pkg", { deprecated: false, monthsSinceLastPublish: true });
    expect(r).toEqual({ ok: true, value: { lastPublish: "2021-01-01T00:00:00Z" } });
    expect(http.requests).toHaveLength(1);
  });

  it("failure is not retried (stage: cache over ResilientClient with maxRetries 0)", async () => {
    tmp = createTempCache();
    http = new FakeHttp({
      fixtures: [get(npmDocUrl("pkg"), resp("{}", 500))],
      failures: [
        { match: (r) => r.url.includes("api.deps.dev"), mode: "rate_limited" },
        { match: (r) => r.url.includes("raw.githubusercontent"), mode: "not_found" },
      ],
    });
    const clock = createFakeClock();
    const sleep = createFakeSleep(clock);
    const stage = createEvidenceStage(
      { ...DEFAULT_CONFIG, cacheRoot: tmp.root, depsdev: { enabled: true } },
      { http, clock: clock.clock, sleep: sleep.sleep },
    );
    const r = await stage({ name: "pkg", now: "2026-01-01T00:00:00Z" });
    expect(http.requests.filter((q) => q.url.includes("api.deps.dev"))).toHaveLength(1);
    expect(sleep.waits).toEqual([]);
    expect(r.signals.deprecated.kind).toBe("unknown");
  });
});
