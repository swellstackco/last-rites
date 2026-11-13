import type { Sabotage } from "../sabotage-runner.js";
import type { MonthsSinceFn } from "../properties/months-since.js";

function parts(timestamp: string, now: Date) {
  const t = new Date(timestamp);
  const tuple = (d: Date) =>
    [d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()] as const;
  const a = tuple(now);
  const b = tuple(t);
  let less = false;
  for (let i = 0; i < 5; i++) {
    if (a[i] !== b[i]) {
      less = a[i]! < b[i]!;
      break;
    }
  }
  return { t, less };
}

/** (a) No clamp: a future timestamp gives a negative number. */
export const noClamp: MonthsSinceFn = (timestamp, now) => {
  const { t, less } = parts(timestamp, now);
  return (now.getUTCFullYear() - t.getUTCFullYear()) * 12 + (now.getUTCMonth() - t.getUTCMonth()) - (less ? 1 : 0);
};

/** (b) Absolute value of the month difference: not monotone when N < T. */
export const absoluteValue: MonthsSinceFn = (timestamp, now) => {
  const { t, less } = parts(timestamp, now);
  return Math.abs(
    (now.getUTCFullYear() - t.getUTCFullYear()) * 12 + (now.getUTCMonth() - t.getUTCMonth()) - (less ? 1 : 0),
  );
};

/** (c) Month numbers only, ignoring years. */
export const ignoresYears: MonthsSinceFn = (timestamp, now) => {
  const { t, less } = parts(timestamp, now);
  return Math.max(0, now.getUTCMonth() - t.getUTCMonth() - (less ? 1 : 0));
};

export const P6_SABOTAGES: ReadonlyArray<Sabotage<MonthsSinceFn>> = [
  { name: "no clamp", impl: noClamp },
  { name: "absolute value of month difference", impl: absoluteValue },
  { name: "month number only, ignoring years", impl: ignoresYears },
];
