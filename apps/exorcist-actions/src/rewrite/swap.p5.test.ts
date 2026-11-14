import { describe, expect, it } from "vitest";
import { inventoryText } from "../inventory/inventory.js";
import type { ActionReplacement } from "../replacements.js";
import { REPLACEMENTS, findReplacement } from "../replacements.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { swapProperties, realSwapImpl, type SwapImpl } from "../test-support/properties/actions-p5.js";
import { swapUse } from "./swap.js";

/** Property 5 over a swappable implementation, for the central sabotage test. */
export async function build(impl: SwapImpl = realSwapImpl): Promise<void> {
  for (const p of swapProperties) await assertPropertyAsync(p.name, p.build(impl));
}

// A test-local replacement: the seed entries carry empty mappings until task 8.3.
const toolchain: ActionReplacement = {
  from: "actions-rs/toolchain",
  kind: "action",
  to: "dtolnay/rust-toolchain",
  toRef: "stable",
  sourceUrl: "https://example.test/from",
  replacementUrl: "https://example.test/to",
  inputs: { toolchain: "toolchain", components: "components", target: "targets", override: null, profile: null },
};

const CI = [
  "jobs:",
  "  build:",
  "    steps:",
  "      - name: Install stable toolchain",
  "        uses: actions-rs/toolchain@v1",
  "        with:",
  "          profile: minimal",
  "          toolchain: stable",
  "          override: true",
  "          components: rustfmt, clippy",
  "",
  "      - uses: Swatinem/rust-cache@v2",
  "",
].join("\n");

const useOf = (text: string) => inventoryText("ci.yml", text).uses[0]!;

describe("Property 5: swap rewrite and the input mapping", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("example: the actions-rs/toolchain shape of the nixpacks ci.yml", () => {
    expect(swapUse(CI, useOf(CI), toolchain)).toEqual({
      ok: true,
      text: [
        "jobs:",
        "  build:",
        "    steps:",
        "      - name: Install stable toolchain",
        "        uses: dtolnay/rust-toolchain@stable # was actions-rs/toolchain@v1",
        "        with:",
        "          toolchain: stable",
        "          components: rustfmt, clippy",
        "",
        "      - uses: Swatinem/rust-cache@v2",
        "",
      ].join("\n"),
    });
  });

  it("example: every entry dropped removes the with: line too", () => {
    const text = CI.replace("          toolchain: stable\n", "").replace("          components: rustfmt, clippy\n", "");
    const r = swapUse(text, useOf(text), toolchain);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.text).not.toContain("with:");
    expect(r.ok && r.text).toContain("uses: dtolnay/rust-toolchain@stable # was actions-rs/toolchain@v1\n\n      - uses: Swatinem");
  });

  it("example: the seed entries have empty mappings, so a use with inputs is refused by name", () => {
    const seed = findReplacement("actions-rs/toolchain")!;
    expect(swapUse(CI, useOf(CI), seed)).toEqual({ ok: false, reason: "unmapped_input", detail: "profile" });
  });

  it("example: a use without a with map swaps with an empty mapping", () => {
    const text = "jobs:\n  a:\n    steps:\n      - uses: 'actions/create-release@v1'  # note\n";
    const seed = findReplacement("actions/create-release")!;
    expect(swapUse(text, useOf(text), seed)).toEqual({
      ok: true,
      text: "jobs:\n  a:\n    steps:\n      - uses: 'softprops/action-gh-release@v2' # was actions/create-release@v1  # note\n",
    });
  });

  it("example: the first unmapped key in source order is named", () => {
    const text = CI.replace("profile: minimal", "profile: minimal\n          zeta: 1\n          alpha: 2");
    expect(swapUse(text, useOf(text), toolchain)).toEqual({ ok: false, reason: "unmapped_input", detail: "zeta" });
  });

  it("example: layouts that are refused leave nothing written", () => {
    const flowWith = "jobs:\n  a:\n    steps:\n      - uses: actions-rs/toolchain@v1\n        with: { toolchain: stable }\n";
    expect(swapUse(flowWith, useOf(flowWith), toolchain)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    const block = "jobs:\n  a:\n    steps:\n      - uses: actions-rs/toolchain@v1\n        with:\n          override: |\n            x\n          toolchain: stable\n";
    expect(swapUse(block, useOf(block), toolchain)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    const flowStep = "jobs:\n  a:\n    steps:\n      - { uses: actions-rs/toolchain@v1 }\n";
    expect(swapUse(flowStep, useOf(flowStep), toolchain)).toMatchObject({ ok: false, reason: "unsupported_layout" });
  });

  it("example: refusals for a run replacement, a path and another name", () => {
    const run = REPLACEMENTS.find((r) => r.kind === "run")!;
    const cargo = "jobs:\n  a:\n    steps:\n      - uses: actions-rs/cargo@v1\n";
    expect(swapUse(cargo, useOf(cargo), run)).toEqual({ ok: false, reason: "unsupported_replacement_kind" });
    const path = "jobs:\n  a:\n    steps:\n      - uses: actions-rs/toolchain/sub@v1\n";
    expect(swapUse(path, useOf(path), toolchain)).toEqual({ ok: false, reason: "no_replacement" });
    expect(swapUse(CI, useOf(CI), { ...toolchain, from: "x/y" })).toEqual({ ok: false, reason: "no_replacement" });
  });

  it("examples: findReplacement", () => {
    expect(findReplacement("ACTIONS-RS/Toolchain")).toBe(REPLACEMENTS[2]);
    expect(findReplacement("actions-rs/cargo")).toMatchObject({ kind: "run", command: "cargo" });
    expect(findReplacement("nobody/nothing")).toBeUndefined();
    expect(findReplacement("")).toBeUndefined();
  });
});
