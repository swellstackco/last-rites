import { afterEach, describe, expect, it } from "vitest";
import { CacheLayer } from "../evidence/http/cache.js";
import { DEFAULT_TTL_SECONDS } from "../evidence/config.js";
import { createFakeClock } from "../evidence/test-support/fake-clock.js";
import { FakeHttp, type FailureMode, type FixtureEntry } from "../evidence/test-support/fake-http.js";
import { createTempCache, type TempCache } from "../evidence/test-support/temp-cache.js";
import { createRepoFileSource } from "./repo-fetch.js";
import type { RepoTarget } from "./types.js";

const target: RepoTarget = { owner: "o", repo: "r", ref: "HEAD" };
const url = (file: string, ref = "HEAD"): string => `https://raw.githubusercontent.com/o/r/${ref}/${file}`;
const entry = (u: string, body: string): FixtureEntry => ({
  method: "GET",
  url: u,
  response: { status: 200, headers: {}, body },
});

let tmp: TempCache | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

function setup(fake: FakeHttp, cache?: Pick<CacheLayer, "get">) {
  tmp = createTempCache();
  const fc = createFakeClock();
  const layer = new CacheLayer(tmp.root, fake, fc.clock, DEFAULT_TTL_SECONDS);
  return { source: createRepoFileSource(cache ?? layer, 5000), fc };
}

describe("createRepoFileSource", () => {
  it("requests exact URLs with no headers and returns the text", async () => {
    const fake = new FakeHttp({ fixtures: [entry(url("package.json"), "{}"), entry(url("package-lock.json"), "LOCK")] });
    const { source } = setup(fake);
    expect(await source(target, "package.json")).toEqual({ kind: "ok", text: "{}" });
    expect(await source(target, "package-lock.json")).toEqual({ kind: "ok", text: "LOCK" });
    expect(fake.requests.map((r) => r.url)).toEqual([url("package.json"), url("package-lock.json")]);
    for (const r of fake.requests) {
      expect(r.method).toBe("GET");
      expect(r.headers).toBeUndefined();
    }
    expect(fake.unmatched).toEqual([]);
  });

  it("uses the given ref in the URL", async () => {
    const fake = new FakeHttp({ fixtures: [entry(url("package.json", "feat/x"), "{}")] });
    const { source } = setup(fake);
    expect(await source({ ...target, ref: "feat/x" }, "package.json")).toEqual({ kind: "ok", text: "{}" });
  });

  it("maps 404 to not_found for each file", async () => {
    const fake = new FakeHttp({ failures: [{ match: () => true, mode: "not_found" }] });
    const { source } = setup(fake);
    expect(await source(target, "package.json")).toEqual({ kind: "not_found" });
    expect(await source(target, "package-lock.json")).toEqual({ kind: "not_found" });
  });

  it.each([
    ["network_error", "network_error"],
    ["timeout", "timeout"],
    ["rate_limited", "rate_limited"],
    ["http_500", "network_error"],
  ] as Array<[FailureMode, string]>)("maps failure %s to %s", async (mode, category) => {
    const fake = new FakeHttp({ failures: [{ match: () => true, mode }] });
    const { source } = setup(fake);
    expect(await source(target, "package.json")).toEqual({ kind: "failed", category });
  });

  it("reports HTTP 410 as network_error", async () => {
    tmp = createTempCache();
    const cache = {
      get: () =>
        Promise.resolve({
          ok: false as const,
          failure: { kind: "http" as const, response: { status: 410, headers: {}, body: "" } },
        }),
    };
    const source = createRepoFileSource(cache, 1000);
    expect(await source(target, "package.json")).toEqual({ kind: "failed", category: "network_error" });
  });

  it("maps a rejected cache.get to network_error", async () => {
    const source = createRepoFileSource({ get: () => Promise.reject(new Error("boom")) }, 1000);
    expect(await source(target, "package.json")).toEqual({ kind: "failed", category: "network_error" });
  });

  it("makes zero requests on a second call within the TTL", async () => {
    const fake = new FakeHttp({ fixtures: [entry(url("package.json"), "{}")] });
    const { source } = setup(fake);
    await source(target, "package.json");
    expect(fake.requests).toHaveLength(1);
    expect(await source(target, "package.json")).toEqual({ kind: "ok", text: "{}" });
    expect(fake.requests).toHaveLength(1);
  });
});
