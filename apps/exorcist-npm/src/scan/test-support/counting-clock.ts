import type { Clock } from "../../evidence/index.js";
import { createFakeClock } from "../../evidence/test-support/fake-clock.js";

export interface CountingClock {
  clock: Clock;
  /** Number of times `clock()` was called. */
  readonly reads: number;
  /** The fixed instant returned by every read. */
  readonly instant: Date;
}

/** A fake Clock fixed at one instant that counts its reads. */
export function createCountingClock(start: Date | string = "2026-01-01T00:00:00.000Z"): CountingClock {
  const fake = createFakeClock(start);
  const instant = fake.now();
  let reads = 0;
  return {
    clock: () => {
      reads++;
      return fake.clock();
    },
    get reads() {
      return reads;
    },
    instant,
  };
}
