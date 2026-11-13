import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseReport, serializeReport, type ScanOutcome, type ScanPipeline } from "@graveyard-kit/exorcist-npm/programmatic";
import { parseProofReport, serializeProofReport } from "@graveyard-kit/skeleton/proof";
import { ERROR_CODES } from "../errors.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "../test-support/sabotage-runner.js";
import { REAL_TOOLS, type Tools } from "../test-support/validators.js";
import { KIRO_P2_SABOTAGES } from "../test-support/sabotage/kiro-p2.js";
import { counting, makeDeps, memoryProbe } from "../test-support/fakes.js";
import {
  e18eOutcomeArb,
  npmNameArb,
  proofPartsFor,
  proofScenarioArb,
  scanOutcomeArb,
  usageResultArb,
} from "../test-support/arbitraries/tool-outcomes.js";

export const name = "Property 2: Output contract with the existing validators";

const fail = (m: string): never => {
  throw new Error(m);
};
const text = (r: CallToolResult, i = 0): string => ((r.content[i] as { text?: unknown } | undefined)?.text as string | undefined) ?? fail(`no text item ${i}`);

/** Every Tool_Error text is `{error:{code,message}}` with a known code and a non-empty message, `isError` true. */
export function checkToolError(r: CallToolResult): void {
  if (r.isError !== true) fail("error result without isError true");
  if (r.content.length !== 1) fail("error result must have exactly one item");
  const j = JSON.parse(text(r)) as { error?: { code?: unknown; message?: unknown } };
  const keys = Object.keys(j);
  if (keys.length !== 1 || keys[0] !== "error") fail("error body must be {error}");
  const { code, message } = j.error ?? {};
  if (typeof code !== "string" || !(ERROR_CODES as readonly string[]).includes(code)) fail(`unknown error code ${String(code)}`);
  if (typeof message !== "string" || message === "") fail("empty error message");
}

/** A success has `isError` absent or false and at least one text item. */
export function checkSuccess(r: CallToolResult): void {
  if (r.isError === true) fail(`unexpected error: ${text(r).slice(0, 100)}`);
  if (r.content.length < 1) fail("success without a text item");
}

const pipelineFor = (o: ScanOutcome): ScanPipeline => async () => o;

