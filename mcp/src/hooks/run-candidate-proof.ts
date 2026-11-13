import { resolve } from "node:path";
import { parseProofReport } from "@graveyard-kit/skeleton/proof";
import type { ExorcistDeps } from "../deps.js";
import { generatePinTestsImpl } from "../tools/generate-pin-tests.js";
import { candidateTarget } from "./candidate-target.js";
import type { RunnerResult } from "./run-types.js";

export const CANDIDATE_RUNS = 200;

export interface CandidateProofDeps {
  tools: ExorcistDeps;
  /** Repository root. */
  root: string;
  /** Name of the directory next to the repository root that holds the target checkouts (set by the entry file). */
  siblingDir: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The saved path from the Hook JSON: the first string among `file_path`, `filePath`, `path`, `tool_input.path`. */
export function extractSavedPath(stdinText: string): string | undefined {
  let v: unknown;
  try {
    v = JSON.parse(stdinText);
  } catch {
    return undefined;
  }
  if (!isObject(v)) return undefined;
  const candidates: unknown[] = [v["file_path"], v["filePath"], v["path"], isObject(v["tool_input"]) ? v["tool_input"]["path"] : undefined];
  return candidates.find((c): c is string => typeof c === "string");
}

/** Re-runs the proof for a saved candidate file with no `out`; never throws. */
export async function runCandidateProof(deps: CandidateProofDeps, stdinText: string): Promise<RunnerResult> {
  try {
    const saved = extractSavedPath(stdinText);
    if (saved === undefined) return { lines: ["skipped: no saved path in the hook input"], outcome: "skipped" };
    const target = candidateTarget(saved);
    if (target === undefined) return { lines: [`skipped: not a candidate file: ${saved}`], outcome: "skipped" };

    const checkout = resolve(deps.root, "..", deps.siblingDir, target.repo);
    const stat = await deps.tools.probe.stat(checkout);
    if (stat === undefined || stat.kind !== "dir") return { lines: [`skipped: no checkout at ${checkout}`], outcome: "skipped" };

    const result = await generatePinTestsImpl(deps.tools, {
      path: checkout,
      package: target.package,
      candidate: resolve(deps.root, saved),
      runs: CANDIDATE_RUNS,
    });
    const first = result.content[0];
    const text = first !== undefined && first.type === "text" ? first.text : "";
    if (result.isError) {
      let code = "proof_failed";
      let message = "";
      try {
        const e = (JSON.parse(text) as { error?: { code?: unknown; message?: unknown } }).error;
        if (typeof e?.code === "string") code = e.code;
        if (typeof e?.message === "string") message = e.message;
      } catch {
        /* keep defaults */
      }
      return { lines: [`${target.package}: ${code}${message === "" ? "" : `: ${message}`}`], outcome: "fail" };
    }
    const parsed = parseProofReport(text);
    const attempt = parsed.ok ? parsed.report.attempts.at(-1) : undefined;
    if (attempt === undefined) return { lines: [`${target.package}: proof report unreadable`], outcome: "fail" };
    const lines = [
      `${target.package}: attempt ${attempt.attempt}, ${attempt.status}${attempt.weak ? " (weak)" : ""}, ${attempt.runs} runs, seed ${attempt.seed}`,
    ];
    if (attempt.counterexample !== undefined) lines.push(`shrunk input: ${attempt.counterexample.input}`);
    const outcome = attempt.status === "error" ? "fail" : attempt.status === "counterexample" ? "warn" : "ok";
    return { lines, outcome };
  } catch {
    return { lines: ["candidate-proof: unexpected error"], outcome: "fail" };
  }
}
