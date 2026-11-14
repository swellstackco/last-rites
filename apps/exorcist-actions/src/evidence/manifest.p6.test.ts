import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { manifestProperties, realManifestImpl, type ManifestImpl } from "../test-support/properties/actions-p6.js";
import { sabotages } from "../test-support/sabotage/actions-p6.js";
import { parseActionManifest, runtimeSignal } from "./manifest.js";

/** Property 6 over a swappable implementation, for the central sabotage test. */
export async function build(impl: ManifestImpl = realManifestImpl): Promise<void> {
  for (const p of manifestProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 6: the Action_Manifest parser and the Runtime_Rule", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P6", manifestProperties, sabotages);
  });

  it("example: required as the string true, default null and an empty default", () => {
    const r = parseActionManifest(
      'inputs:\n  a:\n    required: "true"\n  b:\n    default: null\n  c:\n    default: ""\noutputs:\n  o:\n    description: x\nruns:\n  using: node20\n',
    );
    expect(r).toEqual({
      ok: true,
      manifest: {
        inputs: new Map([
          ["a", { required: true, hasDefault: false }],
          ["b", { required: false, hasDefault: false }],
          ["c", { required: false, hasDefault: true }],
        ]),
        outputs: new Set(["o"]),
        using: "node20",
      },
    });
  });

  it("example: node17 to node19 are unknown", () => {
    for (const u of ["node17", "node18", "node19", undefined, "other"]) expect(runtimeSignal(u)).toBeUndefined();
  });
});
