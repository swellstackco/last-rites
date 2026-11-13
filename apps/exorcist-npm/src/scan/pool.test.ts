import { describe, expect, it } from "vitest";
import { runPool } from "./pool.js";

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

/** Manually settled workers: worker i resolves when `release(i)` is called. */
function manual(n: number) {
  const resolvers: Array<() => void> = [];
  const started: number[] = [];
  let inFlight = 0;
  let max = 0;
  const worker = (_item: number, i: number): Promise<string> => {
    started.push(i);
    inFlight++;
    max = Math.max(max, inFlight);
    return new Promise<string>((resolve) => {
      resolvers[i] = () => {
        inFlight--;
        resolve(`r${i}`);
      };
    });
  };
  return {
    worker,
    started,
    release: (i: number) => resolvers[i]?.(),
    get max() {
      return max;
    },
    n,
  };
}

describe("runPool", () => {
  it("returns results in input order whatever the completion order", async () => {
    const m = manual(4);
    const p = runPool([0, 1, 2, 3], 4, m.worker);
    await tick();
    for (const i of [3, 1, 0, 2]) m.release(i);
    const out = await p;
    expect(out.results).toEqual(["r0", "r1", "r2", "r3"]);
    expect(out.stoppedEarly).toBe(false);
  });

  it("never exceeds the limit and starts remaining items as running ones settle", async () => {
    const m = manual(5);
    const p = runPool([0, 1, 2, 3, 4], 2, m.worker);
    await tick();
    expect(m.started).toEqual([0, 1]);
    m.release(1);
    await tick();
    expect(m.started).toEqual([0, 1, 2]);
    m.release(0);
    await tick();
    expect(m.started).toEqual([0, 1, 2, 3]);
    for (const i of [2, 3]) m.release(i);
    await tick();
    m.release(4);
    const out = await p;
    expect(out.results).toHaveLength(5);
    expect(m.max).toBe(2);
  });

  it("starts nothing after abort", async () => {
    const m = manual(3);
    let aborted = false;
    const p = runPool([0, 1, 2], 1, m.worker, {
      get aborted() {
        return aborted;
      },
    });
    await tick();
    aborted = true;
    m.release(0);
    const out = await p;
    expect(m.started).toEqual([0]);
    expect(out.results).toEqual(["r0", undefined, undefined]);
    expect(out.stoppedEarly).toBe(true);
  });

  it("handles empty input", async () => {
    const out = await runPool([], 4, () => Promise.resolve(1));
    expect(out).toEqual({ results: [], stoppedEarly: false });
  });

  it("handles a limit larger than the item count", async () => {
    const out = await runPool([1, 2], 50, (x) => Promise.resolve(x * 2));
    expect(out.results).toEqual([2, 4]);
  });
});
