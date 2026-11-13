import fc from "fast-check";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test for Properties 6 and 7. */
export type MonthsSinceFn = (timestamp: string, now: Date) => number | undefined;

const MIN_MS = Date.UTC(1970, 0, 1);
const MAX_MS = Date.UTC(2100, 0, 1);
const MONTH_MS = 31 * 24 * 3600 * 1000;

/** Instants across 1970..2100 with extra weight on month-end days. */
const instantMs = fc.oneof(
  { weight: 2, arbitrary: fc.integer({ min: MIN_MS, max: MAX_MS }) },
  {
    weight: 2,
    arbitrary: fc
      .record({
        year: fc.integer({ min: 1970, max: 2099 }),
        month: fc.integer({ min: 0, max: 11 }),
        day: fc.constantFrom(1, 27, 28, 29, 30, 31),
        ms: fc.integer({ min: 0, max: 86_399_999 }),
      })
      .map(({ year, month, day, ms }) => {
        const d = new Date(Date.UTC(year, month, day) + ms);
        return d.getTime();
      }),
  },
);

const iso = (ms: number): string => new Date(ms).toISOString();

export interface P6Case {
  t: string;
  n1: Date;
  n2: Date;
}

/** T, N1 <= N2; extra weight on N1 == N2, N near T, and T later than both. */
export const p6Case: fc.Arbitrary<P6Case> = fc
  .tuple(
    instantMs,
    instantMs,
    instantMs,
    fc.oneof(
      { weight: 3, arbitrary: fc.constant("free" as const) },
      { weight: 1, arbitrary: fc.constant("equal" as const) },
      { weight: 2, arbitrary: fc.constant("nearT" as const) },
      { weight: 2, arbitrary: fc.constant("futureT" as const) },
    ),
    fc.integer({ min: -14, max: 14 }),
    fc.integer({ min: -14, max: 14 }),
  )
  .map(([t, a, b, mode, off1, off2]) => {
    let x = a;
    let y = b;
    if (mode === "equal") y = x;
    if (mode === "nearT") {
      x = t + off1 * MONTH_MS + (a % 1000);
      y = t + off2 * MONTH_MS + (b % 1000);
    }
    if (mode === "futureT") {
      x = t - Math.abs(off1) * MONTH_MS - 1 - Math.abs(a % 1000);
      y = t - Math.abs(off2) * MONTH_MS - 1 - Math.abs(b % 1000);
    }
    const [lo, hi] = x <= y ? [x, y] : [y, x];
    return { t: iso(t), n1: new Date(lo), n2: new Date(hi) };
  });

/** Property 6: Months_Since is non-negative and monotone in Now. */
export const property6: NamedProperty<MonthsSinceFn> = {
  name: "Property 6: Months_Since is non-negative and monotone in Now",
  build: (impl) =>
    fc.property(p6Case, ({ t, n1, n2 }) => {
      const m1 = impl(t, n1);
      const m2 = impl(t, n2);
      if (m1 === undefined || m2 === undefined) throw new Error("valid timestamp produced undefined");
      if (!Number.isInteger(m1) || !Number.isInteger(m2)) throw new Error(`non-integer ${m1}, ${m2}`);
      if (m1 < 0) throw new Error(`negative months ${m1}`);
      if (m1 > m2) throw new Error(`not monotone: ${m1} > ${m2}`);
      if (Date.parse(t) > n2.getTime() && (m1 !== 0 || m2 !== 0)) throw new Error("future timestamp must give 0");
    }),
};

export interface P7Case {
  y: number;
  mo: number;
  d: number;
  ms: number;
  k: number;
}

/** T with UTC day 1..28 and any time of day incl. ms; k in 0..1200. */
export const p7Case: fc.Arbitrary<P7Case> = fc.record({
  y: fc.integer({ min: 1970, max: 2000 }),
  mo: fc.integer({ min: 0, max: 11 }),
  d: fc.integer({ min: 1, max: 28 }),
  ms: fc.integer({ min: 0, max: 86_399_999 }),
  k: fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 1200 })),
});

/** Property 7: Months_Since counts whole calendar months. */
export const property7: NamedProperty<MonthsSinceFn> = {
  name: "Property 7: Months_Since counts whole calendar months",
  build: (impl) =>
    fc.property(p7Case, ({ y, mo, d, ms, k }) => {
      const tMs = Date.UTC(y, mo, d) + ms;
      const t = new Date(tMs);
      // Same day and time of day, k calendar months later.
      const aMs = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + k, t.getUTCDate()) + ms;
      const ts = t.toISOString();
      const atA = impl(ts, new Date(aMs));
      const after = impl(ts, new Date(aMs + 1));
      const before = impl(ts, new Date(aMs - 1));
      if (atA !== k) throw new Error(`monthsSince(T, A) = ${atA}, expected ${k}`);
      if (after !== k) throw new Error(`monthsSince(T, A+1ms) = ${after}, expected ${k}`);
      const expectedBefore = Math.max(0, k - 1);
      if (before !== expectedBefore) throw new Error(`monthsSince(T, A-1ms) = ${before}, expected ${expectedBefore}`);
    }),
};
