import fc from "fast-check";
import type { NamedProperty } from "../../../evidence/test-support/sabotage-runner.js";
import { createFakeClock } from "../../../evidence/test-support/fake-clock.js";
import type { Clock } from "../../../evidence/index.js";
import type { RateLimiter } from "../../api/rate-limit.js";

/** The seam under test for Property 7. */
export type RateLimiterFactory = (opts: {
  limit: number;
  windowSeconds: number;
  clock: Clock;
  maxKeys?: number;
}) => RateLimiter;

type Step = { key: number; advanceMs: number };

const steps = fc.array(
  fc.record({
    key: fc.integer({ min: 0, max: 2 }),
    // Boundary-heavy: 0, exact window multiples, and small odd gaps.
    advanceMs: fc.oneof(
      fc.constant(0),
      fc.constantFrom(999, 1000, 1001, 2500, 4999, 5000, 5001),
      fc.integer({ min: 0, max: 7000 }),
    ),
  }),
  { minLength: 1, maxLength: 40 },
);

/** Reference model: admitted timestamps per key, window expiry at age >= window. */
function model(limit: number, windowMs: number, seq: Step[]) {
  const logs = new Map<number, number[]>();
  let now = 0;
  const out: Array<{ allowed: boolean; retry?: number }> = [];
  for (const s of seq) {
    now += s.advanceMs;
    const list = (logs.get(s.key) ?? []).filter((t) => now - t < windowMs);
    if (list.length < limit) {
      list.push(now);
      out.push({ allowed: true });
    } else {
      out.push({ allowed: false, retry: Math.max(1, Math.ceil(((list[0] as number) + windowMs - now) / 1000)) });
    }
    logs.set(s.key, list);
  }
  return out;
}

/** Property 7: rate limiter window. */
export const property7: NamedProperty<RateLimiterFactory> = {
  name: "Property 7: Rate limiter window",
  build: (factory) =>
    fc.property(
      fc.integer({ min: 1, max: 4 }),
      fc.integer({ min: 1, max: 5 }),
      steps,
      fc.integer({ min: 1, max: 3 }),
      (limit, windowSeconds, seq, maxKeys) => {
        const windowMs = windowSeconds * 1000;
        const fake = createFakeClock(new Date(0));
        const limiter = factory({ limit, windowSeconds, clock: fake.clock });
        const expected = model(limit, windowMs, seq);
        seq.forEach((s, i) => {
          fake.advance(s.advanceMs);
          const got = limiter.hit(`k${s.key}`);
          const exp = expected[i] as { allowed: boolean; retry?: number };
          if (got.allowed !== exp.allowed) throw new Error(`step ${i}: allowed=${got.allowed}, expected ${exp.allowed}`);
          if (!got.allowed) {
            if (!Number.isInteger(got.retryAfterSeconds) || got.retryAfterSeconds < 1) {
              throw new Error(`step ${i}: retryAfterSeconds ${got.retryAfterSeconds} is not a positive integer`);
            }
            if (got.retryAfterSeconds !== exp.retry) {
              throw new Error(`step ${i}: retryAfterSeconds ${got.retryAfterSeconds}, expected ${exp.retry}`);
            }
          }
        });

        // Waiting retryAfterSeconds always admits the next request.
        const probeClock = createFakeClock(new Date(0));
        const probe = factory({ limit, windowSeconds, clock: probeClock.clock });
        let refused: number | undefined;
        for (let i = 0; i < limit + 1; i++) {
          const h = probe.hit("p");
          if (!h.allowed) refused = h.retryAfterSeconds;
        }
        if (refused === undefined) throw new Error("limit+1 requests in one instant were all admitted");
        probeClock.advance(refused * 1000);
        if (!probe.hit("p").allowed) throw new Error("waiting retryAfterSeconds did not admit the next request");

        // Memory bound: never more than maxKeys keys.
        const bounded = factory({ limit, windowSeconds, clock: createFakeClock(new Date(0)).clock, maxKeys });
        for (let i = 0; i < maxKeys + 5; i++) {
          bounded.hit(`b${i}`);
          if (bounded.size() > maxKeys) throw new Error(`size ${bounded.size()} exceeds maxKeys ${maxKeys}`);
        }
      },
    ),
};
