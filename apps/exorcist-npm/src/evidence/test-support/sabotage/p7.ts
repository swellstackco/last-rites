import type { Sabotage } from "../sabotage-runner.js";
import type { MonthsSinceFn } from "../properties/months-since.js";

function diff(timestamp: string, now: Date) {
  const t = new Date(timestamp);
  const tuple = (d: Date) =>
    [d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()] as const;
  const a = tuple(now);
  const b = tuple(t);
  let cmp = 0;
  for (let i = 0; i < 5 && cmp === 0; i++) cmp = Math.sign(a[i]! - b[i]!);
  const months = (now.getUTCFullYear() - t.getUTCFullYear()) * 12 + (now.getUTCMonth() - t.getUTCMonth());
  return { t, months, cmp };
}

/** (a) Ignores the day-of-month tuple (monotone and non-negative, so Property 6 alone misses it). */
export const ignoresDayTuple: MonthsSinceFn = (timestamp, now) => {
  const { months } = diff(timestamp, now);
  return Math.max(0, months);
};

/** (b) floor(days / 30). */
export const daysOver30: MonthsSinceFn = (timestamp, now) => {
  const { t } = diff(timestamp, now);
  return Math.max(0, Math.floor((now.getTime() - t.getTime()) / 86_400_000 / 30));
};

/** (c) Rounds up instead of down. */
export const roundsUp: MonthsSinceFn = (timestamp, now) => {
  const { months, cmp } = diff(timestamp, now);
  return Math.max(0, cmp > 0 ? months + 1 : months);
};

export const P7_SABOTAGES: ReadonlyArray<Sabotage<MonthsSinceFn>> = [
  { name: "ignores the day-of-month tuple", impl: ignoresDayTuple },
  { name: "floor(days / 30)", impl: daysOver30 },
  { name: "rounds up", impl: roundsUp },
];
