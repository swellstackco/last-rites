import { describe, expect, it } from "vitest";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { pinProperties, realPinImpl, type PinImpl } from "../test-support/properties/actions-p3.js";
import { inventoryText } from "../inventory/inventory.js";
import { pinUse } from "./pin.js";

/** Property 3 over a swappable implementation, for the central sabotage test. */
export async function build(impl: PinImpl = realPinImpl): Promise<void> {
  for (const p of pinProperties) await assertPropertyAsync(p.name, p.build(impl));
}

describe("Property 3: pin rewrite surgicality", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("example: a quoted use with a trailing comment under CRLF", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const text = `jobs:\r\n  a:\r\n    steps:\r\n      - uses: "actions/checkout@v4" # keep\r\n`;
    const use = inventoryText("w.yml", text).uses[0]!;
    expect(pinUse(text, use, sha)).toEqual({
      ok: true,
      changed: true,
      text: `jobs:\r\n  a:\r\n    steps:\r\n      - uses: "actions/checkout@${sha}" # v4 # keep\r\n`,
    });
  });
});
