import { describe, expect, it } from "vitest";
import { bodyText, errorCode, makeHarness, makeRequest } from "../test-support/api-harness.js";

function expectErrorShape(res: { body: string | Uint8Array; headers: Record<string, string> }) {
  expect(res.headers["content-type"]).toBe("application/json");
  const parsed = JSON.parse(bodyText({ status: 0, ...res })) as { error: { code: string; message: string } };
  expect(Object.keys(parsed)).toEqual(["error"]);
  expect(parsed.error.code.length).toBeGreaterThan(0);
  expect(parsed.error.message.length).toBeGreaterThan(0);
}

describe("handler routing", () => {
  it("answers 404 not_found for unknown paths", async () => {
    const h = makeHarness();
    const res = await h.handler(makeRequest({ path: "/nope" }));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe("not_found");
    expectErrorShape(res);
  });

  it("answers 405 with allow for each known path", async () => {
    const h = makeHarness();
    const scan = await h.handler(makeRequest({ method: "GET", path: "/api/scan" }));
    expect(scan.status).toBe(405);
    expect(scan.headers["allow"]).toBe("POST");
    expect(errorCode(scan)).toBe("method_not_allowed");
    expectErrorShape(scan);
    const demo = await h.handler(makeRequest({ method: "POST", path: "/api/demo/pump" }));
    expect(demo.status).toBe(405);
    expect(demo.headers["allow"]).toBe("GET");
    expectErrorShape(demo);
  });

  it("serves demo bytes unmodified with zero pipeline calls", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 123, 0, 255, 125, 10]);
    const h = makeHarness({ store: async () => bytes });
    const res = await h.handler(makeRequest({ path: "/api/demo/pump" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(bytes);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(h.pipelineCalls).toHaveLength(0);
    expect(h.http.requests).toHaveLength(0);
    expect(h.storeCalls).toEqual(["pump"]);
  });

  it.each(["..%2f", "a%2Fb", "A", "a.b", "x".repeat(65)])("rejects demo name %j with no store call", async (name) => {
    const h = makeHarness();
    const res = await h.handler(makeRequest({ path: `/api/demo/${name}` }));
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe("invalid_demo_name");
    expectErrorShape(res);
    expect(h.storeCalls).toHaveLength(0);
  });

  it("rejects 'a/b' and the empty name without a store call", async () => {
    const h = makeHarness();
    const slash = await h.handler(makeRequest({ path: "/api/demo/a/b" }));
    expect(slash.status).toBe(404);
    const empty = await h.handler(makeRequest({ path: "/api/demo/" }));
    expect(empty.status).toBe(404);
    expect(h.storeCalls).toHaveLength(0);
  });

  it("answers 404 demo_not_found for a missing demo", async () => {
    const h = makeHarness();
    const res = await h.handler(makeRequest({ path: "/api/demo/missing" }));
    expect(res.status).toBe(404);
    expect(errorCode(res)).toBe("demo_not_found");
    expectErrorShape(res);
  });

  it("answers 500 internal_error when the store throws", async () => {
    const h = makeHarness({
      store: async () => {
        throw new Error("disk");
      },
    });
    const res = await h.handler(makeRequest({ path: "/api/demo/pump" }));
    expect(res.status).toBe(500);
    expect(errorCode(res)).toBe("internal_error");
  });

  it("uses a separate demo limiter with retry-after", async () => {
    const h = makeHarness({
      config: { demoRateLimit: { limit: 2, windowSeconds: 60 } },
      store: async () => new Uint8Array([1]),
    });
    const get = () => h.handler(makeRequest({ path: "/api/demo/pump" }));
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(errorCode(limited)).toBe("rate_limited");
    expect(limited.headers["retry-after"]).toBe("60");
    expectErrorShape(limited);
    // The scan limiter is untouched by demo traffic.
    const scan = await h.handler(
      makeRequest({
        method: "POST",
        path: "/api/scan",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: "o/r" }),
      }),
    );
    expect(scan.status).toBe(200);
    h.clock.advance(60_000);
    expect((await get()).status).toBe(200);
  });
});
