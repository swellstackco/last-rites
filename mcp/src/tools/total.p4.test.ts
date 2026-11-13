import fc from "fast-check";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ScanPipeline } from "@graveyard-kit/exorcist-npm/programmatic";
import { ERROR_CODES, UNEXPECTED_MESSAGE } from "../errors.js";
import { assertPropertyAsync } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "../test-support/sabotage-runner.js";
import { REAL_TOTAL, type TotalTools } from "../test-support/validators.js";
import { KIRO_P4_SABOTAGES } from "../test-support/sabotage/kiro-p4.js";
import { makeDeps, memoryProbe } from "../test-support/fakes.js";
import type { ExorcistDeps } from "../deps.js";

export const name = "Property 4: Tool totality";

/** Appears in every thrown message: it must never reach a result. */
export const SECRET = "SECRET-token-9f3a";
const SETTLE_MS = 40;

const fail = (m: string): never => {
  throw new Error(m);
};

type ToolKey = "scanRepo" | "deathReport" | "usageSurface" | "findReplacement" | "generatePinTests";
const TOOLS: ToolKey[] = ["scanRepo", "deathReport", "usageSurface", "findReplacement", "generatePinTests"];

const deepArray = (n: number): unknown => {
  let v: unknown = [];
  for (let i = 0; i < n; i++) v = [v];
  return v;
};

const keyArb = fc.oneof(
  fc.constantFrom("repo", "ref", "package", "path", "candidate", "runs", "out", "__proto__", "constructor", "toString"),
  fc.string({ maxLength: 8 }),
);
const valueArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue({ maxDepth: 3 }),
  fc.string(),
  fc.integer(),
  fc.constant(undefined),
  fc.constant("a".repeat(5000)),
  fc.constant("ok\0nul"),
  fc.constant(deepArray(500)),
  fc.constantFrom("octo/cat", "./proj", "/", "../..", "jest", "left-pad", "intersect", "cand.js", "proofs/x/y.json"),
);
const hostileArgs: fc.Arbitrary<unknown> = fc.oneof(fc.dictionary(keyArb, valueArb, { maxKeys: 6 }), valueArb);

const VALID: Record<ToolKey, Array<Record<string, unknown>>> = {
  scanRepo: [{ repo: "octo/cat" }, { repo: "./proj" }, { repo: "jest" }],
  deathReport: [
    { repo: "octo/cat", package: "left-pad" },
    { repo: "./proj", package: "left-pad" },
  ],
  usageSurface: [{ path: "./proj", package: "left-pad" }],
  findReplacement: [{ package: "left-pad" }],
  generatePinTests: [{ path: "./proj", package: "intersect", candidate: "cand.js" }],
};

type Behavior = "throw" | "reject" | "undefined" | "malformed" | "hang";
type Point = "github" | "local" | "localPipeline" | "e18e" | "usageSurface" | "loadCandidate" | "probe" | "demoStore";
const POINTS: Point[] = ["github", "local", "localPipeline", "e18e", "usageSurface", "loadCandidate", "probe", "demoStore"];
const PIPELINE_POINTS: Point[] = ["github", "localPipeline"];

const PAIRS: Array<[ToolKey, Point]> = [
  ["scanRepo", "github"],
  ["scanRepo", "localPipeline"],
  ["deathReport", "github"],
  ["usageSurface", "usageSurface"],
  ["findReplacement", "e18e"],
  ["generatePinTests", "usageSurface"],
  ["generatePinTests", "loadCandidate"],
  ["usageSurface", "probe"],
];

/** Valid arguments with the misbehaving Dep exactly where the tool calls it (the random pairs rarely line up). */
const targetedArb = fc
  .record({
    pair: fc.constantFrom(...PAIRS),
    pick: fc.nat({ max: 5 }),
    behavior: fc.constantFrom<Behavior>("throw", "reject", "undefined", "malformed", "hang"),
  })
  .map(({ pair, pick, behavior }): Scenario => ({ tool: pair[0], valid: true, pick, args: undefined, point: pair[1], behavior }));

const randomArb: fc.Arbitrary<Scenario> = fc.record({
  tool: fc.constantFrom(...TOOLS),
  valid: fc.boolean(),
  pick: fc.nat({ max: 5 }),
  args: hostileArgs,
  point: fc.constantFrom(...POINTS),
  behavior: fc.constantFrom<Behavior>("throw", "reject", "undefined", "malformed", "hang"),
});
const scenarioArb = fc.oneof(targetedArb, randomArb);
export type Scenario = {
  tool: ToolKey;
  valid: boolean;
  pick: number;
  args: unknown;
  point: Point;
  behavior: Behavior;
};

const boom = (): Error => new Error(`${SECRET} at /home/secret/file.ts:1:2\n    at fn (/home/secret/x.js:3:4)`);

/** A function misbehaving as `behavior` says (hang only for the pipelines, which have a watchdog). */
function misbehave(behavior: Behavior, boom: () => Error): (...a: never[]) => unknown {
  switch (behavior) {
    case "throw":
      return () => {
        throw boom();
      };
    case "reject":
      return () => Promise.reject(boom());
    case "undefined":
      return () => undefined;
    case "malformed":
      return () => ({ ok: true, report: {}, value: 7, kind: "dir" });
    case "hang":
      return () => new Promise(() => {});
  }
}

