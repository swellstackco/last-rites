// Sabotage_List for Property 10 (Proof_View faithfulness). Each entry is a deliberately wrong view builder
// written as a small wrapper over the real one.
import { buildProofView } from "../../proof-view.js";
import type { AttemptView, ProofView } from "../../proof-view.js";
import type { BuildProofViewFn } from "../../proof-view.p10.test.js";
import type { ProofReport } from "../../../proof/types.js";
import type { Sabotage } from "../sabotage-runner.js";

export const P10_REQUIRED = [
  "shows proved for a weak attempt",
  "headline from the first attempt",
  "survivors counted as caught",
  "call sites sorted",
  "HTML-escaped strings",
  "trimmed counterexample input",
  "ignores the call site cap",
  "mutates the input report",
] as const;

const withCounterexample = (v: ProofView, f: (c: NonNullable<AttemptView["counterexample"]>) => NonNullable<AttemptView["counterexample"]>): ProofView => ({
  ...v,
  attempts: v.attempts.map((a) => (a.counterexample ? { ...a, counterexample: f(a.counterexample) } : a)),
});

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const P10_SABOTAGES: readonly Sabotage<BuildProofViewFn>[] = [
  {
    name: "shows proved for a weak attempt",
    impl: (r) => {
      const v = buildProofView(r);
      return v.badge === "weak" ? { ...v, badge: "proved", badgeLabel: "Proved" } : v;
    },
  },
  {
    name: "headline from the first attempt",
    impl: (r) => {
      const first = buildProofView({ ...r, attempts: r.attempts.slice(0, 1) });
      return { ...buildProofView(r), badge: first.badge, badgeLabel: first.badgeLabel, runsText: first.runsText, seedText: first.seedText, sabotageLine: first.sabotageLine };
    },
  },
  {
    name: "survivors counted as caught",
    impl: (r) => {
      const v = buildProofView(r);
      const fix = (line: string, applied: number): string =>
        line.startsWith("Sabotage: ") && !line.endsWith("not run") ? `Sabotage: ${applied} of ${applied} broken migrations caught` : line;
      const last = r.attempts[r.attempts.length - 1]!;
      return {
        ...v,
        sabotageLine: fix(v.sabotageLine, last.sabotage.applied),
        attempts: v.attempts.map((a, i) => ({ ...a, sabotageLine: fix(a.sabotageLine, r.attempts[i]!.sabotage.applied) })),
      };
    },
  },
  {
    name: "call sites sorted",
    impl: (r) => {
      const v = buildProofView(r);
      return { ...v, callSites: [...v.callSites].sort((a, b) => (a.label < b.label ? 1 : a.label > b.label ? -1 : 0)) };
    },
  },
  {
    name: "HTML-escaped strings",
    impl: (r) =>
      withCounterexample(buildProofView(r), (c) => ({
        ...c,
        input: escapeHtml(c.input),
        oldOutput: escapeHtml(c.oldOutput),
        newOutput: escapeHtml(c.newOutput),
      })),
  },
  {
    name: "trimmed counterexample input",
    impl: (r) => withCounterexample(buildProofView(r), (c) => ({ ...c, input: c.input.trim().slice(0, 40) })),
  },
  {
    name: "ignores the call site cap",
    impl: (r) => {
      const v = buildProofView(r);
      return {
        ...v,
        callSites: r.callSites.map((c) => ({ label: `${c.file}:${c.line}`, enclosing: c.enclosing })),
        moreCount: 0,
      };
    },
  },
  {
    name: "mutates the input report",
    impl: (r) => {
      const v = buildProofView(r);
      // Frozen input: the write throws in strict mode, which the property reports as a failure.
      (r as ProofReport & { callSites: unknown[] }).callSites.reverse();
      return v;
    },
  },
];