export function build(impl: Tools) {
  return fc.asyncProperty(
    fc.oneof(
      scanOutcomeArb.map((outcome) => ({ kind: "scan" as const, outcome })),
      fc.tuple(scanOutcomeArb, fc.nat({ max: 9 })).map(([outcome, pick]) => ({ kind: "death" as const, outcome, pick })),
      fc.tuple(usageResultArb, npmNameArb).map(([usage, pkg]) => ({ kind: "usage" as const, usage, pkg })),
      fc.tuple(e18eOutcomeArb, npmNameArb).map(([outcome, pkg]) => ({ kind: "find" as const, outcome, pkg })),
      fc.tuple(proofScenarioArb, fc.boolean()).map(([scenario, withOut]) => ({ kind: "pin" as const, scenario, withOut })),
    ),
    async (s) => {
      if (s.kind === "scan") {
        const deps = makeDeps({ scan: { ...makeDeps().scan, github: counting(pipelineFor(s.outcome)) } });
        const r = await impl.scanRepo(deps, { repo: "octo/cat" });
        if (!s.outcome.ok) return checkToolError(r), true;
        checkSuccess(r);
        const p = parseReport(text(r));
        if (!p.ok) fail("scan_repo text rejected by parseReport");
        else if (serializeReport(p.report) !== text(r)) fail("scan_repo text is not canonical");
        return true;
      }
      if (s.kind === "death") {
        const renamed: ScanOutcome = s.outcome.ok
          ? {
              ok: true,
              report: { ...s.outcome.report, dependencies: s.outcome.report.dependencies.map((d, i) => ({ ...d, name: `pkg-${i}` })), skipped: [] },
            }
          : s.outcome;
        const deps = makeDeps({ scan: { ...makeDeps().scan, github: counting(pipelineFor(renamed)) } });
        const n = renamed.ok ? renamed.report.dependencies.length : 0;
        const index = n === 0 ? 0 : s.pick % n;
        const r = await impl.deathReport(deps, { repo: "octo/cat", package: `pkg-${index}` });
        if (!renamed.ok || n === 0) return checkToolError(r), true;
        checkSuccess(r);
        const p = parseReport(text(r));
        if (!p.ok) return fail("death_report text rejected by parseReport");
        if (serializeReport(p.report) !== text(r)) fail("death_report text is not canonical");
        if (p.report.summary.total !== 1) fail(`summary.total is ${p.report.summary.total}`);
        if (p.report.dependencies.length !== 1) fail("expected one dependency");
        expect(p.report.dependencies[0]).toEqual(renamed.report.dependencies[index]);
        return true;
      }
      if (s.kind === "usage") {
        const deps = makeDeps({
          probe: memoryProbe({ "/work/proj/a.js": "" }),
          usageSurface: async (input) => ({ ...(s.usage as never as Record<string, unknown>), package: input.package }) as never,
        });
        const r = await impl.usageSurface(deps, { path: "./proj", package: s.pkg });
        checkSuccess(r);
        const p = parseProofReport(text(r));
        if (!p.ok) return fail("usage_surface text rejected by parseProofReport");
        if (serializeProofReport(p.report) !== text(r)) fail("usage_surface text is not canonical");
        if (p.report.attempts.length !== 0) fail("usage_surface must have zero attempts");
        return true;
      }
      if (s.kind === "find") {
        const deps = makeDeps({ e18e: async () => s.outcome as never });
        const r = await impl.findReplacement(deps, { package: s.pkg });
        const o = s.outcome as { ok: boolean };
        if (!o.ok) return checkToolError(r), true;
        checkSuccess(r);
        const j = JSON.parse(text(r)) as Record<string, unknown>;
        if (JSON.stringify(Object.keys(j)) !== JSON.stringify(["package", "replacement", "sourceUrl"])) fail("keys out of order");
        const rep = j["replacement"];
        const okRep = rep === "none" || (typeof rep === "object" && rep !== null && typeof (rep as { type?: unknown }).type === "string" && Array.isArray((rep as { replacements?: unknown }).replacements));
        if (!okRep) fail(`bad replacement ${JSON.stringify(rep)}`);
        return true;
      }
      // pin
      const base = makeDeps();
      const parts = proofPartsFor(s.scenario as never, base.proof);
      const deps = makeDeps({
        probe: memoryProbe({ "/work/proj/a.js": "", "/work/cand.js": "" }),
        usageSurface: parts.usageSurface,
        proof: parts.proof,
      });
      const r = await impl.generatePinTests(deps, {
        path: "./proj",
        package: parts.package,
        candidate: "cand.js",
        runs: (s.scenario as { runs: number }).runs,
        ...(s.withOut ? { out: "proofs/proj/x.json" } : {}),
      });
      checkSuccess(r);
      const p = parseProofReport(text(r));
      if (!p.ok) return fail("generate_pin_tests text rejected by parseProofReport");
      if (serializeProofReport(p.report) !== text(r)) fail("generate_pin_tests text is not canonical");
      if (p.report.attempts.length !== 1) fail("expected one attempt");
      const status = p.report.attempts[0]!.status;
      if (status === "error") fail(`unexpected error attempt: ${JSON.stringify(p.report.attempts[0]!.error)}`);
      if ((s.scenario as { fault?: string }).fault === undefined && status !== "proved") fail(`equivalent candidate gave ${status}`);
      return true;
    },
  );
}

export const property2: NamedAsyncProperty<Tools> = { name, build };

describe(name, () => {
  it("holds for the real tools", async () => {
    await assertPropertyAsync(name, build(REAL_TOOLS));
  });

  it("every sabotage is caught", async () => {
    expect(KIRO_P2_SABOTAGES.length).toBeGreaterThan(0);
    await assertAllSabotagesCaughtAsync(name, [property2], KIRO_P2_SABOTAGES);
  });
});
