// @vitest-environment jsdom
// toe-tag-redesign 10.5: Property 7, motion is gated, finite and not blocking (static part + DOM part).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertProperty } from "@last-rites/skeleton/graveyard/testing";
import { describe, expect, it } from "vitest";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { sheetsFrom } from "./test-support/properties/tt4.js";
import { build, buildDom, motionViolations } from "./test-support/properties/tt7.js";

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
const sheets = sheetsFrom((name) => read(`./styles/${name}`));
const sources = { "views/detail.ts": read("./views/detail.ts"), "views/tombstone.ts": read("./views/tombstone.ts") };

describe("Property 7: motion", () => {
  it("static rules hold (property)", () => {
    assertProperty("toe-tag P7 motion", build(sheets, sources));
  });

  it("has no violation at all (exhaustive)", () => {
    expect(motionViolations(sheets)).toEqual([]);
  });

  it("the panel is open and focused right after the click, for generated reports", async () => {
    const report = await checkAsyncProperty("Property 7: open at once", buildDom());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 180_000);
});
