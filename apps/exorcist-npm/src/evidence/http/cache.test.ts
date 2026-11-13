import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CacheLayer, cachePath } from "./cache.js";
import { HttpClientError, type HttpRequest } from "./types.js";
import { FakeHttp } from "../test-support/fake-http.js";
import { createFakeClock } from "../test-support/fake-clock.js";
import { createTempCache, type TempCache } from "../test-support/temp-cache.js";
import { DEFAULT_TTL_SECONDS } from "../config.js";

const URL1 = "https://registry.npmjs.org/picocolors";
const REQ: HttpRequest = { method: "GET", url: URL1, timeoutMs: 1000 };
const OK = { status: 200, headers: { "content-type": "application/json" }, body: '{"a":1}' };

let tmp: TempCache;
afterEach(() => tmp?.cleanup());

function setup(failures: ConstructorParameters<typeof FakeHttp>[0] = {}) {
  tmp = createTempCache();
  const http = new FakeHttp({ fixtures: [{ method: "GET", url: URL1, response: OK }], ...failures });
  const clock = createFakeClock();
  const cache = new CacheLayer(tmp.root, http, clock.clock, DEFAULT_TTL_SECONDS);
  return { http, clock, cache };
}

describe("CacheLayer examples", () => {
  it("second run makes zero client calls", async () => {
    const { http, cache } = setup();
    const a = await cache.get("npm", REQ);
    const b = await cache.get("npm", REQ);
    expect(http.requests).toHaveLength(1);
    expect(a).toMatchObject({ ok: true, fromCache: false });
    expect(b).toMatchObject({ ok: true, fromCache: true });
    expect(http.unmatched).toEqual([]);
  });

  it("a second CacheLayer over the same root reads the same entry", async () => {
    const { http, clock } = setup();
    await new CacheLayer(tmp.root, http, clock.clock, DEFAULT_TTL_SECONDS).get("npm", REQ);
    await new CacheLayer(tmp.root, http, clock.clock, DEFAULT_TTL_SECONDS).get("npm", REQ);
    expect(http.requests).toHaveLength(1);
  });

  it("corrupt cache file is overwritten", async () => {
    const { http, cache } = setup();
    mkdirSync(join(tmp.root, ".cache"), { recursive: true });
    writeFileSync(cachePath(tmp.root, REQ), "{not json");
    const r = await cache.get("npm", REQ);
    expect(r).toMatchObject({ ok: true, fromCache: false });
    expect(http.requests).toHaveLength(1);
    expect(JSON.parse(readFileSync(cachePath(tmp.root, REQ), "utf8")).schema).toBe(1);
  });

  it("entry with a future storedAt is treated as absent", async () => {
    const { http, cache } = setup();
    mkdirSync(join(tmp.root, ".cache"), { recursive: true });
    writeFileSync(
      cachePath(tmp.root, REQ),
      JSON.stringify({ schema: 1, storedAt: "2099-01-01T00:00:00.000Z", method: "GET", url: URL1, response: OK }),
    );
    await cache.get("npm", REQ);
    expect(http.requests).toHaveLength(1);
  });

  it("a failure does not overwrite an existing entry and is returned", async () => {
    const { http, clock, cache } = setup();
    await cache.get("npm", REQ);
    const before = readFileSync(cachePath(tmp.root, REQ), "utf8");
    clock.advance(DEFAULT_TTL_SECONDS.npm * 1000 + 1); // expired
    const failing = new FakeHttp({ failures: [{ match: () => true, mode: "http_500" }] });
    const cache2 = new CacheLayer(tmp.root, failing, clock.clock, DEFAULT_TTL_SECONDS);
    const r = await cache2.get("npm", REQ);
    expect(r).toMatchObject({ ok: false, failure: { kind: "http", response: { status: 500 } } });
    expect(readFileSync(cachePath(tmp.root, REQ), "utf8")).toBe(before);
    expect(http.requests).toHaveLength(1);
  });

  it("failures are never written", async () => {
    const { cache } = setup({ failures: [{ match: () => true, mode: "http_500" }] });
    await cache.get("npm", REQ);
    expect(readdirSync(tmp.root)).toEqual([]);
  });

  it("transport errors become transport failures with their category", async () => {
    const { cache } = setup({ failures: [{ match: () => true, mode: "timeout" }] });
    expect(await cache.get("npm", REQ)).toEqual({
      ok: false,
      failure: { kind: "transport", category: "timeout" },
    });
    const t = createTempCache();
    const c2 = new CacheLayer(
      t.root,
      { request: () => Promise.reject(new HttpClientError("network_error", "boom")) },
      createFakeClock().clock,
      DEFAULT_TTL_SECONDS,
    );
    expect(await c2.get("npm", REQ)).toEqual({ ok: false, failure: { kind: "transport", category: "network_error" } });
    t.cleanup();
  });

  it("request headers are not stored in the cache file", async () => {
    const { cache } = setup();
    await cache.get("github", { ...REQ, headers: { authorization: "Bearer tok_secret" } });
    expect(readFileSync(cachePath(tmp.root, REQ), "utf8")).not.toContain("tok_secret");
  });
});
