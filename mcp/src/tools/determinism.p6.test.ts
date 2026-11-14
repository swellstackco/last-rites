import { tmpdir } from "node:os";
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ScanOutcome } from "@last-rites/exorcist-npm/programmatic";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "../test-support/sabotage-runner.js";
import { REAL_TOOLS, type Tools } from "../test-support/validators.js";
import { KIRO_P6_SABOTAGES } from "../test-support/sabotage/kiro-p6.js";
import { counting, makeDeps, memoryProbe, recordingReportFs } from "../test-support/fakes.js";
import { e18eOutcomeArb, npmNameArb, proofPartsFor, proofScenarioArb, scanOutcomeArb, usageResultArb } from "../test-support/arbitraries/tool-outcomes.js";
import type { ExorcistDeps } from "../deps.js";

export const name = "Property 6: Determinism";

const fail = (m: string): never => {
  throw new Error(m);
};
const texts = (r: CallToolResult): string[] => r.content.map((c) => (c as { text: string }).text);

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Runs `call` three times; between runs `Math.random` is consumed and `Date.now` moves. */
async function threeRuns(call: () => Promise<CallToolResult>): Promise<CallToolResult[]> {
  const realNow = Date.now;
  const out: CallToolResult[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const t = 1_900_000_000_000 + i * 86_400_000 + 7 * i;
      Date.now = () => t;
      for (let k = 0; k < 5 + i; k++) Math.random();
      out.push(await call());
    }
  } finally {
    Date.now = realNow;
  }
  return out;
}

const sameAll = (rs: CallToolResult[], what: string): void => {
  const a = JSON.stringify(rs[0]);
  rs.forEach((r, i) => {
    if (JSON.stringify(r) !== a) fail(`${what}: run ${i + 1} differs from run 1`);
  });
};

/**
 * No timestamp, no absolute path of this process, no current-time digits in the report (first item).
 * The summary of a call with `out` names the file written (`written: <abs out>`) on purpose, so only the first item is checked for paths.
 */
const clean = (rs: CallToolResult[], what: string): void => {
  const bad = [process.cwd(), tmpdir(), "/work/"];
  for (const r of rs) {
    for (const [i, t] of texts(r).entries()) {
      if (ISO.test(t)) fail(`${what}: contains an ISO timestamp`);
      for (const b of bad) if (i === 0 && b.length > 1 && t.includes(b)) fail(`${what}: contains the absolute path ${b}`);
      for (const n of [1_900_000_000_000, 1_900_086_400_000 + 7, 1_900_172_800_000 + 14]) if (t.includes(String(n))) fail(`${what}: contains the current time`);
    }
  }
};

export function build(impl: Tools) {
  return fc.asyncProperty(
    fc.oneof(
      fc.tuple(scanOutcomeArb, fc.constantFrom<string | undefined>(undefined, "main")).map(([outcome, ref]) => ({ kind: "github" as const, outcome, ref })),
      fc.tuple(usageResultArb, npmNameArb).map(([usage, pkg]) => ({ kind: "usage" as const, usage, pkg })),
      fc.tuple(e18eOutcomeArb, npmNameArb).map(([outcome, pkg]) => ({ kind: "find" as const, outcome, pkg })),
      fc.tuple(proofScenarioArb, fc.boolean()).map(([scenario, withOut]) => ({ kind: "pin" as const, scenario, withOut })),
    ),
    async (s) => {
      if (s.kind === "github") {
        const outcome: ScanOutcome = s.outcome;
        const deps = makeDeps({ scan: { ...makeDeps().scan, github: counting(async () => outcome) } });
        sameAll(await threeRuns(() => impl.scanRepo(deps, { repo: "octo/cat", ...(s.ref === undefined ? {} : { ref: s.ref }) })), "scan_repo");
        return true;
      }
      if (s.kind === "usage") {
        const deps = makeDeps({
          probe: memoryProbe({ "/work/proj/a.js": "" }),
          usageSurface: async (input) => ({ ...(s.usage as never as Record<string, unknown>), package: input.package }) as never,
        });
        const rs = await threeRuns(() => impl.usageSurface(deps, { path: "./proj", package: s.pkg }));
        sameAll(rs, "usage_surface");
        clean(rs, "usage_surface");
        return true;
      }
      if (s.kind === "find") {
        const deps = makeDeps({ e18e: async () => s.outcome as never });
        sameAll(await threeRuns(() => impl.findReplacement(deps, { package: s.pkg })), "find_replacement");
        return true;
      }
      const parts = proofPartsFor(s.scenario, makeDeps().proof);
      const mk = (): ExorcistDeps =>
        makeDeps({
          probe: memoryProbe({ "/work/proj/a.js": "", "/work/cand.js": "" }),
          usageSurface: parts.usageSurface,
          proof: { ...parts.proof, nodeReportFs: recordingReportFs() },
        });
      const rs = await threeRuns(() =>
        impl.generatePinTests(mk(), { path: "./proj", package: parts.package, candidate: "cand.js", runs: s.scenario.runs, ...(s.withOut ? { out: "proofs/proj/x.json" } : {}) }),
      );
      sameAll(rs, "generate_pin_tests");
      clean(rs, "generate_pin_tests");
      return true;
    },
  );
}

export const property6: NamedAsyncProperty<Tools> = { name, build };

describe(name, () => {
  it("holds for the real tools", async () => {
    await assertPropertyAsync(name, build(REAL_TOOLS));
  });

  it("every sabotage is caught", async () => {
    await expect(assertAllSabotagesCaughtAsync(name, [property6], KIRO_P6_SABOTAGES)).resolves.toBeUndefined();
  });
});
