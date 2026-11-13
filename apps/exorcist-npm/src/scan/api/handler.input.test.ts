import { describe, expect, it } from "vitest";
import { errorCode, makeHarness, makeRequest, postScan } from "../test-support/api-harness.js";

describe("POST /api/scan input checks", () => {
  it("accepts application/json with a charset parameter, case-insensitively", async () => {
    const h = makeHarness();
    const res = await h.handler(postScan(JSON.stringify({ repo: "o/r" }), { "content-type": "Application/JSON; charset=utf-8" }));
    expect(res.status).toBe(200);
    expect(h.pipelineCalls).toHaveLength(1);
  });

  it("passes owner, repo and ref to the pipeline", async () => {
    const h = makeHarness();
    await h.handler(postScan(JSON.stringify({ repo: "own/re.po", ref: "v1" })));
    expect(h.pipelineCalls[0]?.input).toEqual({ owner: "own", repo: "re.po", ref: "v1" });
    await h.handler(postScan(JSON.stringify({ repo: "own/re.po" })));
    expect(h.pipelineCalls[1]?.input).toEqual({ owner: "own", repo: "re.po" });
  });

  it("answers 415 for a wrong content type without reading the body", async () => {
    const h = makeHarness();
    const req = postScan("{}", { "content-type": "text/plain" });
    const res = await h.handler(req);
    expect(res.status).toBe(415);
    expect(errorCode(res)).toBe("unsupported_media_type");
    expect(req.readBodyCalls).toBe(0);
    expect(h.pipelineCalls).toHaveLength(0);
  });

  it("answers 415 when content-type is missing", async () => {
    const h = makeHarness();
    const res = await h.handler(makeRequest({ method: "POST", path: "/api/scan", body: "{}" }));
    expect(res.status).toBe(415);
  });

  it("answers 413 by content-length without reading the body", async () => {
    const h = makeHarness();
    const req = postScan("{}", { "content-length": "4097" });
    const res = await h.handler(req);
    expect(res.status).toBe(413);
    expect(errorCode(res)).toBe("body_too_large");
    expect(req.readBodyCalls).toBe(0);
    expect(h.pipelineCalls).toHaveLength(0);
  });

  it("answers 413 when readBody reports too_large, and never parses", async () => {
    const h = makeHarness();
    const big = JSON.stringify({ repo: "o/r", ref: "x".repeat(5000) });
    const req = postScan(big);
    const res = await h.handler(req);
    expect(res.status).toBe(413);
    expect(req.readBodyCalls).toBe(1);
    expect(h.pipelineCalls).toHaveLength(0);
  });

  it.each([
    ["bad json", "{not json"],
    ["empty", ""],
    ["array", "[]"],
    ["null", "null"],
    ["string", '"o/r"'],
    ["missing repo", "{}"],
    ["repo not a string", '{"repo":1}'],
    ["repo without slash", '{"repo":"or"}'],
    ["repo with extra slash", '{"repo":"o/r/x"}'],
    ["repo with bad char", '{"repo":"o/r?x"}'],
    ["owner too long", `{"repo":"${"a".repeat(40)}/r"}`],
    ["ref not a string", '{"repo":"o/r","ref":3}'],
    ["ref empty", '{"repo":"o/r","ref":""}'],
    ["ref too long", `{"repo":"o/r","ref":"${"a".repeat(257)}"}`],
  ])("answers 400 invalid_input for %s", async (_name, body) => {
    const h = makeHarness();
    const res = await h.handler(postScan(body));
    expect(res.status).toBe(400);
    expect(errorCode(res)).toBe("invalid_input");
    expect(h.pipelineCalls).toHaveLength(0);
  });

  it("answers 400 for invalid UTF-8", async () => {
    const h = makeHarness();
    const res = await h.handler(postScan(new Uint8Array([0x7b, 0xff, 0x7d])));
    expect(res.status).toBe(400);
  });

  it("counts the rate limit before the 415, 413 and 400 checks", async () => {
    const h = makeHarness({ config: { scanRateLimit: { limit: 3, windowSeconds: 60 } } });
    expect((await h.handler(postScan("{}", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await h.handler(postScan("{}", { "content-length": "99999" }))).status).toBe(413);
    expect((await h.handler(postScan("{}"))).status).toBe(400);
    const limited = await h.handler(postScan(JSON.stringify({ repo: "o/r" })));
    expect(limited.status).toBe(429);
    expect(errorCode(limited)).toBe("rate_limited");
    const retry = limited.headers["retry-after"] ?? "";
    expect(retry).toMatch(/^[1-9][0-9]*$/);
    expect(h.pipelineCalls).toHaveLength(0);
  });

  it("limits per client address", async () => {
    const h = makeHarness({ config: { scanRateLimit: { limit: 1, windowSeconds: 60 } } });
    const body = JSON.stringify({ repo: "o/r" });
    expect((await h.handler(postScan(body, {}, { remoteAddress: "1.1.1.1" }))).status).toBe(200);
    expect((await h.handler(postScan(body, {}, { remoteAddress: "1.1.1.1" }))).status).toBe(429);
    expect((await h.handler(postScan(body, {}, { remoteAddress: "2.2.2.2" }))).status).toBe(200);
  });

  it("with trustProxy true keys on the last x-forwarded-for entry", async () => {
    const h = makeHarness({ config: { trustProxy: true, scanRateLimit: { limit: 1, windowSeconds: 60 } } });
    const body = JSON.stringify({ repo: "o/r" });
    const at = (xff: string) => postScan(body, { "x-forwarded-for": xff }, { remoteAddress: "127.0.0.1" });
    expect((await h.handler(at("9.9.9.9, 3.3.3.3"))).status).toBe(200);
    // Same last entry, different spoofed first entry: still limited.
    expect((await h.handler(at("8.8.8.8, 3.3.3.3"))).status).toBe(429);
    expect((await h.handler(at("9.9.9.9, 4.4.4.4"))).status).toBe(200);
  });

  it("with trustProxy false ignores x-forwarded-for", async () => {
    const h = makeHarness({ config: { trustProxy: false, scanRateLimit: { limit: 1, windowSeconds: 60 } } });
    const body = JSON.stringify({ repo: "o/r" });
    const at = (xff: string) => postScan(body, { "x-forwarded-for": xff }, { remoteAddress: "127.0.0.1" });
    expect((await h.handler(at("3.3.3.3"))).status).toBe(200);
    expect((await h.handler(at("4.4.4.4"))).status).toBe(429);
  });
});
