// runProof: the gates of Requirement 7.10, the differential runs, and the Sabotage_Check for `proved`.
// Synchronous, deterministic, never throws, never returns a stack trace.
import type { CallSite, ProofErrorCode, ShapeResult } from "../types.js";
import { runShape, type ResolvedMember, type ShapeRun } from "./differential.js";
import { BUILT_IN_MUTATORS } from "./mutators.js";
import { resolveMember } from "./outcome.js";
import { runSabotage } from "./sabotage.js";
import type { CallShape, ProofInput, ProofResult } from "./types.js";

const NO_SABOTAGE = (): ProofResult["sabotage"] => ({ applied: 0, caught: 0, survivors: [] });

function base(input: ProofInput): ProofResult {
  return {
    status: "error",
    weak: false,
    runs: 0,
    numRuns: input.numRuns,
    seed: input.seed,
    shapes: [],
    callSites: input.usage.callSites,
    importSites: input.usage.importSites,
    sabotage: NO_SABOTAGE(),
  };
}

function fail(input: ProofInput, code: ProofErrorCode, message: string, shapes: ShapeResult[] = []): ProofResult {
  return { ...base(input), shapes, error: { code, message } };
}

/** Up to five `file:line` entries, for messages. */
function where(sites: readonly CallSite[]): string {
  return sites
    .slice(0, 5)
    .map((s) => `${s.file}:${s.line}`)
    .join(", ");
}

export function runProof(input: ProofInput): ProofResult {
  try {
    return run(input);
  } catch {
    // Anything unexpected (hostile recipe, malformed input) becomes a generic recipe failure.
    return unexpected(input);
  }
}

function unexpected(input: ProofInput): ProofResult {
  const usage = (input as { usage?: { callSites?: CallSite[]; importSites?: ProofResult["importSites"] } }).usage;
  return {
    status: "error",
    weak: false,
    runs: 0,
    numRuns: input?.numRuns,
    seed: input?.seed,
    shapes: [],
    callSites: Array.isArray(usage?.callSites) ? usage.callSites : [],
    importSites: Array.isArray(usage?.importSites) ? usage.importSites : [],
    error: { code: "recipe_failure", message: "the proof run failed unexpectedly" },
    sabotage: NO_SABOTAGE(),
  };
}

function run(input: ProofInput): ProofResult {
  const { usage, recipe } = input;

  if (!Number.isInteger(input.numRuns) || input.numRuns < 100) {
    return fail(input, "invalid_runs", `numRuns must be an integer of at least 100, got ${String(input.numRuns)}`);
  }
  if (usage.filesScanned === 0) {
    return fail(input, "no_source_files", `${input.package}: no source files were scanned`);
  }
  if (usage.callSites.length === 0) {
    return {
      ...base(input),
      status: "no-call-sites",
      recommendation: usage.importSites.length === 0 ? "remove-dependency" : "review-imports",
    };
  }
  if (recipe === undefined) {
    return fail(input, "no_recipe", `${input.package}: no recipe for this package`);
  }
  if (recipe.expectedVersion !== undefined && input.oracleVersion !== recipe.expectedVersion) {
    return fail(
      input,
      "oracle_version_mismatch",
      `${input.package}: expected oracle version ${recipe.expectedVersion}, found ${input.oracleVersion ?? "none"}`,
    );
  }

  // Each call site goes to the shapes that accept it; a site no shape accepts is an error.
  const accepted = new Map<CallShape, CallSite[]>();
  const unaccepted: CallSite[] = [];
  for (const shape of recipe.shapes) accepted.set(shape, []);
  for (const site of usage.callSites) {
    let any = false;
    for (const shape of recipe.shapes) {
      if (shape.accepts(site)) {
        accepted.get(shape)!.push(site);
        any = true;
      }
    }
    if (!any) unaccepted.push(site);
  }
  if (unaccepted.length > 0) {
    return fail(
      input,
      "unsupported_call_shapes",
      `${input.package}: ${unaccepted.length} call site(s) match no call shape: ${where(unaccepted)}`,
    );
  }

  const ran = recipe.shapes.filter((s) => accepted.get(s)!.length > 0);
  const sides = new Map<CallShape, { oracle: ResolvedMember; candidate: ResolvedMember }>();
  const oracles = new Map<CallShape, ResolvedMember>();
  for (const shape of ran) {
    const o = resolveMember(input.oracle, shape.member);
    if (!o) return fail(input, "oracle_missing_member", `${input.package}: the oracle has no function for ${shape.id}`);
    oracles.set(shape, o);
  }
  for (const shape of ran) {
    const c = resolveMember(input.candidate, shape.member);
    if (!c) return fail(input, "candidate_missing_member", `${input.package}: the candidate has no function for ${shape.id}`);
    sides.set(shape, { oracle: oracles.get(shape)!, candidate: c });
  }

  const cfg = { numRuns: input.numRuns, seed: input.seed };
  const runs = new Map<CallShape, ShapeRun>();
  for (const shape of ran) {
    const s = sides.get(shape)!;
    runs.set(shape, runShape(shape, s.oracle, s.candidate, cfg));
  }

  const shapes: ShapeResult[] = recipe.shapes.map((shape) => {
    const r = runs.get(shape);
    if (!r) return { id: shape.id, status: "skipped", runs: 0, coverage: {} };
    return { id: shape.id, status: r.status === "failed" ? "failed" : r.status, runs: r.runs, coverage: r.coverage };
  });
  const total = [...runs.values()].reduce((n, r) => n + r.runs, 0);
  const result: ProofResult = { ...base(input), shapes, runs: total };

  // Errors found while running, in shape order.
  for (const shape of ran) {
    const r = runs.get(shape)!;
    if (r.status === "error" && r.error) return { ...result, error: r.error };
  }
  // The first failing shape in recipe order supplies the counterexample.
  for (const shape of ran) {
    const r = runs.get(shape)!;
    if (r.status === "failed" && r.counterexample) {
      const c = r.counterexample;
      return {
        ...result,
        status: "counterexample",
        counterexample: { shape: shape.id, args: c.args, input: c.input, shrinks: c.shrinks, path: c.path },
        oldOutput: c.oldOutput,
        newOutput: c.newOutput,
        oldProjected: c.oldProjected,
        newProjected: c.newProjected,
      };
    }
  }
  // A required label that no run produced.
  const missing: string[] = [];
  for (const shape of ran) {
    const r = runs.get(shape)!;
    const absent = shape.requiredLabels.filter((l) => !((r.coverage[l] ?? 0) > 0));
    if (absent.length > 0) missing.push(`${shape.id}: ${absent.join(", ")}`);
  }
  if (missing.length > 0) {
    return {
      ...result,
      error: { code: "insufficient_coverage", message: `${input.package}: labels never produced: ${missing.join("; ")}` },
    };
  }

  // proved: show that the proof can fail.
  const sabotage = runSabotage(ran, (shape) => sides.get(shape)!, cfg, input.mutators ?? BUILT_IN_MUTATORS);
  return {
    ...result,
    status: "proved",
    weak: sabotage.applied === 0 || sabotage.survivors.length > 0,
    sabotage,
  };
}
