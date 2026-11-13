import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit.js";
import { assertProperty } from "../../evidence/test-support/fc-runner.js";
import { runAgainst, assertAllSabotagesCaught } from "../../evidence/test-support/sabotage-runner.js";
import { createFakeClock } from "../../evidence/test-support/fake-clock.js";
import { property7 } from "../test-support/properties/scan-p7.js";
import { SCAN_P7_SABOTAGES } from "../test-support/sabotage/scan-p7.js";

/** build(factory) for the central sabotage test. */
export const build = property7.build;

// Feature: npm-scanner, Property 7: Rate limiter window
describe("Property 7: Rate limiter window", () => {
  it("holds for the real createRateLimiter", () => {
    assertProperty(property7.name, build(createRateLimiter));
  });

  it("every sabotage is caught", () => {
    expect(runAgainst([property7], createRateLimiter)).toEqual([]);
    assertAllSabotagesCaught(property7.name, [property7], SCAN_P7_SABOTAGES);
  });

  it("evicts the least recently used key at maxKeys", () => {
    const { clock } = createFakeClock();
    const l = createRateLimiter({ limit: 1, windowSeconds: 60, clock, maxKeys: 2 });
    l.hit("a");
    l.hit("b");
    l.hit("a"); // refused, but refreshes recency of a
    l.hit("c"); // evicts b
    expect(l.size()).toBe(2);
    expect(l.hit("a").allowed).toBe(false);
    expect(l.hit("b").allowed).toBe(true);
  });
});
