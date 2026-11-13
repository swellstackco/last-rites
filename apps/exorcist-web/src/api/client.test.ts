import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { createApiClient } from "./client.js";
import { createFakeFetch } from "../test-support/fake-fetch.js";
import { createFakeTimers } from "../test-support/fake-timers.js";
import { buildReport } from "../test-support/build-report.js";
import { DEMO_TIMEOUT_MS, LIVE_TIMEOUT_MS } from "../constants.js";
import { buildProofReport, buildProofText } from "../test-support/build-proof-report.js";
import type { PackageSignals } from "@graveyard-kit/skeleton";

const unknown = { kind: "unknown" } as const;
const SIGNALS: PackageSignals = {
  deprecated: { kind: "known", value: true },
  repoArchived: { kind: "known", value: true },
  monthsSinceLastPublish: { kind: "known", value: 60 },
  monthsSinceLastCommit: unknown,
  maintainerCount: { kind: "known", value: 1 },
  openVulnsNoFix: { kind: "known", value: 0 },
  knownReplacementExists: { kind: "known", value: false },
};
const report = buildReport([{ name: "dead-pkg", signals: SIGNALS }]);
const reportText = serializeReport(report);

function setup(routes: Parameters<typeof createFakeFetch>[0] = {}) {
  const ff = createFakeFetch(routes);
  const timers = createFakeTimers();
  const client = createApiClient({
    fetch: ff.fetch,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    baseUrl: "",
  });
  return { ff, timers, client, signal: new AbortController().signal };
}

const err = (code: string) => ({ error: { code, message: "m" } });

