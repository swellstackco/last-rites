import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import { loadCandidateBusted } from "../candidate-loader.js";
import { proofDeps } from "../test-support/proof-deps.js";
import { generatePinTestsImpl } from "./generate-pin-tests.js";

const DEDUP = `const f = (l) => l.length === 0 ? [] : [...l.map((x) => new Set(x)).reduce((a, b) => new Set([...a].filter((x) => b.has(x))))];\nf.big = f;\nexport default f;\n`;

describe("generate_pin_tests reloads an edited candidate", () => {
  it("proves, then gives a counterexample after the file is edited, in one process", async () => {
    const dir = await mkdtemp(join(tmpdir(), "exorcist-reload-"));
    try {
      const file = join(dir, "cand.mjs");
      await writeFile(file, `export { default } from ${JSON.stringify(join(process.cwd(), "node_modules/intersect/index.js"))};\n`);
      const { deps } = proofDeps("intersect-like");
      deps.probe = {
        stat: async (p) => (p === file ? { kind: "file" } : await proofDeps("intersect-like").probe.stat(p)),
        readText: async () => undefined,
      };
      deps.proof.loadCandidate = loadCandidateBusted;
      const run = async () => {
        const r = await generatePinTestsImpl(deps, { path: "./intersect-like", package: "intersect", candidate: file, runs: 200 });
        expect(r.isError).toBeFalsy();
        const p = parseProofReport((r.content[0] as { text: string }).text);
        return p.ok ? p.report.attempts[0]!.status : "unparsed";
      };
      expect(await run()).toBe("proved");
      await writeFile(file, DEDUP);
      expect(await run()).toBe("counterexample");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
