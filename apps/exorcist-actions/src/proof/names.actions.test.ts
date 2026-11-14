// graveyard-ui-actions 3.1: Property 2 (one definition of actionProofName, a pure SHA-256 equal to node:crypto)
// and the pure half of Property 3 (`proofNameFor`). No network.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { actionProofName, isProofName, proofNameFor } from "@last-rites/skeleton/proof";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { modelName, namesProperties, realNamesImpl } from "../test-support/properties/p-actions-2.js";
import { actionProofName as exported } from "./names.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}
const isTest = (f: string): boolean => /\.test\.ts$/.test(f);

describe("Property 2: one pure definition of actionProofName", () => {
  for (const p of namesProperties) {
    it(p.name, async () => {
      await assertPropertyAsync(p.name, p.build(realNamesImpl(exported)));
    });
  }

  it("examples: the two committed hashes", () => {
    expect(actionProofName("actions-rs/toolchain")).toBe("actions-rs-toolchain-a103c84e");
    expect(actionProofName("actions/checkout")).toBe("actions-checkout-728eabd6");
    expect(actionProofName("Actions/Checkout")).toBe("actions-checkout-728eabd6");
  });

  it("examples: empty, long and odd input", () => {
    expect(actionProofName("")).toBe(modelName(""));
    expect(actionProofName("a".repeat(500))).toBe(modelName("a".repeat(500)));
    expect(actionProofName("\ud800/x")).toBe(modelName("\ud800/x"));
    expect(actionProofName("é/ü/\u{1F480}")).toBe(modelName("é/ü/\u{1F480}"));
  });

  it("static: `function actionProofName` has one definition under apps/ and skeleton/ (red until 3.2 re-exports it)", () => {
    const files = [...walk(join(repoRoot, "apps")), ...walk(join(repoRoot, "skeleton"))].filter((f) => !isTest(f));
    const definitions = files.filter((f) => /\bfunction\s+actionProofName\b/.test(readFileSync(f, "utf8"))).map((f) => relative(repoRoot, f));
    expect(definitions).toEqual(["skeleton/src/proof/names.ts"]);
  });

  it("static: no Node crypto in the skeleton or in non-test web code", () => {
    const files = [...walk(join(repoRoot, "skeleton", "src")), ...walk(join(repoRoot, "apps", "exorcist-web", "src"))].filter((f) => !isTest(f));
    expect(files.length).toBeGreaterThan(50);
    const hits = files.filter((f) => /node:crypto|\bcreateHash\b|from "crypto"/.test(readFileSync(f, "utf8"))).map((f) => relative(repoRoot, f));
    expect(hits).toEqual([]);
  });
});

describe("Property 3 (pure half): proofNameFor keeps the npm behavior", () => {
  const names = fc.oneof(
    fc.string({ maxLength: 80 }),
    fc.constantFrom("intersect", "deep-diff", "@babel/plugin-proposal-object-rest-spread", "Upper", "a/b", "", "-x", "a".repeat(64), "a".repeat(65)),
    fc.stringOf(fc.constantFrom("a", "b", "0", "-", "/", "@", "."), { maxLength: 70 }),
  );

  it("for ecosystem absent or npm it returns the name when it is a Proof_Name, else undefined", () => {
    fc.assert(
      fc.property(names, fc.constantFrom<"npm" | undefined>(undefined, "npm"), (n, ecosystem) => {
        expect(proofNameFor(ecosystem, n)).toBe(isProofName(n) ? n : undefined);
      }),
      { numRuns: 100, seed: 20261113 },
    );
  });

  it("for github-actions it returns actionProofName for non-empty names, a Proof_Name", () => {
    fc.assert(
      fc.property(names, (n) => {
        const got = proofNameFor("github-actions", n);
        if (n === "") expect(got).toBeUndefined();
        else expect(got).toBe(actionProofName(n));
        if (got !== undefined) expect(isProofName(got)).toBe(true);
      }),
      { numRuns: 100, seed: 20261113 },
    );
  });
});