describe("getDemo", () => {
  it("requests exactly the API URL and returns the parsed report", async () => {
    const { ff, client, signal } = setup({ "GET /api/demo/pump": { body: reportText } });
    const r = await client.getDemo("pump", signal);
    expect(r).toEqual({ ok: true, report, via: "api" });
    expect(ff.calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/demo/pump"]);
    ff.assertNoUnexpected();
  });

  it("200 with garbage gives bad_response with category and path", async () => {
    const { client, signal } = setup({ "GET /api/demo/pump": { body: '{"repo": 5}' } });
    const r = await client.getDemo("pump", signal);
    expect(r.ok).toBe(false);
    if (!r.ok && "error" in r) {
      expect(r.error.code).toBe("bad_response");
      expect(r.error.parseDetail).toMatch(/^[a-z_]+: .*\b(repo|ref)\b/);
    }
  });

  it("does not fall back on 429 or 400", async () => {
    for (const [status, code] of [[429, "rate_limited"], [400, "invalid_demo_name"]] as const) {
      const { ff, client, signal } = setup({
        "GET /api/demo/pump": { status, body: err(code), headers: { "Retry-After": "42" } },
      });
      const r = await client.getDemo("pump", signal);
      expect(ff.calls).toHaveLength(1);
      expect(r.ok === false && "error" in r && r.error.code).toBe(code);
      if (status === 429 && !r.ok && "error" in r) expect(r.error.retryAfterSeconds).toBe(42);
    }
  });

  it("falls back to the static snapshot on 502, 404 and a rejected fetch", async () => {
    for (const first of [{ status: 502, body: err("internal_error") }, { status: 404, body: err("demo_not_found") }, null]) {
      const { ff, client, signal } = setup({ "GET /demo/pump.json": { body: reportText } });
      if (first) ff.on("GET /api/demo/pump", first);
      else ff.on("GET /api/demo/pump", () => Promise.reject(new TypeError("Failed to fetch")));
      const r = await client.getDemo("pump", signal);
      expect(r).toEqual({ ok: true, report, via: "static" });
      expect(ff.calls.map((c) => c.url)).toEqual(["/api/demo/pump", "/demo/pump.json"]);
    }
  });

  it("reports the original API error when the fallback also fails", async () => {
    const { client, signal } = setup({
      "GET /api/demo/pump": { status: 502, body: err("repo_fetch_failed") },
      "GET /demo/pump.json": { status: 404, body: "nope" },
    });
    const r = await client.getDemo("pump", signal);
    expect(r.ok === false && "error" in r && r.error.code).toBe("repo_fetch_failed");
  });

  it("times out after the demo timeout", async () => {
    const { ff, timers, client, signal } = setup();
    ff.hold("GET /api/demo/pump");
    ff.hold("GET /demo/pump.json");
    const p = client.getDemo("pump", signal);
    await Promise.resolve();
    timers.advance(DEMO_TIMEOUT_MS);
    await vi.waitFor(() => expect(ff.calls).toHaveLength(2));
    timers.advance(DEMO_TIMEOUT_MS);
    const r = await p;
    expect(r.ok === false && "error" in r && r.error.code).toBe("client_timeout");
  });

  it("a caller abort gives the cancelled marker", async () => {
    const { ff, client } = setup();
    ff.hold("GET /api/demo/pump");
    const ac = new AbortController();
    const p = client.getDemo("pump", ac.signal);
    ac.abort();
    expect(await p).toEqual({ ok: false, cancelled: true });
    expect(ff.calls).toHaveLength(1);
  });
});

describe("scanRepo", () => {
  it("sends the exact POST request", async () => {
    const { ff, client, signal } = setup({ "POST /api/scan": { body: reportText } });
    const r = await client.scanRepo({ repo: "owner/name", ref: "main" }, signal);
    expect(r.ok).toBe(true);
    expect(ff.calls).toEqual([
      {
        method: "POST",
        url: "/api/scan",
        headers: { "content-type": "application/json" },
        body: '{"repo":"owner/name","ref":"main"}',
        credentials: "omit",
      },
    ]);
  });

  it("omits ref when absent", async () => {
    const { ff, client, signal } = setup({ "POST /api/scan": { body: reportText } });
    await client.scanRepo({ repo: "owner/name" }, signal);
    expect(ff.calls[0]?.body).toBe('{"repo":"owner/name"}');
  });

  it("429 carries retry-after, with no fallback or retry", async () => {
    const { ff, client, signal } = setup({
      "POST /api/scan": { status: 429, body: err("rate_limited"), headers: { "retry-after": "17" } },
    });
    const r = await client.scanRepo({ repo: "a/b" }, signal);
    expect(r.ok === false && "error" in r && r.error.retryAfterSeconds).toBe(17);
    expect(ff.calls).toHaveLength(1);
  });

  it("an error body over 64 KB is ignored", async () => {
    const { client, signal } = setup({
      "POST /api/scan": { status: 422, body: JSON.stringify({ error: { code: "too_many_dependencies", message: "x".repeat(70_000) } }) },
    });
    const r = await client.scanRepo({ repo: "a/b" }, signal);
    expect(r.ok === false && "error" in r && r.error.code).toBe("bad_response");
  });

  it("a rejected fetch gives network_unreachable", async () => {
    const { ff, client, signal } = setup();
    ff.on("POST /api/scan", () => Promise.reject(new TypeError("down")));
    const r = await client.scanRepo({ repo: "a/b" }, signal);
    expect(r.ok === false && "error" in r && r.error.code).toBe("network_unreachable");
  });

  it("times out after 75 s and aborts the request", async () => {
    const { ff, timers, client, signal } = setup();
    ff.hold("POST /api/scan");
    const p = client.scanRepo({ repo: "a/b" }, signal);
    await Promise.resolve();
    timers.advance(LIVE_TIMEOUT_MS - 1);
    expect(timers.pendingCount()).toBe(1);
    timers.advance(1);
    const r = await p;
    expect(r.ok === false && "error" in r && r.error.code).toBe("client_timeout");
    expect(timers.pendingCount()).toBe(0);
  });

  it("a caller abort gives cancelled and clears the timer", async () => {
    const { ff, timers, client } = setup();
    ff.hold("POST /api/scan");
    const ac = new AbortController();
    const p = client.scanRepo({ repo: "a/b" }, ac.signal);
    ac.abort();
    expect(await p).toEqual({ ok: false, cancelled: true });
    expect(timers.pendingCount()).toBe(0);
  });
});

describe("getProof", () => {
  const URL_OK = "GET /demo/proofs/parse-server/intersect.json";

  it("requests exactly the proof URL and returns the parsed report", async () => {
    const { ff, client, signal } = setup({ [URL_OK]: { body: buildProofText("proved") } });
    const r = await client.getProof("parse-server", "intersect", signal);
    expect(r).toEqual({ ok: true, report: buildProofReport("proved") });
    expect(ff.calls.map((c) => `${c.method} ${c.url}`)).toEqual([URL_OK]);
    expect(ff.calls[0]?.credentials).toBe("omit");
    ff.assertNoUnexpected();
  });

  it("404 is absent", async () => {
    const { client, signal } = setup({ [URL_OK]: { status: 404, body: "nope" } });
    expect(await client.getProof("parse-server", "intersect", signal)).toEqual({ ok: false, reason: "absent" });
  });

  it("an HTML body with status 200 is absent", async () => {
    const { client, signal } = setup({ [URL_OK]: { body: "<!doctype html><html></html>" } });
    expect(await client.getProof("parse-server", "intersect", signal)).toEqual({ ok: false, reason: "absent" });
  });

  it("valid JSON that parseProofReport rejects is invalid", async () => {
    const { client, signal } = setup({ [URL_OK]: { body: '{"repo": 5}' } });
    expect(await client.getProof("parse-server", "intersect", signal)).toEqual({ ok: false, reason: "invalid" });
  });

  it("a server error status is failed", async () => {
    const { client, signal } = setup({ [URL_OK]: { status: 500, body: "x" } });
    expect(await client.getProof("parse-server", "intersect", signal)).toEqual({ ok: false, reason: "failed" });
  });

  it("a network error is failed", async () => {
    const { client, signal } = setup({ [URL_OK]: () => Promise.reject(new TypeError("Failed to fetch")) });
    expect(await client.getProof("parse-server", "intersect", signal)).toEqual({ ok: false, reason: "failed" });
  });

  it("a timeout is failed", async () => {
    const { ff, timers, client, signal } = setup();
    ff.hold(URL_OK);
    const p = client.getProof("parse-server", "intersect", signal);
    await Promise.resolve();
    timers.advance(DEMO_TIMEOUT_MS);
    expect(await p).toEqual({ ok: false, reason: "failed" });
  });

  it("an invalid name makes no request", async () => {
    const { ff, client, signal } = setup();
    for (const [d, p] of [["..", "x"], ["parse-server", "@scope/pkg"], ["Parse", "x"], ["a/b", "x"], ["", "x"], ["x", "a".repeat(65)]]) {
      expect(await client.getProof(d as string, p as string, signal)).toEqual({ ok: false, reason: "absent" });
    }
    expect(ff.calls).toHaveLength(0);
  });

  it("cancellation is propagated and clears the timer", async () => {
    const { ff, timers, client } = setup();
    ff.hold(URL_OK);
    const ac = new AbortController();
    const p = client.getProof("parse-server", "intersect", ac.signal);
    ac.abort();
    expect(await p).toEqual({ ok: false, reason: "cancelled" });
    expect(timers.pendingCount()).toBe(0);
  });
});

describe("isolation", () => {
  it("makes no fetch call at import time", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    vi.resetModules();
    await import("./client.js");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("touches no storage API", () => {
    const src = readFileSync(new URL("./client.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./);
  });
});
