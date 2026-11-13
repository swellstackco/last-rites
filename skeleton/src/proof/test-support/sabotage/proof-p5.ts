// Sabotage_List for Property 5 (determinism). Each entry is a deliberately non-deterministic report writer.
import { FIXED_SEED } from "../../../death-score/fc-runner.js";
import { REAL_REPORT_IMPL, attemptOf, headerOf, type RenderInput, type ReportImpl } from "../../runner/report-determinism.p5.test.js";
import { runProof } from "../../runner/run-proof.js";
import { appendAttempt, serializeProofReport } from "../../report.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P5_REQUIRED = [
  "current time in the report",
  "Math.random in an error message",
  "fresh random seed when none is given",
  "process.cwd in the candidate name",
  "coverage key order from a shuffled insertion",
] as const;

function render(
  input: RenderInput,
  opts: { name?: string; seed?: number; message?: (m: string) => string } = {},
): string {
  const result = runProof({ ...input, seed: opts.seed ?? input.seed ?? FIXED_SEED });
  const attempt = attemptOf(result, opts.name ?? "candidate.js");
  if (attempt.error && opts.message) attempt.error = { ...attempt.error, message: opts.message(attempt.error.message) };
  return serializeProofReport(appendAttempt(headerOf(input), attempt));
}

const cwd = (): string => (globalThis as { process?: { cwd?: () => string } }).process?.cwd?.() ?? "/";

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const P5_SABOTAGES: readonly Sabotage<ReportImpl>[] = [
  {
    name: "current time in the report",
    impl: (input) => render(input, { name: `candidate-${Date.now()}.js` }),
  },
  {
    name: "Math.random in an error message",
    impl: (input) => render(input, { message: (m) => `${m} (${Math.random()})` }),
  },
  {
    name: "fresh random seed when none is given",
    impl: (input) => render(input, { seed: input.seed ?? Math.floor(Math.random() * 0x7fffffff) }),
  },
  {
    name: "process.cwd in the candidate name",
    impl: (input) => render(input, { name: `${cwd()}/candidate.js` }),
  },
  {
    name: "coverage key order from a shuffled insertion",
    impl: (input) => {
      const doc = JSON.parse(REAL_REPORT_IMPL(input)) as { attempts: { shapes: { coverage: Record<string, number> }[] }[] };
      for (const a of doc.attempts) {
        for (const s of a.shapes) {
          const out: Record<string, number> = {};
          for (const k of shuffled(Object.keys(s.coverage))) out[k] = s.coverage[k]!;
          s.coverage = out;
        }
      }
      return JSON.stringify(doc, null, 2) + "\n";
    },
  },
];
