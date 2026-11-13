import type { Clock } from "../evidence/index.js";

/** AbortSignal-like. Checked between evidence calls; never interrupts one. */
export interface StopSignal {
  readonly aborted: boolean;
}

export interface StopController extends StopSignal {
  abort(): void;
}

/**
 * `aborted` becomes true once `clock()` has advanced `timeoutMs` past the creation time,
 * or `abort()` is called. Reads the clock once at creation and once per `aborted` read.
 */
export function createDeadline(clock: Clock, timeoutMs: number): StopController {
  const start = clock().getTime();
  let manual = false;
  return {
    get aborted(): boolean {
      if (manual) return true;
      return clock().getTime() - start >= timeoutMs;
    },
    abort(): void {
      manual = true;
    },
  };
}
