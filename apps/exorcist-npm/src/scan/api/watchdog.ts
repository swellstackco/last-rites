/** Hard request limit (Requirement 9.10). Backs the cooperative StopSignal check, which cannot interrupt a hung call. */
export type Watchdog = (ms: number) => { fired: Promise<void>; dispose(): void };

/** `fired` never settles. Used when a test does not exercise the timeout. */
export const noWatchdog: Watchdog = () => ({
  fired: new Promise<void>(() => {}),
  dispose() {},
});

/** setTimeout based. The only real timer in the scanner; wired only in server.ts. */
export const realWatchdog: Watchdog = (ms) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fired = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  return {
    fired,
    dispose() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
};
