import type { ProofAttempt, ProofReport } from "@last-rites/skeleton/proof";
import { buildContractAttempt, buildErrorAttempt, buildPinAttempt, buildProofReport, callSitesOf } from "../../proof/attempt.js";
import { actionProofName, repoProofName } from "../../proof/names.js";
import type { AttemptImpl } from "../properties/actions-p12.js";
import type { Sabotage } from "../sabotage-runner.js";

const real: AttemptImpl = { buildPinAttempt, buildContractAttempt, buildErrorAttempt, buildProofReport, actionProofName, repoProofName };

type Attempt = Omit<ProofAttempt, "attempt">;

/** Applies `f` to every attempt the builders return. */
function mapAttempts(f: (a: Attempt) => Attempt): Partial<AttemptImpl> {
  return {
    buildPinAttempt: (i) => f(buildPinAttempt(i)),
    buildContractAttempt: (i) => f(buildContractAttempt(i)),
    buildErrorAttempt: (s, m) => f(buildErrorAttempt(s, m)),
  };
}

const withReport = (f: (r: ProofReport) => ProofReport): AttemptImpl["buildProofReport"] => (...args) => f(buildProofReport(...args));

export const sabotages: Sabotage<AttemptImpl>[] = [
  {
    name: "(a) compute weak from survivors only",
    impl: { ...real, ...mapAttempts((a) => ({ ...a, weak: a.status === "proved" && a.sabotage.survivors.length > 0 })) },
  },
  {
    name: "(b) report applied different from caught + survivors",
    impl: { ...real, ...mapAttempts((a) => (a.status === "proved" ? { ...a, sabotage: { ...a.sabotage, applied: a.sabotage.applied + 1 } } : a)) },
  },
  { name: "(c) drop the hash suffix from the proof name", impl: { ...real, actionProofName: (n) => actionProofName(n).replace(/-[0-9a-f]{8}$/, "") } },
  { name: "(d) let a name exceed 64 characters", impl: { ...real, actionProofName: (n) => actionProofName(n) + "-".padEnd(70, "z") } },
  { name: "(e) keep upper case in the name", impl: { ...real, actionProofName: (n) => actionProofName(n).toUpperCase() } },
  {
    name: "(f) fill sabotage numbers for a counterexample attempt",
    impl: {
      ...real,
      ...mapAttempts((a) => (a.status === "counterexample" ? { ...a, sabotage: { applied: 1, caught: 1, survivors: [] } } : a)),
    },
  },
  { name: "(g) leave callSites empty for a proved attempt", impl: { ...real, buildProofReport: withReport((r) => ({ ...r, callSites: [] })) } },
  {
    name: "(h) do not cut argTexts",
    impl: {
      ...real,
      buildProofReport: withReport((r) => ({
        ...r,
        callSites: callSitesOf([]).concat(r.callSites.map((s) => ({ ...s, argTexts: s.argTexts.map((t) => t + "y".repeat(300)) }))),
      })),
    },
  },
];
