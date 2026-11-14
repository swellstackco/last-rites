import { describe, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { inventoryProperties, realInventoryImpl, type InventoryImpl } from "../test-support/properties/actions-p1.js";

/** Property 1 over a swappable implementation, for the central sabotage test. */
export async function build(impl: InventoryImpl = realInventoryImpl): Promise<void> {
  for (const p of inventoryProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 1: inventory completeness, order and determinism", () => {
  it("holds for the real implementation", async () => {
    await build();
  });
});
