import { describe, expect, it } from "vitest";
import { inventoryText } from "../inventory/inventory.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { pinCheckProperties, realPinCheckImpl, type PinCheckImpl } from "../test-support/properties/actions-p8.js";
import { assertAllSabotagesCaught } from "../test-support/sabotage-runner.js";
import { sabotages } from "../test-support/sabotage/actions-p8.js";
import { pinAll } from "../rewrite/pin.js";
import { checkPin } from "./pin-check.js";

/** Property 8 over a swappable implementation, for the central sabotage test. */
export async function build(impl: PinCheckImpl = realPinCheckImpl): Promise<void> {
  for (const p of pinCheckProperties) await assertPropertyAsync(p.name, p.build(impl));
}

const SHA = "0123456789abcdef0123456789abcdef01234567";
const F = "w.yml";
const text = "jobs:\n  a:\n    steps:\n      - uses: a/b@v1\n      - run: x\n";

describe("Property 8: pin proof soundness", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  it("catches every sabotage", async () => {
    await assertAllSabotagesCaught("P8", pinCheckProperties, sabotages);
  });

  it("example: a pinned file passes; a changed neighbour line is the first violation", () => {
    const uses = inventoryText(F, text).uses;
    const r = pinAll(text, uses, new Map([["a/b@v1", SHA]]));
    if (!r.ok) throw new Error("refused");
    const input = { originals: new Map([[F, text]]), rewritten: new Map([[F, r.text]]), pinned: uses, resolved: new Map([["a/b@v1", SHA]]) };
    expect(checkPin(input)).toMatchObject({ ok: true });
    const bad = checkPin({ ...input, rewritten: new Map([[F, r.text.replace("run: x", "run: y")]]) });
    expect(bad).toMatchObject({ ok: false, violation: { kind: "bytes", line: 5 } });
  });
});
