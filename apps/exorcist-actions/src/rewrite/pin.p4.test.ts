import { describe, expect, it } from "vitest";
import { inventoryText } from "../inventory/inventory.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { pinAllProperties, realPinImpl, type PinImpl } from "../test-support/properties/actions-p4.js";
import { pinAll, pinUse } from "./pin.js";

/** Property 4 over a swappable implementation, for the central sabotage test. */
export async function build(impl: PinImpl = realPinImpl): Promise<void> {
  for (const p of pinAllProperties) await assertPropertyAsync(p.name, p.build(impl));
}

const SHA = "0123456789abcdef0123456789abcdef01234567";
const head = "jobs:\n  a:\n    steps:\n";
const firstUse = (text: string) => inventoryText("w.yml", text).uses[0]!;

describe("Property 4: pin idempotence, refusal and pinAll", () => {
  it("holds for the real implementation", async () => {
    await build();
  });

  describe("each refusal reason, on hand-written text", () => {
    it("unsupported_layout: a flow mapping step", () => {
      const text = `${head}      - { uses: a/b@v1 }\n`;
      expect(pinUse(text, firstUse(text), SHA)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    });

    it("unsupported_layout: a trailing comma", () => {
      const text = `${head}      - { id: x, uses: a/b@v1, name: n }\n`;
      expect(pinUse(text, firstUse(text), SHA)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    });

    it("unsupported_layout: a stale use whose text is not at its offset", () => {
      const text = `${head}      - uses: a/b@v1\n`;
      const use = firstUse(text);
      expect(pinUse("x" + text, use, SHA)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    });

    it("unsupported_layout: a closing bracket after a quoted scalar", () => {
      const text = `${head}      - {uses: "a/b@v1"}\n`;
      expect(pinUse(text, firstUse(text), SHA)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    });

    it.each([
      ["wrong length", SHA.slice(1)],
      ["upper case", SHA.toUpperCase()],
      ["non-hexadecimal", "g" + SHA.slice(1)],
      ["empty", ""],
    ])("invalid_sha: %s", (_name, bad) => {
      const text = `${head}      - uses: a/b@v1\n`;
      expect(pinUse(text, firstUse(text), bad)).toEqual({ ok: false, reason: "invalid_sha" });
    });

    it("an already pinned use is a no-op (never not_mutable)", () => {
      const text = `${head}      - uses: a/b@${SHA}\n`;
      expect(pinUse(text, firstUse(text), SHA)).toEqual({ ok: true, text, changed: false });
    });
  });

  it("pinAll returns the first refusal (last offset first) and a missing sha is invalid_sha", () => {
    const text = `${head}      - uses: a/b@v1\n      - { uses: c/d@v2 }\n`;
    const uses = inventoryText("w.yml", text).uses;
    const shas = new Map([
      ["a/b@v1", SHA],
      ["c/d@v2", SHA],
    ]);
    expect(pinAll(text, uses, shas)).toMatchObject({ ok: false, reason: "unsupported_layout" });
    expect(pinAll(text, [uses[0]!], new Map())).toEqual({ ok: false, reason: "invalid_sha", detail: "no sha for a/b@v1" });
    expect(pinAll(text, [], new Map())).toEqual({ ok: true, text, changed: false });
  });

  it("pinAll pins two uses of one file", () => {
    const text = `${head}      - uses: a/b@v1 # one\n      - uses: "c/d@v2"\n`;
    const uses = inventoryText("w.yml", text).uses;
    const r = pinAll(text, uses, new Map([["a/b@v1", SHA], ["c/d@v2", SHA.replace(/0/g, "f")]]));
    expect(r).toEqual({
      ok: true,
      changed: true,
      text: `${head}      - uses: a/b@${SHA} # v1 # one\n      - uses: "c/d@${SHA.replace(/0/g, "f")}" # v2\n`,
    });
  });
});
