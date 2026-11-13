import { describe, it, expect } from "vitest";
import { CacheLayer } from "./cache.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, runAgainstAsync } from "../test-support/sabotage-runner.js";
import { property4, type CacheFactory } from "../test-support/properties/cache.js";
import { P4_SABOTAGES, MODEL_CACHE } from "../test-support/sabotage/p4.js";

const realCache: CacheFactory = (root, client, clock, ttl) => new CacheLayer(root, client, clock, ttl);

// Feature: npm-evidence, Property 4: Cache transparency and TTL
describe("Property 4: Cache transparency and TTL", () => {
  it("holds for the real CacheLayer", async () => {
    await assertPropertyAsync(property4.name, property4.build(realCache));
  });

  it("the un-sabotaged model cache also passes (sabotage harness is sound)", async () => {
    expect(await runAgainstAsync([property4], MODEL_CACHE)).toEqual([]);
  });

  it("every sabotage is caught", async () => {
    await assertAllSabotagesCaughtAsync(property4.name, [property4], P4_SABOTAGES);
  });
});
