// graveyard-ui-actions 1.1: the vite proof plugin and the two committed action report names (bugfix 2.4).
// Node environment (the config imports esbuild-backed vite). Expected to PASS on unfixed code: it confirms that
// the vite guard is not part of B1. No network.
import { describe, expect, it } from "vitest";
import { DEMO_NAME_PATTERN, PROOF_NAME_PATTERN, demoProofs, proofNamesFromPath } from "../vite.config.js";

const CHECKOUT = "actions-checkout-728eabd6";
const TOOLCHAIN = "actions-rs-toolchain-a103c84e";

describe("the vite proof plugin accepts the committed action report names", () => {
  it("proofNamesFromPath accepts both committed paths", () => {
    expect(proofNamesFromPath(`/demo/proofs/nixpacks-actions/${CHECKOUT}.json`)).toEqual({ repo: "nixpacks-actions", package: CHECKOUT });
    expect(proofNamesFromPath(`/demo/proofs/nixpacks-actions/${TOOLCHAIN}.json`)).toEqual({ repo: "nixpacks-actions", package: TOOLCHAIN });
    expect(DEMO_NAME_PATTERN.test("nixpacks-actions")).toBe(true);
    expect(PROOF_NAME_PATTERN.test(CHECKOUT) && PROOF_NAME_PATTERN.test(TOOLCHAIN)).toBe(true);
  });

  it("the build plugin emits both files", () => {
    const plugin = demoProofs();
    const emitted: string[] = [];
    const generate = plugin.generateBundle as unknown as (this: { emitFile(f: { fileName: string }): void }) => void;
    generate.call({ emitFile: (f) => emitted.push(f.fileName) });
    expect(emitted).toContain(`demo/proofs/nixpacks-actions/${CHECKOUT}.json`);
    expect(emitted).toContain(`demo/proofs/nixpacks-actions/${TOOLCHAIN}.json`);
  });
});
