import type { Clock } from "../../evidence/index.js";

export interface RateLimiter {
  /** Admit or refuse one request from `key`. */
  hit(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number };
  /** Number of keys currently tracked. */
  size(): number;
}

export const DEFAULT_MAX_KEYS = 10_000;

/**
 * Sliding-window log. A request counts when admitted; refused requests are not recorded,
 * so waiting `retryAfterSeconds` always admits the next request.
 */
export function createRateLimiter(opts: {
  limit: number;
  windowSeconds: number;
  clock: Clock;
  maxKeys?: number;
}): RateLimiter {
  const windowMs = opts.windowSeconds * 1000;
  const maxKeys = opts.maxKeys ?? DEFAULT_MAX_KEYS;
  const keys = new Map<string, number[]>();

  const expire = (list: number[], now: number): void => {
    while (list.length > 0 && now - (list[0] as number) >= windowMs) list.shift();
  };

  return {
    hit(key) {
      const now = opts.clock().getTime();
      const existing = keys.get(key);
      const list = existing ?? [];
      expire(list, now);
      if (list.length < opts.limit) {
        if (existing === undefined && keys.size >= maxKeys) {
          // Sweep keys that are empty after expiry, then evict least recently used.
          for (const [k, l] of keys) {
            expire(l, now);
            if (l.length === 0) keys.delete(k);
          }
          while (keys.size >= maxKeys) {
            const oldest = keys.keys().next();
            if (oldest.done) break;
            keys.delete(oldest.value);
          }
        }
        list.push(now);
        keys.delete(key);
        keys.set(key, list);
        return { allowed: true };
      }
      // Refused: not recorded. Refresh recency of the existing key.
      keys.delete(key);
      keys.set(key, list);
      const oldest = list[0] as number;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
    },
    size: () => keys.size,
  };
}
