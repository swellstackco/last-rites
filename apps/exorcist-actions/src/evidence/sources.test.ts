import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CacheLayer, configFromEnv } from "@last-rites/exorcist-npm/programmatic";
import type { SourceContext } from "@last-rites/exorcist-npm/programmatic";
import { FakeHttp, createFakeClock } from "@last-rites/exorcist-npm/programmatic/testing";
import type { FixtureEntry } from "@last-rites/exorcist-npm/programmatic/testing";
import { fetchActionsOsv, fetchManifest, fetchPublish, resolveCommit } from "./sources.js";
import { commitUrl, rawManifestUrl, releasesLatestUrl, tagsUrl } from "./urls.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";
let root: string | undefined;
let http: FakeHttp;

afterEach(() => {
  expect(http.unmatched).toEqual([]);
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function setup(fixtures: FixtureEntry[], token?: string): SourceContext {
  root = mkdtempSync(join(tmpdir(), "exorcist-actions-src-"));
  http = new FakeHttp({ fixtures });
  const config = configFromEnv(token === undefined ? {} : { GITHUB_TOKEN: token }, root);
  return { config, cache: new CacheLayer(root, http, createFakeClock().clock, config.ttlSeconds) };
}

const res = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  status,
  headers,
  body: typeof body === "string" ? body : JSON.stringify(body),
});
const get = (url: string, response: ReturnType<typeof res>): FixtureEntry => ({ method: "GET", url, response });
const NF = res({ message: "Not Found" }, 404);

describe("fetchPublish", () => {
  it("uses the latest release", async () => {
    const ctx = setup([get(releasesLatestUrl("o", "r"), res({ published_at: "2024-01-02T03:04:05Z" }))]);
    expect(await fetchPublish(ctx, "o", "r")).toEqual({
      ok: true,
      value: { timestamp: "2024-01-02T03:04:05Z", via: "release", warnings: [] },
    });
  });

  it("falls back to the first tag and its commit date on a 404", async () => {
    const ctx = setup([
      get(releasesLatestUrl("o", "r"), NF),
      get(tagsUrl("o", "r"), res([{ name: "v1", commit: { sha: SHA } }])),
      get(commitUrl("o", "r", SHA), res({ commit: { committer: { date: "2021-05-06T00:00:00Z" } } })),
    ]);
    expect(await fetchPublish(ctx, "o", "r")).toMatchObject({ ok: true, value: { timestamp: "2021-05-06T00:00:00Z", via: "tag" } });
  });

  it("is not_found with neither a release nor a tag", async () => {
    const ctx = setup([get(releasesLatestUrl("o", "r"), NF), get(tagsUrl("o", "r"), res([]))]);
    expect(await fetchPublish(ctx, "o", "r")).toEqual({ ok: false, reason: { source: "github", category: "not_found" } });
  });

  it("classifies a 403 with no rate-limit budget left as rate_limited and does not fall back", async () => {
    const ctx = setup([get(releasesLatestUrl("o", "r"), res({ message: "limit" }, 403, { "x-ratelimit-remaining": "0" }))]);
    expect(await fetchPublish(ctx, "o", "r")).toEqual({ ok: false, reason: { source: "github", category: "rate_limited" } });
    expect(http.requests).toHaveLength(1);
  });

  it("retries a 401 once without the token and records the warning", async () => {
    const url = releasesLatestUrl("o", "r");
    const ctx = setup([get(url, res({ published_at: "2024-01-01T00:00:00Z" }))], "secret-token");
    // The fixture answers any request; reject the first (authenticated) one by wrapping the client.
    const inner = http;
    let first = true;
    const wrapped = {
      request: async (req: Parameters<FakeHttp["request"]>[0]) => {
        if (first && req.headers?.["authorization"] !== undefined) {
          first = false;
          return { status: 401, headers: {}, body: "{}" };
        }
        return inner.request(req);
      },
    };
    const ctx2: SourceContext = { config: ctx.config, cache: new CacheLayer(root!, wrapped, createFakeClock().clock, ctx.config.ttlSeconds) };
    const out = await fetchPublish(ctx2, "o", "r");
    expect(out).toMatchObject({ ok: true, value: { via: "release" } });
    if (out.ok) expect(out.value.warnings).toEqual(["GitHub token rejected (HTTP 401); retried without authentication"]);
    expect(inner.requests).toHaveLength(1);
    expect(inner.requests[0]?.headers?.["authorization"]).toBeUndefined();
  });

  it("is malformed_response for a body that is not JSON", async () => {
    const ctx = setup([get(releasesLatestUrl("o", "r"), res("<<not json>>"))]);
    expect(await fetchPublish(ctx, "o", "r")).toEqual({ ok: false, reason: { source: "github", category: "malformed_response" } });
  });
});

