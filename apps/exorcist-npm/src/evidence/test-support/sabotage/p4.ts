import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Sabotage } from "../sabotage-runner.js";
import type { CacheFactory } from "../properties/cache.js";
import { cachePath, type CacheEntry } from "../../http/cache.js";

interface Opts {
  ignoreTtl: boolean;
  atTtlIsFresh: boolean;
  twoCallsOnExpiry: boolean;
  neverWrite: boolean;
  lossyCopy: boolean;
}
const CORRECT: Opts = {
  ignoreTtl: false,
  atTtlIsFresh: false,
  twoCallsOnExpiry: false,
  neverWrite: false,
  lossyCopy: false,
};

/** A small, deliberately wrong cache; `CORRECT` options behave like the real one. */
function make(overrides: Partial<Opts>): CacheFactory {
  const o = { ...CORRECT, ...overrides };
  return (root, client, clock, ttl) => ({
    async get(source, req) {
      const path = cachePath(root, req);
      let hadEntry = false;
      try {
        const entry = JSON.parse(readFileSync(path, "utf8")) as CacheEntry;
        hadEntry = true;
        const age = clock().getTime() - Date.parse(entry.storedAt);
        const ttlMs = ttl[source] * 1000;
        const fresh = o.ignoreTtl || (o.atTtlIsFresh ? age <= ttlMs : age < ttlMs);
        if (fresh) return { ok: true, response: entry.response, fromCache: true };
      } catch {
        // absent
      }
      let live = await client.request(req);
      if (o.twoCallsOnExpiry && hadEntry) live = await client.request(req);
      if (live.status < 200 || live.status > 299) return { ok: false, failure: { kind: "http", response: live } };
      if (!o.neverWrite) {
        const stored = o.lossyCopy ? { ...live, body: live.body.trim() } : live;
        const entry: CacheEntry = {
          schema: 1,
          storedAt: clock().toISOString(),
          method: req.method,
          url: req.url,
          response: stored,
        };
        mkdirSync(join(root, ".cache"), { recursive: true });
        writeFileSync(path, JSON.stringify(entry));
      }
      return { ok: true, response: live, fromCache: false };
    },
  });
}

export const P4_SABOTAGES: ReadonlyArray<Sabotage<CacheFactory>> = [
  { name: "ignores the TTL and always hits", impl: make({ ignoreTtl: true }) },
  { name: "treats age == ttl as fresh", impl: make({ atTtlIsFresh: true }) },
  { name: "calls the client twice on expiry", impl: make({ twoCallsOnExpiry: true }) },
  { name: "never writes", impl: make({ neverWrite: true }) },
  { name: "stores a lossy copy (trimmed body)", impl: make({ lossyCopy: true }) },
];

/** Exposed so the test can check the model cache is itself sound. */
export const MODEL_CACHE: CacheFactory = make({});
