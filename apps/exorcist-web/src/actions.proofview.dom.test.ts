// @vitest-environment jsdom
// graveyard-ui-actions 1.2: B1 view exploratory tests (Property 4). The kind, coverage and rewrite halves FAIL on
// the unfixed code (the fields do not exist); "other shapes unchanged" PASSES. No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProofView } from "@last-rites/skeleton/graveyard";
import { parseProofReport } from "@last-rites/skeleton/proof";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import {
  CONTRACT_LINE,
  PIN_LINE,
  build as p4,
  buildOther as p4Other,
  checkCase,
} from "./test-support/properties/p-actions-4.js";
import type { AttemptViewK, P4Case } from "./test-support/properties/p-actions-4.js";

const demoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo", "proofs", "nixpacks-actions");
function viewOf(file: string): AttemptViewK {
  const parsed = parseProofReport(readFileSync(join(demoDir, `${file}.json`), "utf8"));
  if (!parsed.ok) throw new Error(`${file} does not parse`);
  return buildProofView(parsed.report).attempts[0] as AttemptViewK;
}

const hostileCase = (variant: "pin" | "contract"): P4Case => ({
  variant,
  shapes: [{ id: variant, status: "passed", runs: 3, coverage: { uses: 2 } }],
  source: "<img src=x onerror=alert(1)>\n- a\n+ b",
  candidateName: "n",
  status: "proved",
});

describe("Property 4: proof kinds (B1 view)", () => {
  it("pin and contract attempts show the kind line, coverage and rewrite; other attempts are unchanged", async () => {
    const report = await checkAsyncProperty("Property 4: proof kinds", p4());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 60_000);

  it("the committed pin report (actions/checkout)", () => {
    const a = viewOf("actions-checkout-728eabd6");
    expect(a.kindLine).toBe(PIN_LINE);
    expect(a.coverageText).toBe("5 files, 11 uses");
    expect(a.sabotageLine).toBe("Sabotage: 2 of 2 broken migrations caught");
    expect(a.rewrite?.lines[0]).toContain("uses: actions/checkout@v4");
    expect(a.rewrite?.lines.length).toBe(22);
    expect(a.rewrite?.moreCount).toBe(0);
  });

  it("the committed contract report (actions-rs/toolchain)", () => {
    const a = viewOf("actions-rs-toolchain-a103c84e");
    expect(a.kindLine).toBe(CONTRACT_LINE);
    expect(a.coverageText).toBe("dropped.override 6, dropped.profile 6, renamed.target 1, required.toolchain 6, uses 6");
    expect(a.sabotageLine).toBe("Sabotage: 12 of 12 broken migrations caught");
    expect(a.rewrite?.lines.join("\n")).toContain("dtolnay/rust-toolchain@master");
  });

  it("other shape sets keep the view they have today (new fields absent)", async () => {
    const report = await checkAsyncProperty("Property 4: other shapes unchanged", p4Other());
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  }, 60_000);

  for (const variant of ["pin", "contract"] as const) {
    it(`a hostile ${variant} rewrite is text and creates no element`, () => {
      checkCase(hostileCase(variant));
    });
  }
});
