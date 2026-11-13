// toe-tag-redesign 10.6: Property 8, the focus ring is never clipped or lost.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertProperty } from "@graveyard-kit/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { sheetsFrom } from "./test-support/properties/tt4.js";
import { build, focusViolations } from "./test-support/properties/tt8.js";

const sheets = sheetsFrom((name) => readFileSync(fileURLToPath(new URL(`./styles/${name}`, import.meta.url)), "utf8"));

describe("Property 8: focus ring", () => {
  it("every rule group holds (property)", () => {
    assertProperty("toe-tag P8 focus", build(sheets));
  });

  it("has no violation at all (exhaustive)", () => {
    expect(focusViolations(sheets)).toEqual([]);
  });
});
