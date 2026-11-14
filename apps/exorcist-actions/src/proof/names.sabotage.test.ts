// graveyard-ui-actions 4.2: Sabotage_Lists for Property 2 (names) and the pure half of Property 3 (proofNameFor).
// Each deliberately wrong implementation must make at least one property fail under the fixed seed. No network.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIXED_SEED, formatReport } from "../test-support/fc-runner.js";
import { namesProperties, realNamesImpl, staticViolations } from "../test-support/properties/p-actions-2.js";
import { P2_SABOTAGES, P2_STATIC_SABOTAGES, P3_PURE_SABOTAGES } from "../test-support/sabotage/ui-actions-p2.js";
import { runAgainst } from "../test-support/sabotage-runner.js";
import { actionProofName as exported } from "./names.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts") && !/\.test\.ts$/.test(path)) out.push(path);
  }
  return out;
}

const realFiles = (): Record<string, string> => {
  const files: Record<string, string> = {};
  for (const f of [...walk(join(repoRoot, "apps")), ...walk(join(repoRoot, "skeleton"))]) {
    // Test support code legitimately uses node:crypto as the oracle; only production code is checked.
    const rel = relative(repoRoot, f);
    if (rel.includes("test-support") || rel.includes("__reference__")) continue;
    files[rel] = readFileSync(f, "utf8");
  }
  return files;
};

const SLOW = 120_000;

describe("Sabotage_List: Property 2 and Property 3 (pure half)", () => {
  const real = realNamesImpl(exported);

  it("the real implementation passes under the fixed seed", async () => {
    expect((await runAgainst(namesProperties, real, FIXED_SEED)).map(formatReport)).toEqual([]);
  }, SLOW);

  for (const s of [...P2_SABOTAGES, ...P3_PURE_SABOTAGES]) {
    it(`catches sabotage ${s.name}`, async () => {
      const failed = await runAgainst(namesProperties, s.impl, FIXED_SEED);
      expect(failed.length, `sabotage "${s.name}" stayed green`).toBeGreaterThan(0);
      console.log(`[sabotage: ${s.name}] caught by ${failed.map((f) => f.property).join("; ")}\n${formatReport(failed[0]!)}`);
    }, SLOW);
  }

  it("the static check is clean on the real files", () => {
    const files = realFiles();
    expect(Object.keys(files).length).toBeGreaterThan(50);
    expect(staticViolations(files)).toEqual([]);
  });

  for (const s of P2_STATIC_SABOTAGES) {
    it(`catches static sabotage ${s.name}`, () => {
      expect(staticViolations({ ...realFiles(), ...s.extra }).length, `sabotage "${s.name}" stayed green`).toBeGreaterThan(0);
    });
  }
});
