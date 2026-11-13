/**
 * Central sabotage harness (Requirements 13.7, 13.8). Imports every sabotage list under
 * test-support/sabotage/ (p1 to p11) and runs each against its property with the fixed seed.
 * A sabotage that no run of its property catches fails the suite by name:
 *   Sabotage "<name>" stayed green for "<property>"
 * (the per-property test files run the same lists with a random seed locally; here the seed is always fixed).
 */
import { describe, it } from "vitest";
import { CacheLayer, cachePath } from "./http/cache.js";
import { ResilientClient } from "./http/resilient-client.js";
import { countOpenVulnsNoFix } from "./osv-count.js";
import { monthsSince } from "./months-since.js";
import { parseRepoUrl } from "./repo-url.js";
import { property4, property9, type CacheFactory } from "./test-support/properties/cache.js";
import { property10, type ClientFactory } from "./test-support/properties/concurrency.js";
import { property6, property7 } from "./test-support/properties/months-since.js";
import { property8 } from "./test-support/properties/osv-count.js";
import { property1, property2 } from "./test-support/properties/repo-url.js";
import { property3, property5, property11 } from "./test-support/properties/stage.js";
import { FIXED_SEED } from "./test-support/fc-runner.js";
import {
  assertAllSabotagesCaught,
  assertAllSabotagesCaughtAsync,
  runAgainst,
  runAgainstAsync,
} from "./test-support/sabotage-runner.js";
import { P1_SABOTAGES } from "./test-support/sabotage/p1.js";
import { P2_SABOTAGES } from "./test-support/sabotage/p2.js";
import { P3_SABOTAGES } from "./test-support/sabotage/p3.js";
import { P4_SABOTAGES } from "./test-support/sabotage/p4.js";
import { P5_SABOTAGES } from "./test-support/sabotage/p5.js";
import { P6_SABOTAGES } from "./test-support/sabotage/p6.js";
import { P7_SABOTAGES } from "./test-support/sabotage/p7.js";
import { P8_SABOTAGES } from "./test-support/sabotage/p8.js";
import { P9_SABOTAGES } from "./test-support/sabotage/p9.js";
import { P10_SABOTAGES } from "./test-support/sabotage/p10.js";
import { P11_SABOTAGES } from "./test-support/sabotage/p11.js";
import { realStage } from "./test-support/stage-harness.js";
import { expect } from "vitest";

const realCache: CacheFactory = (root, client, clock, ttl) => new CacheLayer(root, client, clock, ttl);
const realClient: ClientFactory = (http, opts, clock, sleep) => new ResilientClient(http, clock, sleep, opts);

describe("sabotage harness (fixed seed)", () => {
  it("every property has a non-empty sabotage list", () => {
    const lists = [P1_SABOTAGES, P2_SABOTAGES, P3_SABOTAGES, P4_SABOTAGES, P5_SABOTAGES, P6_SABOTAGES, P7_SABOTAGES, P8_SABOTAGES, P9_SABOTAGES, P10_SABOTAGES, P11_SABOTAGES];
    expect(lists).toHaveLength(11);
    for (const l of lists) expect(l.length).toBeGreaterThan(0);
  });

  it("P1", () => assertAllSabotagesCaught(property1.name, [property1], P1_SABOTAGES, FIXED_SEED));
  it("P2", () => assertAllSabotagesCaught(property2.name, [property2], P2_SABOTAGES, FIXED_SEED));
  it("P3", () => assertAllSabotagesCaughtAsync(property3.name, [property3], P3_SABOTAGES, FIXED_SEED), 180000);
  it("P4", () => assertAllSabotagesCaughtAsync(property4.name, [property4], P4_SABOTAGES, FIXED_SEED), 180000);
  it("P5", () => assertAllSabotagesCaughtAsync(property5.name, [property5], P5_SABOTAGES, FIXED_SEED), 300000);
  it("P6", () => assertAllSabotagesCaught(property6.name, [property6], P6_SABOTAGES, FIXED_SEED));
  it("P7", () => assertAllSabotagesCaught(property7.name, [property7], P7_SABOTAGES, FIXED_SEED));
  it("P8", () => assertAllSabotagesCaught(property8.name, [property8], P8_SABOTAGES, FIXED_SEED));
  it("P9", () => assertAllSabotagesCaught(property9.name, [property9], P9_SABOTAGES, FIXED_SEED));
  it("P10", () => assertAllSabotagesCaughtAsync(property10.name, [property10], P10_SABOTAGES, FIXED_SEED), 180000);
  it("P11", () => assertAllSabotagesCaughtAsync(property11.name, [property11], P11_SABOTAGES, FIXED_SEED), 180000);

  it("the real implementations pass every property under the fixed seed (harness is sound)", async () => {
    expect(runAgainst([property1, property2], parseRepoUrl, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property6, property7], monthsSince, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property8], countOpenVulnsNoFix, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property9], cachePath, FIXED_SEED)).toEqual([]);
    expect(await runAgainstAsync([property4], realCache, FIXED_SEED)).toEqual([]);
    expect(await runAgainstAsync([property10], realClient, FIXED_SEED)).toEqual([]);
    expect(await runAgainstAsync([property3, property5, property11], realStage, FIXED_SEED)).toEqual([]);
  }, 300000);
});
