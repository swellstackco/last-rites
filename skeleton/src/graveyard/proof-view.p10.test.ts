// Feature: proof-harness, Property 10: Proof_View faithfulness
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { proofReportArb } from "../proof/test-support/arbitraries/report.js";
import type { ProofAttempt, ProofReport } from "../proof/types.js";
import { buildProofView, type ProofBadge, type ProofView } from "./proof-view.js";

export type BuildProofViewFn = (report: ProofReport) => ProofView;

export const REAL_BUILD_PROOF_VIEW: BuildProofViewFn = buildProofView;

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

const LABELS: Record<ProofBadge, string> = {
  proved: "Proved",
  weak: "Weak",
  counterexample: "Counterexample",
  no_call_sites: "No call sites",
  error: "Proof error",
};

function expectedBadge(a: ProofAttempt): ProofBadge {
  if (a.status === "proved") return a.weak ? "weak" : "proved";
  if (a.status === "no-call-sites") return "no_call_sites";
  return a.status;
}

const expectedSabotage = (a: ProofAttempt): string =>
  a.status === "proved" ? `Sabotage: ${a.sabotage.caught} of ${a.sabotage.applied} broken migrations caught` : "Sabotage: not run";

function same(actual: unknown, expected: unknown, label: string): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function build(impl: BuildProofViewFn = REAL_BUILD_PROOF_VIEW) {
  // `copies` repeats the call sites so that reports with more than 50 appear too.
  return fc.property(proofReportArb, fc.integer({ min: 1, max: 12 }), (base, copies) => {
    const report: ProofReport = { ...base, callSites: Array.from({ length: copies }, () => base.callSites).flat() };
    const snapshot = JSON.stringify(report);
    deepFreeze(report);
    const view = impl(report);
    same(JSON.stringify(report), snapshot, "input report modified");

    const last = report.attempts[report.attempts.length - 1]!;
    const badge = expectedBadge(last);
    same(view.badge, badge, "badge");
    same(view.badgeLabel, LABELS[badge], "badgeLabel");
    same(view.runsText, `${last.runs} runs`, "runsText");
    same(view.seedText, `seed ${last.seed}`, "seedText");
    same(view.sabotageLine, expectedSabotage(last), "sabotageLine");

    same(view.attempts.length, report.attempts.length, "attempts length");
    report.attempts.forEach((a, i) => {
      const v = view.attempts[i]!;
      const b = expectedBadge(a);
      same(v.attempt, a.attempt, `attempts[${i}].attempt`);
      same(v.badge, b, `attempts[${i}].badge`);
      same(v.badgeLabel, LABELS[b], `attempts[${i}].badgeLabel`);
      same(v.sabotageLine, expectedSabotage(a), `attempts[${i}].sabotageLine`);
      same(v.candidateName, a.candidate?.name, `attempts[${i}].candidateName`);
      const c = a.counterexample;
      same(
        v.counterexample,
        c && {
          shape: c.shape,
          input: c.input,
          oldOutput: c.oldOutput,
          newOutput: c.newOutput,
          oldProjected: c.oldProjected,
          newProjected: c.newProjected,
        },
        `attempts[${i}].counterexample`,
      );
    });

    const n = report.callSites.length;
    same(view.callSiteTotal, n, "callSiteTotal");
    same(view.moreCount, Math.max(0, n - 50), "moreCount");
    same(
      view.callSites,
      report.callSites.slice(0, 50).map((c) => ({ label: `${c.file}:${c.line}`, enclosing: c.enclosing })),
      "callSites",
    );

    const rec = last.recommendation;
    same(
      view.recommendation,
      rec === undefined
        ? undefined
        : rec === "remove-dependency"
          ? "Remove the dependency: no source file imports or requires it."
          : "Review the imports: the package is imported but never called directly.",
      "recommendation",
    );
  });
}

describe("Property 10: Proof_View faithfulness", () => {
  it("the view reflects the report exactly and does not modify it", () => {
    assertProperty("Property 10: Proof_View faithfulness", build(REAL_BUILD_PROOF_VIEW));
  });
});
