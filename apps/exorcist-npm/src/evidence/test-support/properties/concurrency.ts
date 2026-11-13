import fc from "fast-check";
import type { NamedAsyncProperty } from "../sabotage-runner.js";
import type { Clock, HttpClient, Sleep } from "../../http/types.js";
import type { ResilientOptions } from "../../http/resilient-client.js";
import { FakeHttp, type FixtureEntry } from "../fake-http.js";
import { createFakeClock } from "../fake-clock.js";
import { createFakeSleep } from "../fake-sleep.js";

/** The seam under test for Property 10. */
export type ClientFactory = (http: HttpClient, opts: ResilientOptions, clock: Clock, sleep: Sleep) => HttpClient;

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Property 10: Concurrency never exceeds the configured maximum. */
export const property10: NamedAsyncProperty<ClientFactory> = {
  name: "Property 10: Concurrency never exceeds the configured maximum",
  build: (make) =>
    fc.asyncProperty(
      fc.integer({ min: 1, max: 32 }),
      fc.integer({ min: 1, max: 60 }),
      fc.array(fc.nat({ max: 1000 }), { minLength: 400, maxLength: 400 }),
      fc.array(fc.boolean(), { minLength: 60, maxLength: 60 }),
      async (max, count, picks, retryFlags) => {
        const urls = Array.from({ length: count }, (_, i) => `https://registry.npmjs.org/pkg-${i}`);
        const fixtures: FixtureEntry[] = urls.map((url) => ({
          method: "GET",
          url,
          response: { status: 200, headers: {}, body: "{}" },
        }));
        const rateLimitedOnce = new Set(urls.filter((_, i) => retryFlags[i]));
        const fake = new FakeHttp({
          fixtures,
          hold: true,
          failures: [
            {
              mode: "rate_limited",
              match: (req) => (rateLimitedOnce.delete(req.url) ? true : false),
            },
          ],
        });
        const clock = createFakeClock();
        const sleep = createFakeSleep(clock);
        const client = make(fake, { maxConcurrency: max, maxRetries: 3, githubMaxWaitSeconds: 60 }, clock.clock, sleep.sleep);

        let settled = 0;
        const results = urls.map((url) =>
          client
            .request({ method: "GET", url, timeoutMs: 1000 })
            .then((r) => r.status)
            .finally(() => {
              settled++;
            }),
        );

        let pickIdx = 0;
        let idleTicks = 0;
        while (settled < count) {
          await tick();
          if (fake.pendingCount > 0) {
            idleTicks = 0;
            const i = (picks[pickIdx++ % picks.length] ?? 0) % fake.pendingCount;
            fake.release(i);
          } else if (++idleTicks > 50) {
            throw new Error(`stalled: ${settled}/${count} settled with nothing pending`);
          }
        }
        const statuses = await Promise.all(results);
        if (fake.maxInFlight > max) {
          throw new Error(`max in-flight ${fake.maxInFlight} exceeded the configured maximum ${max}`);
        }
        if (statuses.some((s) => s !== 200)) throw new Error("every request must settle with its response");
      },
    ),
};
