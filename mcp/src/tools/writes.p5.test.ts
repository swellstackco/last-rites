import { basename, dirname, resolve } from "node:path";
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { isProofOutPath } from "@last-rites/exorcist-npm/programmatic";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "../test-support/sabotage-runner.js";
import { REAL_TOOLS, type Tools } from "../test-support/validators.js";
import { KIRO_P5_SABOTAGES } from "../test-support/sabotage/kiro-p5.js";
import { makeDeps, memoryProbe, recordingReportFs } from "../test-support/fakes.js";
import { proofPartsFor, proofScenarioArb } from "../test-support/arbitraries/tool-outcomes.js";

export const name = "Property 5: Write confinement";

const fail = (m: string): never => {
  throw new Error(m);
};

/** The codes of the argument guards (Requirement 3): such a call touches nothing. */
const GUARD_CODES = new Set([
  "invalid_input",
  "invalid_repo",
  "invalid_ref",
  "invalid_package",
  "invalid_path",
  "path_not_found",
  "not_a_directory",
  "invalid_candidate",
  "invalid_runs",
  "invalid_out",
]);

const errorCode = (r: CallToolResult): string | undefined =>
  r.isError === true ? (JSON.parse((r.content[0] as { text: string }).text) as { error: { code: string } }).error.code : undefined;

const OUTS = ["proofs/proj/x.json", "proofs/proj/y.json", "out/proofs/proj/z.json", "x.json", "../x.json", "proofs/x.json", "/etc/passwd", "proofs/Bad Name/x.json", "proofs/proj/", ""];

const callArb = fc.oneof(
  fc.record({ tool: fc.constant("scanRepo" as const), args: fc.record({ repo: fc.constantFrom("octo/cat", "./proj", "jest", "bad repo", "./nope"), ref: fc.constantFrom(undefined, "main") }) }),
  fc.record({ tool: fc.constant("deathReport" as const), args: fc.record({ repo: fc.constantFrom("octo/cat", "./proj", "jest"), package: fc.constantFrom("left-pad", "Bad") }) }),
  fc.record({ tool: fc.constant("usageSurface" as const), args: fc.record({ path: fc.constantFrom("./proj", "./nope", "./cand.js", "x\0y"), package: fc.constantFrom("left-pad", "@s/p", "Bad") }) }),
  fc.record({ tool: fc.constant("findReplacement" as const), args: fc.record({ package: fc.constantFrom("left-pad", "Bad") }) }),
  fc.record({
    tool: fc.constant("generatePinTests" as const),
    args: fc.record({
      path: fc.constantFrom("./proj", "./proj", "./nope"),
      package: fc.constantFrom("PKG", "PKG", "PKG", "Bad"),
      candidate: fc.constantFrom("cand.js", "cand.js", "missing.js", undefined),
      runs: fc.constantFrom(undefined, undefined, 100, 5),
      out: fc.constantFrom(undefined, undefined, ...OUTS),
    }),
  }),
);

export function build(impl: Tools) {
  return fc.asyncProperty(fc.tuple(proofScenarioArb, fc.array(callArb, { minLength: 1, maxLength: 6 })), async ([scenario, calls]) => {
    const base = makeDeps();
    const parts = proofPartsFor(scenario, base.proof);
    const recorder = recordingReportFs();
    const probe = memoryProbe({ "/work/proj/a.js": "", "/work/cand.js": "" });
    const deps = makeDeps({ probe, usageSurface: parts.usageSurface, proof: { ...parts.proof, nodeReportFs: recorder } });

    for (const c of calls) {
      const before = { writes: recorder.writes.length, reads: recorder.reads.length, calls: deps.totalCalls() };
      const args = { ...c.args } as Record<string, unknown>;
      if (args["package"] === "PKG") args["package"] = parts.package;
      for (const k of Object.keys(args)) if (args[k] === undefined) delete args[k];
      const r = await (impl[c.tool] as (d: typeof deps, a: never) => Promise<CallToolResult>)(deps, args as never);
      const written = recorder.writes.slice(before.writes);
      const code = errorCode(r);

      if (code !== undefined && GUARD_CODES.has(code)) {
        if (written.length !== 0) fail(`a rejected input (${code}) wrote ${written[0]!.path}`);
        if (recorder.reads.length !== before.reads) fail(`a rejected input (${code}) read through the ReportFs`);
        if (deps.totalCalls() !== before.calls) fail(`a rejected input (${code}) called a Dep`);
      }
      if (c.tool !== "generatePinTests") {
        if (written.length !== 0) fail(`${c.tool} wrote ${written[0]!.path}`);
        continue;
      }
      if (args["out"] === undefined) {
        if (written.length !== 0) fail(`generate_pin_tests without out wrote ${written[0]!.path}`);
        continue;
      }
      const abs = resolve("/work", args["out"] as string);
      for (const w of written) {
        const isOut = w.path === abs;
        const isTmp = dirname(w.path) === dirname(abs) && new RegExp(`^\\.${basename(abs).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.\\d+\\.tmp$`).test(basename(w.path));
        if (!isOut && !isTmp) fail(`wrote ${w.path}, outside {out, its temporary file}`);
        if (isOut && !isProofOutPath(w.path)) fail(`wrote ${w.path}, not a proof report path`);
        if (w.path === "/work/cand.js" || dirname(w.path) === "/work" || w.path.startsWith("/work/proj/")) fail(`wrote ${w.path} into the candidate's or the target's directory`);
      }
    }
    return true;
  });
}

export const property5: NamedAsyncProperty<Tools> = { name, build };

describe(name, () => {
  it("holds for the real tools", async () => {
    await assertPropertyAsync(name, build(REAL_TOOLS));
  });

  it("every sabotage is caught", async () => {
    await expect(assertAllSabotagesCaughtAsync(name, [property5], KIRO_P5_SABOTAGES)).resolves.toBeUndefined();
  });
});
