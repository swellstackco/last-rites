/**
 * Months_Since (Requirement 11): whole calendar months, rounded down, between a
 * past timestamp and `now`, never negative. Pure: reads no clock, uses UTC only.
 */

// Date-only, or date-time with optional seconds/fraction and an optional zone (default UTC).
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?([Zz]|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** Parse an ISO 8601 timestamp to a Date, or undefined if it is not a valid one. */
export function parseIsoTimestamp(timestamp: unknown): Date | undefined {
  if (typeof timestamp !== "string") return undefined;
  const m = ISO_8601.exec(timestamp.trim());
  if (!m) return undefined;
  const [, y, mo, d, hh = "00", mi = "00", ss = "00", frac = "0", zone = "Z"] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mi);
  const second = Number(ss);
  if (month < 1 || month > 12 || day < 1 || hour > 24 || minute > 59 || second > 59) return undefined;
  if (hour === 24 && (minute !== 0 || second !== 0)) return undefined;
  const ms = Number(`0.${frac}`.slice(0, 5)) * 1000;
  const base = new Date(0);
  base.setUTCFullYear(year, month - 1, day);
  base.setUTCHours(hour, minute, second, Math.floor(ms));
  // Reject days that overflow the month (e.g. Feb 30).
  if (hour < 24 && (base.getUTCMonth() !== month - 1 || base.getUTCDate() !== day)) return undefined;
  let offsetMinutes = 0;
  if (zone !== "Z" && zone !== "z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2));
    const om = Number(digits.slice(2) || "0");
    if (oh > 23 || om > 59) return undefined;
    offsetMinutes = sign * (oh * 60 + om);
  }
  const t = base.getTime() - offsetMinutes * 60_000;
  return Number.isNaN(t) ? undefined : new Date(t);
}

/** Lexicographic key of the sub-month part of an instant: day, hour, minute, second, ms. */
function subMonthTuple(d: Date): readonly [number, number, number, number, number] {
  return [d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()];
}

function tupleLess(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Whole calendar months from `timestamp` to `now`. `undefined` when the timestamp
 * (or `now`) is not a valid date; 0 when the timestamp is later than `now`.
 * Jan 31 -> Feb 28 is 0 months: the day-of-month tuple has not been reached.
 */
export function monthsSince(timestamp: string, now: Date): number | undefined {
  const t = parseIsoTimestamp(timestamp);
  if (t === undefined || !(now instanceof Date) || Number.isNaN(now.getTime())) return undefined;
  let months = (now.getUTCFullYear() - t.getUTCFullYear()) * 12 + (now.getUTCMonth() - t.getUTCMonth());
  if (tupleLess(subMonthTuple(now), subMonthTuple(t))) months -= 1;
  return Math.max(0, months);
}
