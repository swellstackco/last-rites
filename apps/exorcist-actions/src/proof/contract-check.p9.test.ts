import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { contractProperties, realContractImpl, type ContractImpl } from "../test-support/properties/actions-p9.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { sabotages } from "../test-support/sabotage/actions-p9.js";
import { checkContract } from "./contract-check.js";

/** Property 9 over a swappable implementation, for the central sabotage test. */
export async function build(impl: ContractImpl = realContractImpl): Promise<void> {
  for (const p of contractProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 9: contract soundness", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P9", contractProperties, sabotages);
  });

  it("example: toolchain-shaped swap lists what was dropped and renamed", () => {
    const r = checkContract({
      withMap: { toolchain: "stable", target: "x", override: "true" },
      replacement: {
        from: "actions-rs/toolchain",
        kind: "action",
        to: "dtolnay/rust-toolchain",
        toRef: "stable",
        sourceUrl: "https://github.com/actions-rs/toolchain",
        replacementUrl: "https://github.com/dtolnay/rust-toolchain",
        inputs: { toolchain: "toolchain", target: "targets", override: null },
      },
      manifest: { inputs: new Map([["toolchain", { required: true, hasDefault: false }], ["targets", { required: false, hasDefault: false }]]), outputs: new Set() },
      outputRefs: [],
    });
    expect(r).toEqual({ ok: true, runs: 4, dropped: ["override"], renamed: ["target"], required: ["toolchain"] });
  });
});