describe("fetchManifest", () => {
  const yml = rawManifestUrl("o/r", "v1", "sub", "action.yml");
  const yaml = rawManifestUrl("o/r", "v1", "sub", "action.yaml");

  it("reads action.yml", async () => {
    const ctx = setup([get(yml, res("runs:\n  using: node20\n"))]);
    const out = await fetchManifest(ctx, "o/r", "v1", "sub");
    expect(out).toMatchObject({ ok: true, value: { file: "action.yml", manifest: { using: "node20" } } });
  });

  it("falls back to action.yaml only on a 404", async () => {
    const ctx = setup([get(yml, NF), get(yaml, res("runs:\n  using: docker\n"))]);
    expect(await fetchManifest(ctx, "o/r", "v1", "sub")).toMatchObject({ ok: true, value: { file: "action.yaml" } });
  });

  it("does not try action.yaml after a 500", async () => {
    const ctx = setup([get(yml, res("boom", 500))]);
    expect(await fetchManifest(ctx, "o/r", "v1", "sub")).toEqual({ ok: false, reason: { source: "github", category: "network_error" } });
    expect(http.requests).toHaveLength(1);
  });

  it("is not_found when both files are 404", async () => {
    const ctx = setup([get(yml, NF), get(yaml, NF)]);
    expect(await fetchManifest(ctx, "o/r", "v1", "sub")).toEqual({ ok: false, reason: { source: "github", category: "not_found" } });
  });

  it("is malformed_response for a manifest that is not a mapping", async () => {
    const ctx = setup([get(yml, res("- a\n- b\n"))]);
    expect(await fetchManifest(ctx, "o/r", "v1", "sub")).toEqual({ ok: false, reason: { source: "github", category: "malformed_response" } });
  });

  it("never sends the token to raw.githubusercontent.com but does send it to api.github.com", async () => {
    const ctx = setup(
      [get(rawManifestUrl("o/r", "v1", undefined, "action.yml"), res("runs:\n  using: node20\n")), get(releasesLatestUrl("o", "r"), res({ published_at: "2024-01-01T00:00:00Z" }))],
      "secret-token",
    );
    await fetchManifest(ctx, "o/r", "v1", undefined);
    await fetchPublish(ctx, "o", "r");
    const raw = http.requests.filter((r) => new URL(r.url).hostname === "raw.githubusercontent.com");
    const api = http.requests.filter((r) => new URL(r.url).hostname === "api.github.com");
    expect(raw).toHaveLength(1);
    expect(api).toHaveLength(1);
    expect(JSON.stringify(raw[0]?.headers ?? {})).not.toContain("secret-token");
    expect(api[0]?.headers?.["authorization"]).toBe("Bearer secret-token");
  });
});

describe("resolveCommit", () => {
  it("returns a 40-character sha", async () => {
    const ctx = setup([get(commitUrl("o", "r", "v1"), res({ sha: SHA }))]);
    expect(await resolveCommit(ctx, "o", "r", "v1")).toEqual({ ok: true, value: SHA });
  });

  it("rejects a 39-character sha", async () => {
    const ctx = setup([get(commitUrl("o", "r", "v1"), res({ sha: SHA.slice(1) }))]);
    expect(await resolveCommit(ctx, "o", "r", "v1")).toEqual({ ok: false, reason: { source: "github", category: "malformed_response" } });
  });

  it("keeps the category of a failure", async () => {
    const ctx = setup([get(commitUrl("o", "r", "nope"), NF)]);
    expect(await resolveCommit(ctx, "o", "r", "nope")).toEqual({ ok: false, reason: { source: "github", category: "not_found" } });
  });
});

describe("fetchActionsOsv", () => {
  it("queries ecosystem GitHub Actions without a version and counts advisories without a fix", async () => {
    const body = '{"package":{"name":"o/r","ecosystem":"GitHub Actions"}}';
    const vulns = [
      { id: "A", affected: [{ package: { name: "o/r", ecosystem: "GitHub Actions" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }] }] }] },
      { id: "B", affected: [{ package: { name: "o/r", ecosystem: "GitHub Actions" }, ranges: [{ type: "ECOSYSTEM", events: [{ introduced: "0" }, { fixed: "1" }] }] }] },
    ];
    const ctx = setup([{ method: "POST", url: "https://api.osv.dev/v1/query", body, response: res({ vulns }) }]);
    expect(await fetchActionsOsv(ctx, "o", "r")).toEqual({ ok: true, value: 1 });
  });
});
