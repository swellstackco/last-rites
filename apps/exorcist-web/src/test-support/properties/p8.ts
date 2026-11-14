import fc from "fast-check";
import { ensure } from "@last-rites/skeleton/graveyard/testing";
import { KNOWN_ERROR_CODES, describeError } from "../../api/errors.js";
import type { DescribeErrorInput } from "../../api/errors.js";

export type DescribeErrorFn = typeof describeError;

const statusArb: fc.Arbitrary<number | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.integer({ min: 100, max: 599 }),
  fc.constantFrom(429, 429, 400, 404, 422, 500, 502, 504, 200),
  fc.integer(),
  fc.double(),
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0),
);

const codeArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...KNOWN_ERROR_CODES) },
  { weight: 4, arbitrary: fc.string({ maxLength: 20 }) },
  { weight: 2, arbitrary: fc.constantFrom("__proto__", "constructor", "toString", "hasOwnProperty", "unknown_error", "bad_response") },
  { weight: 1, arbitrary: fc.anything() },
);

const messageArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: fc.string({ maxLength: 50 }) },
  { weight: 3, arbitrary: fc.integer({ min: 301, max: 2000 }).map((n) => "m".repeat(n)) },
  { weight: 1, arbitrary: fc.constant("") },
  { weight: 1, arbitrary: fc.anything() },
);

const bodyArb: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 6, arbitrary: fc.record({ error: fc.record({ code: codeArb, message: messageArb }) }) },
  { weight: 1, arbitrary: fc.record({ error: fc.anything() }) },
  { weight: 2, arbitrary: fc.anything() },
  { weight: 1, arbitrary: fc.constantFrom(null, undefined, [], "x".repeat(1_000_000), 0, true) },
);

const retryHeaderArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -10, max: 10_000_000 }).map(String) },
  { weight: 2, arbitrary: fc.integer({ min: 1, max: 3600 }).map(String) },
  { weight: 3, arbitrary: fc.constantFrom(null, undefined, "", "abc", "0", "-5", "1e3", "3.5", " 42 ", "99999", "NaN", "Infinity") },
  { weight: 1, arbitrary: fc.string({ maxLength: 12 }) },
);

const inputArb: fc.Arbitrary<DescribeErrorInput> = fc
  .tuple(
    statusArb,
    bodyArb,
    retryHeaderArb,
    fc.constantFrom<DescribeErrorInput["kind"]>(undefined, undefined, undefined, "network", "timeout", "parse"),
    fc.option(fc.record({ category: fc.string({ maxLength: 20 }), message: fc.string({ maxLength: 500 }) }), { nil: undefined }),
    fc.option(fc.oneof(fc.integer({ min: -5, max: 200_000 }), fc.constant(Number.NaN)), { nil: undefined }),
  )
  .map(([status, body, retryAfterHeader, kind, parse, timeoutMs]) => {
    const input: DescribeErrorInput = { body, retryAfterHeader };
    if (status !== undefined) input.status = status;
    if (kind !== undefined) input.kind = kind;
    if (parse !== undefined) input.parse = parse;
    if (timeoutMs !== undefined) input.timeoutMs = timeoutMs;
    return input;
  });

/** Independent reference for the retry-after rule (headers of up to 15 digits). */
function expectedSeconds(header: string | null | undefined): number {
  if (typeof header !== "string") return 60;
  const t = header.trim();
  if (!/^\d+$/.test(t)) return 60;
  const n = Number.parseInt(t, 10);
  if (!(n > 0)) return 60;
  return Math.min(3600, Math.max(1, n));
}

/** Property 8: describeError is total, safe and bounded. */
export function build(impl: DescribeErrorFn = describeError) {
  return fc.property(inputArb, (input) => {
    const e = impl(input); // a throw fails the property
    ensure(typeof e.title === "string" && e.title.length > 0, "title must be a non-empty string");
    ensure(typeof e.detail === "string" && e.detail.length > 0, "detail must be a non-empty string");
    ensure(typeof e.retryable === "boolean", "retryable must be boolean");
    if (e.serverMessage !== undefined) {
      ensure(typeof e.serverMessage === "string" && e.serverMessage.length > 0 && e.serverMessage.length <= 300, "serverMessage must be 1..300 characters");
    }
    if (e.parseDetail !== undefined) ensure(e.code === "bad_response", "parseDetail only for bad_response");
    if (e.retryAfterSeconds !== undefined) {
      ensure(e.code === "rate_limited", "retryAfterSeconds only for rate_limited");
      ensure(Number.isInteger(e.retryAfterSeconds) && e.retryAfterSeconds >= 1 && e.retryAfterSeconds <= 3600, `retryAfterSeconds ${e.retryAfterSeconds} outside 1..3600`);
    }
    if (e.code === "rate_limited") {
      ensure(e.retryAfterSeconds === expectedSeconds(input.retryAfterHeader), `retryAfterSeconds ${String(e.retryAfterSeconds)} must be ${expectedSeconds(input.retryAfterHeader)} for header ${JSON.stringify(input.retryAfterHeader)}`);
    }
    if (input.status === 429 && input.kind === undefined) {
      ensure(e.code === "rate_limited" || (typeof (input.body as { error?: { code?: unknown } } | null)?.error?.code === "string"), "a bare 429 must be rate_limited");
    }
  });
}
