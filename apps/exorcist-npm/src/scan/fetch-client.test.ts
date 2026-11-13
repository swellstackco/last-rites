import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClientError } from "../evidence/index.js";
import { createFetchClient } from "./fetch-client.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stub(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as typeof fetch;
  return calls;
}

const base = { method: "GET" as const, url: "https://example.test/x", timeoutMs: 1000 };

describe("createFetchClient", () => {
  it("lower-cases response header names and returns status and body", async () => {
    stub(async () => new Response("hello", { status: 201, headers: { "X-Custom-Header": "V", ETag: "abc" } }));
    const res = await createFetchClient().request(base);
    expect(res.status).toBe(201);
    expect(res.body).toBe("hello");
    expect(res.headers["x-custom-header"]).toBe("V");
    expect(res.headers["etag"]).toBe("abc");
    expect(Object.keys(res.headers).every((k) => k === k.toLowerCase())).toBe(true);
  });

  it("forwards method, body and request headers and sets the user agent", async () => {
    const calls = stub(async () => new Response("{}"));
    await createFetchClient({ userAgent: "ua-test" }).request({
      method: "POST",
      url: "https://example.test/post",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
      timeoutMs: 1000,
    });
    const init = calls[0]!.init;
    expect(calls[0]!.url).toBe("https://example.test/post");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = init.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe("ua-test");
    expect(headers["content-type"]).toBe("application/json");
  });

  it("adds no authorization header of its own", async () => {
    const calls = stub(async () => new Response("ok"));
    await createFetchClient().request(base);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it("throws network_error when the body exceeds the cap", async () => {
    stub(async () => new Response("x".repeat(100)));
    const err = await createFetchClient({ maxBodyBytes: 10 }).request(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpClientError);
    expect((err as HttpClientError).category).toBe("network_error");
  });

  it("accepts a body exactly at the cap", async () => {
    stub(async () => new Response("x".repeat(10)));
    const res = await createFetchClient({ maxBodyBytes: 10 }).request(base);
    expect(res.body).toHaveLength(10);
  });

  it("maps a timeout to HttpClientError timeout", async () => {
    stub(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const err = await createFetchClient().request(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpClientError);
    expect((err as HttpClientError).category).toBe("timeout");
  });

  it("maps other failures to network_error without leaking the cause", async () => {
    stub(async () => {
      throw new TypeError("fetch failed: secret-detail");
    });
    const err = await createFetchClient().request(base).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpClientError);
    expect((err as HttpClientError).category).toBe("network_error");
    expect((err as Error).message).not.toContain("secret-detail");
  });
});
