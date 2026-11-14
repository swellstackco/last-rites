import { describe, expect, it } from "vitest";
import { parseReport, serializeReport } from "@last-rites/exorcist-npm/programmatic";
import type { ActionEvidenceInput, ActionEvidenceStage } from "../evidence/stage.js";
import { allUnknownEvidence } from "../evidence/stage.js";
import { memorySourceFs } from "../test-support/memory-source-fs.js";
import { runScan } from "./scan.js";

const clock = (): Date => new Date("2026-02-03T04:05:06.000Z");
const listing = [{ name: "ci.yml", kind: "file" as const }];
const wf = (...uses: string[]): string =>
  `jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n${uses.map((u) => `      - uses: ${u}\n`).join("")}`;
const input = { root: "/repo", label: "o/n", ref: "local" };

describe("runScan", () => {
  it("two uses of one repository with different refs give one dependency with declaredRange `v1, v2`", async () => {
    const calls: ActionEvidenceInput[] = [];
    const evidence: ActionEvidenceStage = async (i) => {
      calls.push(i);
      return allUnknownEvidence(i.name);
    };
    const fs = memorySourceFs({ ".github/workflows/ci.yml": wf("a/b@v2", "A/B@v1") }, listing);
    const report = await runScan(input, { fs, evidence, clock });
    expect(report.dependencies).toHaveLength(1);
    expect(report.dependencies[0]!.name).toBe("a/b");
    expect(report.dependencies[0]!.declaredRange).toBe("v1, v2");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "a/b", ref: "v2", site: "step" });
    expect(report.scannedAt).toBe("2026-02-03T04:05:06.000Z");
    expect(report.ecosystem).toBe("github-actions");
    expect(parseReport(serializeReport(report)).ok).toBe(true);
  });

  it("a repository with no uses gives a valid empty report", async () => {
    const fs = memorySourceFs({}, undefined);
    const report = await runScan(input, { fs, evidence: async (i) => allUnknownEvidence(i.name), clock });
    expect(report.dependencies).toEqual([]);
    expect(report.warnings).toContain("no .github/workflows directory");
    expect(parseReport(serializeReport(report)).ok).toBe(true);
  });

  it("skipped uses appear as skipped entries and warnings", async () => {
    const fs = memorySourceFs({ ".github/workflows/ci.yml": wf("./local", "docker://img:1", "a/b@v1") }, listing);
    const report = await runScan(input, { fs, evidence: async (i) => allUnknownEvidence(i.name), clock });
    expect(report.skipped.map((s) => s.specifier)).toEqual(["./local", "docker://img:1"]);
    expect(report.skipped.every((s) => s.reason === "other" && s.kind === "dependencies")).toBe(true);
    expect(report.warnings).toContain(".github/workflows/ci.yml:5: skipped local: ./local");
    expect(report.summary.skipped).toBe(2);
    expect(report.dependencies).toHaveLength(1);
  });

  it("a rejecting stage keeps the other dependencies", async () => {
    const evidence: ActionEvidenceStage = async (i) => {
      if (i.name === "bad/one") throw new Error("boom");
      return allUnknownEvidence(i.name);
    };
    const fs = memorySourceFs({ ".github/workflows/ci.yml": wf("bad/one@v1", "good/two@v1") }, listing);
    const report = await runScan(input, { fs, evidence, clock });
    expect(report.dependencies.map((d) => d.name).sort()).toEqual(["bad/one", "good/two"]);
    const bad = report.dependencies.find((d) => d.name === "bad/one")!;
    expect(bad.signals.repoArchived).toEqual({ kind: "unknown" });
    expect(bad.evidenceWarnings).toEqual(["evidence failed for bad/one"]);
  });

  it("never rejects when the file system throws", async () => {
    const fs = {
      async readDir(): Promise<never> {
        throw new Error("io");
      },
      async readText(): Promise<never> {
        throw new Error("io");
      },
    };
    const report = await runScan(input, { fs, evidence: async (i) => allUnknownEvidence(i.name), clock });
    expect(report.dependencies).toEqual([]);
    expect(report.warnings).toEqual(["inventory failed"]);
  });
});
