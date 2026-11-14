// Requirement 16.7: the same scan and the same two exorcise runs, offline over the recorded fixtures with a
// fake clock at the snapshot's `scannedAt`, reproduce the three committed files byte for byte.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/programmatic";
import { actionProofName } from "./proof/names.js";
import { DEMO_PROOFS_DIR, DEMO_SNAPSHOT_PATH, HERO, replayHero } from "./test-support/harness.js";

const snapshot = readFileSync(DEMO_SNAPSHOT_PATH, "utf8");

describe("offline replay of the hero pipeline", () => {
  it("reproduces demo/nixpacks-actions.json and both hero proof reports byte for byte", async () => {
    const parsed = parseReport(snapshot);
    expect(parsed.ok).toBe(true);
    const out = await replayHero(parsed.ok ? parsed.report.scannedAt : "");

    expect(out.http.unmatched.map((r) => r.url)).toEqual([]);
    expect(out.scan).toBe(snapshot);

    const committed = readdirSync(DEMO_PROOFS_DIR).filter((f) => f.endsWith(".json")).sort();
    const expected = [actionProofName(HERO.pinAction), actionProofName(HERO.swapAction)].map((n) => `${n}.json`).sort();
    expect(committed).toEqual(expected);
    expect(Object.keys(out.proofs).sort()).toEqual(expected);
    for (const file of committed) expect(out.proofs[file], file).toBe(readFileSync(join(DEMO_PROOFS_DIR, file), "utf8"));
  });
});
