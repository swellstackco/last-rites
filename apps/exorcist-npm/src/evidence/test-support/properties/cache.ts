import { join, relative, isAbsolute } from "node:path";
import fc from "fast-check";
import type { NamedAsyncProperty, NamedProperty } from "../sabotage-runner.js";
import type { CacheResult } from "../../http/cache.js";
import type { Clock, HttpClient, HttpRequest, HttpResponse } from "../../http/types.js";
import type { Source } from "../../types.js";
import { createFakeClock } from "../fake-clock.js";
import { createTempCache } from "../temp-cache.js";

/** The seam under test for Property 4. */
export interface CacheLike {
  get(source: Source, req: HttpRequest): Promise<CacheResult>;
}
export type CacheFactory = (
  rootDir: string,
  client: HttpClient,
  clock: Clock,
  ttlSeconds: Record<Source, number>,
) => CacheLike;

/** The seam under test for Property 9: request to file path. */
export type KeyPathFn = (rootDir: string, req: HttpRequest) => string;

const pad = fc.constantFrom("", "", " ", "\n", "\t ");
const bodyArb = fc
  .tuple(pad, fc.string({ maxLength: 40 }), pad)
  .map(([a, s, b]) => `${a}${s}${b}`);

const requestArb: fc.Arbitrary<HttpRequest> = fc
  .record({
    method: fc.constantFrom<"GET" | "POST">("GET", "POST"),
    url: fc.webUrl(),
    body: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
    token: fc.option(fc.string({ maxLength: 10 }), { nil: undefined }),
  })
  .map(({ method, url, body, token }) => {
    const req: HttpRequest = { method, url, timeoutMs: 1000 };
    if (body !== undefined) req.body = body;
    if (token !== undefined) req.headers = { authorization: `Bearer ${token}` };
    return req;
  });

const ageArb = fc.record({
  ttl: fc.integer({ min: 1, max: 86400 }),
  kind: fc.constantFrom("zero", "before", "at", "after", "random"),
  frac: fc.double({ min: 0, max: 2, noNaN: true }),
});

function ageMs(a: { ttl: number; kind: string; frac: number }): number {
  const ttlMs = a.ttl * 1000;
  switch (a.kind) {
    case "zero":
      return 0;
    case "before":
      return ttlMs - 1;
    case "at":
      return ttlMs;
    case "after":
      return ttlMs + 1;
    default:
      return Math.floor(a.frac * ttlMs);
  }
}

function fail(msg: string): never {
  throw new Error(msg);
}

function ok(r: CacheResult): { response: HttpResponse; fromCache: boolean } {
  return r.ok ? r : fail("expected a successful cache result");
}

/** Property 4: Cache transparency and TTL. */
export const property4: NamedAsyncProperty<CacheFactory> = {
  name: "Property 4: Cache transparency and TTL",
  build: (make) =>
    fc.asyncProperty(requestArb, bodyArb, bodyArb, ageArb, async (req, b1, b2raw, a) => {
      const b2 = `second:${b2raw}`;
      const tmp = createTempCache();
      try {
        const fake = createFakeClock("2026-03-01T00:00:00.000Z");
        let calls = 0;
        const count = (): number => calls;
        const client: HttpClient = {
          request: async () => {
            calls++;
            return { status: 200, headers: { "x-call": String(calls) }, body: calls === 1 ? b1 : b2 };
          },
        };
        const ttl: Record<Source, number> = { npm: a.ttl, github: a.ttl, osv: a.ttl, e18e: a.ttl, depsdev: a.ttl };
        const cache = make(tmp.root, client, fake.clock, ttl);

        const first = ok(await cache.get("npm", req));
        if (count() !== 1) fail(`populating read made ${count()} client calls`);
        if (first.fromCache) fail("populating read reported fromCache");

        const age = ageMs(a);
        fake.advance(age);
        const second = ok(await cache.get("npm", req));
        if (age < a.ttl * 1000) {
          if (count() !== 1) fail(`age ${age}ms < ttl: expected 0 extra client calls, got ${count() - 1}`);
          if (!second.fromCache) fail("fresh read must report fromCache");
          if (JSON.stringify(second.response) !== JSON.stringify(first.response)) {
            fail(`cached read differs from populating read: ${JSON.stringify(second.response)} vs ${JSON.stringify(first.response)}`);
          }
        } else {
          if (count() !== 2) fail(`age ${age}ms >= ttl: expected exactly 1 refetch, got ${count() - 1}`);
          if (second.fromCache) fail("expired read must not report fromCache");
          if (second.response.body !== b2) fail("expired read did not return the new response");
          const third = ok(await cache.get("npm", req));
          if (count() !== 2) fail("third read within the TTL must not call the client");
          if (!third.fromCache) fail("third read must report fromCache");
          if (JSON.stringify(third.response) !== JSON.stringify(second.response)) {
            fail("third read differs from the refreshed entry");
          }
        }
      } finally {
        tmp.cleanup();
      }
    }),
};

type Mutation = "none" | "headers" | "method" | "url" | "body";

function mutate(req: HttpRequest, m: Mutation): HttpRequest {
  const copy: HttpRequest = { ...req };
  switch (m) {
    case "none":
      return copy;
    case "headers":
      copy.headers = { ...(req.headers ?? {}), authorization: `${req.headers?.["authorization"] ?? ""}!` };
      return copy;
    case "method":
      copy.method = req.method === "GET" ? "POST" : "GET";
      return copy;
    case "url":
      copy.url = `${req.url}x`;
      return copy;
    case "body":
      copy.body = req.body === undefined ? "x" : `${req.body}x`;
      return copy;
  }
}

const ROOTS = ["/tmp/a", "/var/some root", "/x"];

/** Property 9: Cache keys map one-to-one to files, inside the root. */
export const property9: NamedProperty<KeyPathFn> = {
  name: "Property 9: Cache keys map one-to-one to files",
  build: (pathFn) =>
    fc.property(
      requestArb,
      fc.constantFrom<Mutation>("none", "headers", "method", "url", "body"),
      fc.constantFrom(...ROOTS),
      (req, m, root) => {
        const a = pathFn(root, req);
        const b = pathFn(root, mutate(req, m));
        const equalKey = m === "none" || m === "headers";
        if (equalKey && a !== b) fail(`equal method/url/body mapped to different files (mutation ${m})`);
        if (!equalKey && a === b) fail(`different ${m} mapped to the same file`);
        for (const p of [a, b]) {
          const rel = relative(join(root), p);
          if (rel.startsWith("..") || isAbsolute(rel)) fail(`path ${p} escapes root ${root}`);
          if (!p.startsWith(join(root, ".cache"))) fail(`path ${p} is not under ${join(root, ".cache")}`);
        }
      },
    ),
};
