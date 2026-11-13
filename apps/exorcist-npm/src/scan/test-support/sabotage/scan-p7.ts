import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import type { RateLimiterFactory } from "../properties/scan-p7.js";

interface Opts {
  /** Expire when age > window instead of >= window. */
  inclusiveBoundary?: boolean;
  countRefused?: boolean;
  retry?: (oldest: number, windowMs: number, now: number) => number;
  sharedCounter?: boolean;
  limitOffset?: number;
  neverEvict?: boolean;
}

/** A limiter with the real semantics, with selected rules weakened. */
function make(o: Opts): RateLimiterFactory {
  return ({ limit, windowSeconds, clock, maxKeys = 10_000 }) => {
    const windowMs = windowSeconds * 1000;
    const keys = new Map<string, number[]>();
    const retry = o.retry ?? ((oldest, w, now) => Math.max(1, Math.ceil((oldest + w - now) / 1000)));
    return {
      hit(rawKey) {
        const key = o.sharedCounter ? "shared" : rawKey;
        const now = clock().getTime();
        const list = (keys.get(key) ?? []).filter((t) => (o.inclusiveBoundary ? now - t <= windowMs : now - t < windowMs));
        if (!o.neverEvict && !keys.has(key)) {
          while (keys.size >= maxKeys) keys.delete(keys.keys().next().value as string);
        }
        keys.set(key, list);
        if (list.length < limit + (o.limitOffset ?? 0)) {
          list.push(now);
          return { allowed: true };
        }
        const retryAfterSeconds = retry(list[0] as number, windowMs, now);
        if (o.countRefused) list.push(now);
        return { allowed: false, retryAfterSeconds };
      },
      size: () => keys.size,
    };
  };
}

export const SCAN_P7_SABOTAGES: ReadonlyArray<Sabotage<RateLimiterFactory>> = [
  { name: "inclusive window boundary", impl: make({ inclusiveBoundary: true }) },
  { name: "count refused requests", impl: make({ countRefused: true }) },
  {
    name: "floored retryAfterSeconds",
    impl: make({ retry: (oldest, w, now) => Math.floor((oldest + w - now) / 1000) }),
  },
  {
    name: "unclamped retryAfterSeconds",
    impl: make({ retry: (oldest, w, now) => (oldest + w - now) / 1000 }),
  },
  {
    name: "retryAfterSeconds in milliseconds",
    impl: make({ retry: (oldest, w, now) => Math.max(1, oldest + w - now) }),
  },
  { name: "one shared counter", impl: make({ sharedCounter: true }) },
  { name: "limit off by one", impl: make({ limitOffset: 1 }) },
  { name: "never evict at maxKeys", impl: make({ neverEvict: true }) },
];
