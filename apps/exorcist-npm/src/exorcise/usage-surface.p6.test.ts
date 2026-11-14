// Feature: proof-harness, Property 6: Usage-surface determinism and completeness
import { deepStrictEqual } from "node:assert/strict";
import type { UsageSurface } from "@last-rites/skeleton/proof";
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertPropertyAsync } from "../evidence/test-support/fc-runner.js";
import type { SourceFs } from "./source-fs.js";
import { createMemoryFs } from "./test-support/memory-fs.js";
import { PACKAGE, expectedOf, filesOf, treeModelArb } from "./test-support/tree-model.js";
import { createUsageSurface } from "./usage-surface.js";

/** The seam under test: how a usage surface is made from a file system. */
export type UsageSurfaceFactory = (deps: { fs: SourceFs }) => UsageSurface;

export const REAL_USAGE_SURFACE: UsageSurfaceFactory = createUsageSurface;

function same(actual: unknown, expected: unknown, label: string): void {
  try {
    deepStrictEqual(actual, expected);
  } catch (e) {
    throw new Error(`${label}: ${e instanceof Error ? e.message.split("\n").slice(0, 40).join("\n") : String(e)}`);
  }
}

export function build(factory: UsageSurfaceFactory): fc.IAsyncProperty<[unknown, number]> {
  return fc.asyncProperty(treeModelArb, fc.integer({ min: 1, max: 1_000_000 }), async (model, shuffleSeed) => {
    const files = filesOf(model);
    const expected = expectedOf(model);
    const scan = (opts: { shuffle?: number }) =>
      factory({ fs: createMemoryFs(files, ".", opts) })({ root: ".", package: PACKAGE });

    const first = await scan({});
    same(first.package, expected.package, "package");
    same(first.filesScanned, expected.filesScanned, "filesScanned");
    same(first.callSites, expected.callSites, "callSites");
    same(first.importSites, expected.importSites, "importSites");

    const shuffled = await scan({ shuffle: shuffleSeed });
    same(shuffled, first, "shuffled listing");
    same(shuffled.callSites, expected.callSites, "callSites after shuffle");

    const again = await scan({});
    same(again, first, "rerun");
  }) as fc.IAsyncProperty<[unknown, number]>;
}

describe("Property 6: usage-surface determinism and completeness", () => {
  it("the real usage surface returns exactly the model's sites, in order, whatever the listing order", async () => {
    await assertPropertyAsync("Property 6: usage-surface determinism and completeness", build(REAL_USAGE_SURFACE));
  });
});
