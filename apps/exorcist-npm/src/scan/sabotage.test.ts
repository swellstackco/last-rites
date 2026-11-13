import { describe, it, expect } from "vitest";
import { inventory } from "./inventory.js";
import { REAL_PARTS } from "./pipeline.js";
import { createRateLimiter } from "./api/rate-limit.js";
import { parseRepoTarget } from "./repo-target.js";
import { REAL_CODEC } from "./report.js";
import { FIXED_SEED } from "../evidence/test-support/fc-runner.js";
import {
  assertAllSabotagesCaught,
  assertAllSabotagesCaughtAsync,
  runAgainst,
  runAgainstAsync,
} from "../evidence/test-support/sabotage-runner.js";
import type { Sabotage } from "../evidence/test-support/sabotage-runner.js";
import { property1 } from "./test-support/properties/scan-p1.js";
import { property2 } from "./test-support/properties/scan-p2.js";
import { property3 } from "./test-support/properties/scan-p3.js";
import { property4 } from "./test-support/properties/scan-p4.js";
import { property5 } from "./test-support/properties/scan-p5.js";
import { property6 } from "./test-support/properties/scan-p6.js";
import { property7 } from "./test-support/properties/scan-p7.js";
import { property8 } from "./test-support/properties/scan-p8.js";
import { SCAN_P1_REQUIRED, SCAN_P1_SABOTAGES } from "./test-support/sabotage/scan-p1.js";
import { SCAN_P2_REQUIRED, SCAN_P2_SABOTAGES } from "./test-support/sabotage/scan-p2.js";
import { SCAN_P3_REQUIRED, SCAN_P3_SABOTAGES } from "./test-support/sabotage/scan-p3.js";
import { SCAN_P4_REQUIRED, SCAN_P4_SABOTAGES } from "./test-support/sabotage/scan-p4.js";
import { SCAN_P5_REQUIRED, SCAN_P5_SABOTAGES } from "./test-support/sabotage/scan-p5.js";
import { SCAN_P6_SABOTAGES } from "./test-support/sabotage/scan-p6.js";
import { SCAN_P7_SABOTAGES } from "./test-support/sabotage/scan-p7.js";
import { SCAN_P8_SABOTAGES } from "./test-support/sabotage/scan-p8.js";

// Central sabotage test (Requirements 14.9, 14.10, 14.11): every property runs against every entry of
// its sabotage list under the fixed seed; a sabotage that stays green fails the suite.

const lists: ReadonlyArray<readonly [string, ReadonlyArray<Sabotage<unknown>>]> = [
  [property1.name, SCAN_P1_SABOTAGES],
  [property2.name, SCAN_P2_SABOTAGES],
  [property3.name, SCAN_P3_SABOTAGES],
  [property4.name, SCAN_P4_SABOTAGES],
  [property5.name, SCAN_P5_SABOTAGES],
  [property6.name, SCAN_P6_SABOTAGES],
  [property7.name, SCAN_P7_SABOTAGES],
  [property8.name, SCAN_P8_SABOTAGES],
];

const required: ReadonlyArray<readonly [string, ReadonlyArray<Sabotage<unknown>>, readonly string[]]> = [
  [property1.name, SCAN_P1_SABOTAGES, SCAN_P1_REQUIRED],
  [property2.name, SCAN_P2_SABOTAGES, SCAN_P2_REQUIRED],
  [property3.name, SCAN_P3_SABOTAGES, SCAN_P3_REQUIRED],
  [property4.name, SCAN_P4_SABOTAGES, SCAN_P4_REQUIRED],
  [property5.name, SCAN_P5_SABOTAGES, SCAN_P5_REQUIRED],
];

const SLOW = 300_000;

describe("central sabotage test", () => {
  it("every sabotage list is non-empty", () => {
    for (const [name, list] of lists) expect(list.length, name).toBeGreaterThan(0);
  });

  it("the sabotages named in Requirement 14.10 exist in the right lists", () => {
    for (const [name, list, names] of required) {
      for (const n of names) expect(list.map((s) => s.name), `${name}: ${n}`).toContain(n);
    }
  });

  it("the real implementations pass every property under the fixed seed", async () => {
    expect(runAgainst([property2], inventory, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property6], REAL_CODEC, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property7], createRateLimiter, FIXED_SEED)).toEqual([]);
    expect(runAgainst([property8], parseRepoTarget, FIXED_SEED)).toEqual([]);
    for (const p of [property1, property3, property4, property5]) {
      expect(await runAgainstAsync([p], REAL_PARTS, FIXED_SEED), p.name).toEqual([]);
    }
  }, SLOW);

  it("Property 1 sabotages are caught", async () => {
    await assertAllSabotagesCaughtAsync(property1.name, [property1], SCAN_P1_SABOTAGES);
  }, SLOW);
  it("Property 2 sabotages are caught", () => {
    assertAllSabotagesCaught(property2.name, [property2], SCAN_P2_SABOTAGES);
  }, SLOW);
  it("Property 3 sabotages are caught", async () => {
    await assertAllSabotagesCaughtAsync(property3.name, [property3], SCAN_P3_SABOTAGES);
  }, SLOW);
  it("Property 4 sabotages are caught", async () => {
    await assertAllSabotagesCaughtAsync(property4.name, [property4], SCAN_P4_SABOTAGES);
  }, SLOW);
  it("Property 5 sabotages are caught", async () => {
    await assertAllSabotagesCaughtAsync(property5.name, [property5], SCAN_P5_SABOTAGES);
  }, SLOW);
  it("Property 6 sabotages are caught", () => {
    assertAllSabotagesCaught(property6.name, [property6], SCAN_P6_SABOTAGES);
  }, SLOW);
  it("Property 7 sabotages are caught", () => {
    assertAllSabotagesCaught(property7.name, [property7], SCAN_P7_SABOTAGES);
  }, SLOW);
  it("Property 8 sabotages are caught", () => {
    assertAllSabotagesCaught(property8.name, [property8], SCAN_P8_SABOTAGES);
  }, SLOW);
});
