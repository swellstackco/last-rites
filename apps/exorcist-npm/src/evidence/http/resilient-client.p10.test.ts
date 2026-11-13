import { describe, it } from "vitest";
import { ResilientClient } from "./resilient-client.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync } from "../test-support/sabotage-runner.js";
import { property10, type ClientFactory } from "../test-support/properties/concurrency.js";
import { P10_SABOTAGES } from "../test-support/sabotage/p10.js";

const real: ClientFactory = (http, opts, clock, sleep) => new ResilientClient(http, clock, sleep, opts);

// Feature: npm-evidence, Property 10: Concurrency never exceeds the configured maximum
describe("Property 10: Concurrency never exceeds the configured maximum", () => {
  it("holds for the real ResilientClient", async () => {
    await assertPropertyAsync(property10.name, property10.build(real));
  }, 60000);

  it("every sabotage is caught", async () => {
    await assertAllSabotagesCaughtAsync(property10.name, [property10], P10_SABOTAGES);
  }, 60000);
});
