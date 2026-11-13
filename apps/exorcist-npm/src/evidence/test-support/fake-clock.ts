import type { Clock } from "../http/types.js";

export interface FakeClock {
  clock: Clock;
  /** Move time forward by `ms` milliseconds. */
  advance(ms: number): void;
  /** Set the absolute time. */
  set(date: Date | string): void;
  now(): Date;
}

/** Controllable injected clock: never reads the system clock. */
export function createFakeClock(start: Date | string = "2026-01-01T00:00:00.000Z"): FakeClock {
  let t = new Date(start).getTime();
  return {
    clock: () => new Date(t),
    advance(ms) {
      t += ms;
    },
    set(date) {
      t = new Date(date).getTime();
    },
    now: () => new Date(t),
  };
}