function depsFor(s: Scenario): { deps: ExorcistDeps; hung: boolean; reached: () => boolean } {
  const behavior: Behavior = s.behavior === "hang" && !PIPELINE_POINTS.includes(s.point) ? "throw" : s.behavior;
  const hung = behavior === "hang";
  let reached = false;
  const bad = (): ((...a: never[]) => unknown) => {
    // A candidate that fails to load is an expected failure: the harness reports its message (the user's own file) as proof_failed.
    const f = misbehave(behavior, s.point === "loadCandidate" ? () => new Error("candidate failed to load") : boom);
    return (...a) => {
      reached = true;
      return f(...a);
    };
  };
  const base = makeDeps({ probe: memoryProbe({ "/work/proj/a.js": "", "/work/cand.js": "" }) });
  const deps: ExorcistDeps = {
    ...base,
    scan: {
      ...base.scan,
      watchdog: () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return {
          fired: new Promise<void>((resolve) => {
            if (hung) timer = setTimeout(resolve, 1);
          }),
          dispose: () => clearTimeout(timer),
        };
      },
    },
    proof: { ...base.proof },
  };
  switch (s.point) {
    case "github":
      deps.scan.github = bad() as unknown as ScanPipeline;
      break;
    case "local":
      {
        // `local` is a factory, not a promise-returning function: a rejected promise it returns is never awaited
        // by anyone, so mark it handled here (the pipeline-level rejection is covered by "localPipeline").
        const f = bad();
        deps.scan.local = ((...a: never[]) => {
          const r = f(...a);
          if (r instanceof Promise) r.catch(() => undefined);
          return r;
        }) as never;
      }
      break;
    case "localPipeline":
      deps.scan.local = (() => (bad() as unknown as ScanPipeline)) as never;
      break;
    case "e18e":
      deps.e18e = bad() as never;
      break;
    case "usageSurface":
      deps.usageSurface = bad() as never;
      break;
    case "loadCandidate":
      deps.proof.loadCandidate = bad() as never;
      break;
    case "probe": {
      const b = bad();
      deps.probe = { stat: b as never, readText: b as never };
      break;
    }
    case "demoStore":
      deps.demoStore = bad() as never;
      break;
  }
  return { deps, hung, reached: () => reached };
}

/** Result of the call, or a failure message when it threw, rejected or did not settle in time. */
async function settle(p: Promise<CallToolResult>): Promise<{ ok: true; r: CallToolResult } | { ok: false; why: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; why: string }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, why: "the call did not settle (hung)" }), SETTLE_MS);
  });
  try {
    return await Promise.race([p.then((r) => ({ ok: true as const, r })), timeout]);
  } catch (e) {
    return { ok: false, why: `the call threw: ${String((e as Error)?.message).slice(0, 60)}` };
  } finally {
    clearTimeout(timer);
  }
}

function checkShape(r: CallToolResult): { error?: { code: string; message: string } } {
  if (typeof r !== "object" || r === null || !Array.isArray(r.content) || r.content.length < 1) fail("result is not a Tool_Result");
  for (const c of r.content) {
    if (c.type !== "text" || typeof (c as { text?: unknown }).text !== "string") fail("item is not a text item");
    const t = (c as { text: string }).text;
    if (t.includes(SECRET)) fail("the thrown message reached the result");
    if (/(^|\n)\s*at\s/.test(t)) fail("a stack frame reached the result");
  }
  if (r.isError !== true) return {};
  if (r.content.length !== 1) fail("error result must have one item");
  const j = JSON.parse((r.content[0] as { text: string }).text) as { error?: { code?: unknown; message?: unknown } };
  const { code, message } = j.error ?? {};
  if (typeof code !== "string" || !(ERROR_CODES as readonly string[]).includes(code)) fail(`unknown code ${String(code)}`);
  if (typeof message !== "string" || message === "") fail("empty error message");
  if (code === "internal_error" && message !== UNEXPECTED_MESSAGE) fail(`internal_error message is "${message}"`);
  return { error: { code: code as string, message: message as string } };
}

/** The Tool_Error code a (tool, point, behavior) combination must give when the Dep is reached with valid arguments, if one is fixed. */
function expectedCode(s: Scenario, reached: boolean, hung: boolean, args: Record<string, unknown>): string | undefined {
  if (!s.valid || !reached) return undefined;
  const githubArgs = typeof args["repo"] === "string" && args["repo"] === "octo/cat";
  const viaGithub = (s.tool === "scanRepo" || s.tool === "deathReport") && githubArgs && s.point === "github";
  const viaFind = s.tool === "findReplacement" && s.point === "e18e";
  const viaUsage = s.tool === "usageSurface" && s.point === "usageSurface";
  if (!(viaGithub || viaFind || viaUsage)) return undefined;
  if (hung) return viaGithub ? "scan_failed" : undefined;
  if (s.behavior === "throw" || s.behavior === "reject" || s.behavior === "undefined") return "internal_error";
  return undefined;
}

export function build(impl: TotalTools) {
  return fc.asyncProperty(scenarioArb, async (s: Scenario) => {
    const { deps, hung, reached } = depsFor(s);
    const args = s.valid ? VALID[s.tool][s.pick % VALID[s.tool].length]! : s.args;
    const call = impl.safely(() => impl.tools[s.tool](deps, args as never));
    const res = await settle(call);
    if (!res.ok) return fail(res.why);
    const shape = checkShape(res.r);
    const want = expectedCode(s, reached(), hung, args as Record<string, unknown>);
    if (want !== undefined && shape.error?.code !== want) fail(`expected ${want}, got ${shape.error?.code ?? "a success"}`);
    return true;
  });
}

export const property4: NamedAsyncProperty<TotalTools> = { name, build };

describe(name, () => {
  it("holds for the real tools", async () => {
    await assertPropertyAsync(name, build(REAL_TOTAL));
  });

  it("every sabotage is caught", async () => {
    await expect(assertAllSabotagesCaughtAsync(name, [property4], KIRO_P4_SABOTAGES)).resolves.toBeUndefined();
  });
});
