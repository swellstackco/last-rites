import type { Sabotage } from "../sabotage-runner.js";
import type { ClientFactory } from "../properties/concurrency.js";
import { ResilientClient, Semaphore } from "../../http/resilient-client.js";

export const P10_SABOTAGES: ReadonlyArray<Sabotage<ClientFactory>> = [
  {
    name: "no limit",
    impl: (http, opts, clock, sleep) => new ResilientClient(http, clock, sleep, { ...opts, maxConcurrency: 100000 }),
  },
  {
    name: "limit of M + 1",
    impl: (http, opts, clock, sleep) =>
      new ResilientClient(http, clock, sleep, { ...opts, maxConcurrency: opts.maxConcurrency + 1 }),
  },
  {
    name: "slot released before the client call settles",
    impl: (http, opts) => {
      const sem = new Semaphore(opts.maxConcurrency);
      return {
        async request(req) {
          await sem.acquire();
          const pending = http.request(req);
          sem.release();
          return pending;
        },
      };
    },
  },
];
