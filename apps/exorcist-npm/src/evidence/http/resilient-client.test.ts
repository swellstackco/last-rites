import { describe, expect, it } from "vitest";
import { RateLimitedError, ResilientClient, backoffSeconds } from "./resilient-client.js";
import { CacheLayer } from "./cache.js";
import { classifyStatus } from "./fetch-json.js";
import { HttpClientError, type HttpClient, type HttpRequest, type HttpResponse } from "./types.js";
import { createFakeClock } from "../test-support/fake-clock.js";
import { createFakeSleep } from "../test-support/fake-sleep.js";
import { createTempCache } from "../test-support/temp-cache.js";
import { DEFAULT_TTL_SECONDS } from "../config.js";

type Step = HttpResponse | Error;
const res = (status: number, headers: Record<string, string> = {}): HttpResponse => ({ status, headers, body: "{}" });

/** Scripted client: replays `steps` in order, repeating the last one; records requests. */
function scripted(steps: Step[]): HttpClient & { requests: HttpRequest[] } {
  const requests: HttpRequest[] = [];
  return {
    requests,
    async request(req) {
      requests.push(req);
      const s = steps[Math.min(requests.length - 1, steps.length - 1)]!;
      if (s instanceof Error) throw s;
      return s;
    },
  };
}

const NPM: HttpRequest = { method: "GET", url: "https://registry.npmjs.org/x", timeoutMs: 1000 };
const GH: HttpRequest = { method: "GET", url: "https://api.github.com/repos/o/r", timeoutMs: 1000 };
const OPTS = { maxConcurrency: 4, maxRetries: 3, githubMaxWaitSeconds: 60 };

function make(steps: Step[], opts = OPTS) {
  const http = scripted(steps);
  const clock = createFakeClock("2026-01-01T00:00:00.000Z");
  const sleep = createFakeSleep(clock);
  return { http, clock, sleep, client: new ResilientClient(http, clock.clock, sleep.sleep, opts) };
}

describe("ResilientClient 429 handling", () => {
  it("honors retry-after (integer seconds)", async () => {
    const { client, sleep, http } = make([res(429, { "retry-after": "7" }), res(200)]);
    expect((await client.request(NPM)).status).toBe(200);
    expect(sleep.waits).toEqual([7000]);
    expect(http.requests).toHaveLength(2);
  });

  it("backoff doubles from 1s and caps at 30s when retry-after is absent or invalid", async () => {
    const { client, sleep } = make([res(429), res(429, { "retry-after": "soon" }), res(429, { "retry-after": "-1" }), res(200)]);
    await client.request(NPM);
    expect(sleep.waits).toEqual([1000, 2000, 4000]);
    expect([0, 1, 2, 3, 4, 5, 6, 10].map((a) => backoffSeconds(undefined, a))).toEqual([1, 2, 4, 8, 16, 30, 30, 30]);
    expect(backoffSeconds("0", 5)).toBe(0);
  });

  it("retries are bounded by maxRetries then rate_limited", async () => {
    const { client, http, sleep } = make([res(429)], { ...OPTS, maxRetries: 2 });
    await expect(client.request(NPM)).rejects.toBeInstanceOf(RateLimitedError);
    expect(http.requests).toHaveLength(3);
    expect(sleep.waits).toHaveLength(2);
  });

  it("maxRetries 0 makes a single attempt", async () => {
    const { client, http } = make([res(429)], { ...OPTS, maxRetries: 0 });
    await expect(client.request(NPM)).rejects.toMatchObject({ category: "rate_limited" });
    expect(http.requests).toHaveLength(1);
  });

  it("a timeout is not retried", async () => {
    const { client, http, sleep } = make([new HttpClientError("timeout", "slow")]);
    await expect(client.request(NPM)).rejects.toMatchObject({ category: "timeout" });
    expect(http.requests).toHaveLength(1);
    expect(sleep.waits).toEqual([]);
  });

  it("5xx and other statuses are returned, not retried", async () => {
    const { client, http } = make([res(503)]);
    expect((await client.request(NPM)).status).toBe(503);
    expect(http.requests).toHaveLength(1);
  });
});

describe("ResilientClient GitHub gate", () => {
  const resetIn = (clockMs: number, secs: number) => String(Math.floor(clockMs / 1000) + secs);

  it("waits for x-ratelimit-reset before the next GitHub request", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const { client, sleep, http } = make([
      res(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetIn(start, 20) }),
      res(200),
    ]);
    await client.request(GH);
    expect(sleep.waits).toEqual([]);
    await client.request(GH);
    expect(sleep.waits).toEqual([20000]);
    expect(http.requests).toHaveLength(2);
    await client.request(GH); // gate cleared after waiting
    expect(sleep.waits).toEqual([20000]);
  });

  it("a wait above the maximum issues no request and yields rate_limited", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const { client, http } = make([res(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetIn(start, 600) })]);
    await client.request(GH);
    await expect(client.request(GH)).rejects.toBeInstanceOf(RateLimitedError);
    expect(http.requests).toHaveLength(1);
  });

  it("does not gate non-GitHub hosts", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const { client, http } = make([res(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetIn(start, 20) })]);
    await client.request(NPM);
    await client.request(NPM);
    expect(http.requests).toHaveLength(2);
  });

  it("a reset time already in the past does not block", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const { client, sleep } = make([res(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetIn(start, -5) })]);
    await client.request(GH);
    await client.request(GH);
    expect(sleep.waits).toEqual([]);
  });

  it("stale cached rate-limit headers do not trigger the gate", async () => {
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    const http = scripted([res(200, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": resetIn(start, 20) }), res(200)]);
    const clock = createFakeClock("2026-01-01T00:00:00.000Z");
    const sleep = createFakeSleep(clock);
    const tmp = createTempCache();
    try {
      const resilient = new ResilientClient(http, clock.clock, sleep.sleep, OPTS);
      const cache = new CacheLayer(tmp.root, resilient, clock.clock, DEFAULT_TTL_SECONDS);
      const other: HttpRequest = { ...GH, url: "https://api.github.com/repos/o/other" };
      await cache.get("github", GH); // live; sets the gate
      const hit = await cache.get("github", GH); // cache hit: client never sees it
      expect(hit).toMatchObject({ ok: true, fromCache: true });
      expect(sleep.waits).toEqual([]);
      await cache.get("github", other); // live request: gate waits
      expect(sleep.waits).toEqual([20000]);
    } finally {
      tmp.cleanup();
    }
  });
});

describe("classifyStatus", () => {
  it("follows the failure classification table", () => {
    expect(classifyStatus(res(404))).toBe("not_found");
    expect(classifyStatus(res(410))).toBe("not_found");
    expect(classifyStatus(res(429))).toBe("rate_limited");
    expect(classifyStatus(res(403, { "x-ratelimit-remaining": "0" }))).toBe("rate_limited");
    expect(classifyStatus(res(403))).toBe("network_error");
    expect(classifyStatus(res(401))).toBe("network_error");
    expect(classifyStatus(res(500))).toBe("network_error");
  });
});
