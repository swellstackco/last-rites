import type { StopSignal } from "./stop-signal.js";

export interface PoolResult<R> {
  /** results[i] belongs to items[i], whatever order the workers finished in. undefined = never started. */
  results: Array<R | undefined>;
  /** True when at least one item was not started because the signal was aborted. */
  stoppedEarly: boolean;
}

export type PoolRunner = <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  signal?: StopSignal,
) => Promise<PoolResult<R>>;

/** Bounded concurrency with index-ordered results. Rejects if a worker rejects. */
export const runPool: PoolRunner = async (items, limit, worker, signal) => {
  const results: Array<Awaited<ReturnType<typeof worker>> | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  const loop = async (): Promise<void> => {
    while (!signal?.aborted && next < items.length) {
      const i = next++;
      results[i] = await worker(items[i] as never, i);
    }
  };
  const loops = Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, () => loop());
  await Promise.all(loops);
  return { results: results as never, stoppedEarly: next < items.length };
};
