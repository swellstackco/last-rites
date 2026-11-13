import type { Sleep } from "../http/types.js";
import type { FakeClock } from "./fake-clock.js";

export interface FakeSleep {
  sleep: Sleep;
  /** Every requested wait in ms, in call order. */
  waits: number[];
}

/** Records waits and resolves immediately. If a fake clock is given, it is advanced by each wait. */
export function createFakeSleep(clock?: FakeClock): FakeSleep {
  const waits: number[] = [];
  return {
    waits,
    sleep: (ms) => {
      waits.push(ms);
      clock?.advance(ms);
      return Promise.resolve();
    },
  };
}
