// FROZEN, test-only, never import from production code or main.ts.
// Byte copy of skeleton/src/graveyard/proof-view.ts as it was at fe6340b (2026-11-14, before graveyard-ui-actions); imports adjusted to ../../.
// Used only by the graveyard-ui-actions preservation properties (Properties 3 and 7) as the Reference_Views.
// Requirement 12: the pure view model of a Proof_Report. No markup, no DOM, no I/O; the input is never modified.
import type { ProofAttempt, ProofReport, Recommendation } from "../../proof/types.js";

export type ProofBadge = "proved" | "weak" | "counterexample" | "no_call_sites" | "error";

export interface AttemptView {
  attempt: number;
  badge: ProofBadge;
  badgeLabel: string;
  candidateName?: string;
  runsText: string;
  seedText: string;
  sabotageLine: string;
  counterexample?: {
    shape: string;
    input: string;
    oldOutput: string;
    newOutput: string;
    oldProjected: string;
    newProjected: string;
  };
  errorText?: string;
}

export interface ProofView {
  badge: ProofBadge;
  badgeLabel: string;
  runsText: string;
  seedText: string;
  sabotageLine: string;
  callSites: Array<{ label: string; enclosing: "src" | "test" }>;
  callSiteTotal: number;
  moreCount: number;
  attempts: AttemptView[];
  recommendation?: string;
}

export const MAX_CALL_SITES_SHOWN = 50;

export const BADGE_LABELS: Readonly<Record<ProofBadge, string>> = {
  proved: "Proved",
  weak: "Weak",
  counterexample: "Counterexample",
  no_call_sites: "No call sites",
  error: "Proof error",
};

export const RECOMMENDATION_TEXT: Readonly<Record<Recommendation, string>> = {
  "remove-dependency": "Remove the dependency: no source file imports or requires it.",
  "review-imports": "Review the imports: the package is imported but never called directly.",
};

const NOT_RUN = "Sabotage: not run";

function badgeOf(a: ProofAttempt): ProofBadge {
  switch (a.status) {
    case "proved":
      return a.weak ? "weak" : "proved";
    case "counterexample":
      return "counterexample";
    case "no-call-sites":
      return "no_call_sites";
    case "error":
      return "error";
  }
}

const sabotageLineOf = (a: ProofAttempt): string =>
  a.status === "proved" ? `Sabotage: ${a.sabotage.caught} of ${a.sabotage.applied} broken migrations caught` : NOT_RUN;

function attemptView(a: ProofAttempt): AttemptView {
  const badge = badgeOf(a);
  const v: AttemptView = {
    attempt: a.attempt,
    badge,
    badgeLabel: BADGE_LABELS[badge],
    runsText: `${a.runs} runs`,
    seedText: `seed ${a.seed}`,
    sabotageLine: sabotageLineOf(a),
  };
  if (a.candidate) v.candidateName = a.candidate.name;
  if (a.counterexample) {
    const c = a.counterexample;
    v.counterexample = {
      shape: c.shape,
      input: c.input,
      oldOutput: c.oldOutput,
      newOutput: c.newOutput,
      oldProjected: c.oldProjected,
      newProjected: c.newProjected,
    };
  }
  if (a.error) v.errorText = `${a.error.code}: ${a.error.message}`;
  return v;
}

/** Total for any valid report (a report without attempts is shown as a proof error). */
export function buildProofView(report: ProofReport): ProofView {
  const attempts = report.attempts.map(attemptView);
  const last = report.attempts[report.attempts.length - 1];
  const lastView = attempts[attempts.length - 1];
  const badge: ProofBadge = last ? badgeOf(last) : "error";
  const view: ProofView = {
    badge,
    badgeLabel: BADGE_LABELS[badge],
    runsText: lastView?.runsText ?? "0 runs",
    seedText: lastView?.seedText ?? "seed 0",
    sabotageLine: lastView?.sabotageLine ?? NOT_RUN,
    callSites: report.callSites
      .slice(0, MAX_CALL_SITES_SHOWN)
      .map((c) => ({ label: `${c.file}:${c.line}`, enclosing: c.enclosing })),
    callSiteTotal: report.callSites.length,
    moreCount: Math.max(0, report.callSites.length - MAX_CALL_SITES_SHOWN),
    attempts,
  };
  if (last?.recommendation) view.recommendation = RECOMMENDATION_TEXT[last.recommendation];
  return view;
}
