/** Manual setTimeout/clearTimeout and a clock. No real timers are ever armed. */
interface Pending {
  id: number;
  at: number;
  fn: () => void;
}

export interface FakeTimers {
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  /** Current fake time in ms, starts at 0. */
  now(): number;
  /** Moves the clock forward, running due callbacks in time order (then arming order). */
  advance(ms: number): void;
  /** Number of timers that are armed and not yet run or cleared. */
  pendingCount(): number;
}

export function createFakeTimers(): FakeTimers {
  let clock = 0;
  let nextId = 1;
  let pending: Pending[] = [];

  const set = (fn: () => void, ms?: number): number => {
    const delay = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : 0;
    const id = nextId++;
    pending.push({ id, at: clock + delay, fn });
    return id;
  };
  const clear = (id?: unknown): void => {
    pending = pending.filter((p) => p.id !== id);
  };

  return {
    setTimeout: set as unknown as typeof globalThis.setTimeout,
    clearTimeout: clear as unknown as typeof globalThis.clearTimeout,
    now: () => clock,
    advance(ms: number): void {
      const target = clock + Math.max(0, ms);
      for (;;) {
        const due = pending.filter((p) => p.at <= target).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        pending = pending.filter((p) => p.id !== due.id);
        clock = Math.max(clock, due.at);
        due.fn();
      }
      clock = target;
    },
    pendingCount: () => pending.length,
  };
}
