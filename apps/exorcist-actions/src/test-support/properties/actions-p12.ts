import { createHash } from "node:crypto";
import fc from "fast-check";
import { appendAttempt, isProofName, parseProofReport, serializeProofReport } from "@graveyard-kit/skeleton/proof";
import type { ProofAttempt } from "@graveyard-kit/skeleton/proof";
import type { ActionUse } from "../../inventory/types.js";
import { buildContractAttempt, buildErrorAttempt, buildPinAttempt, buildProofReport } from "../../proof/attempt.js";
import { actionProofName, repoProofName } from "../../proof/names.js";
import { actionNamePairArb, attemptCaseArb, labelArb, actionNameArb } from "../arbitraries/attempt.js";
import type { AttemptCase } from "../arbitraries/attempt.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test (Property 12). */
export interface AttemptImpl {
  buildPinAttempt: typeof buildPinAttempt;
  buildContractAttempt: typeof buildContractAttempt;
  buildErrorAttempt: typeof buildErrorAttempt;
  buildProofReport: typeof buildProofReport;
  actionProofName: typeof actionProofName;
  repoProofName: typeof repoProofName;
}
export const realAttemptImpl: AttemptImpl = { buildPinAttempt, buildContractAttempt, buildErrorAttempt, buildProofReport, actionProofName, repoProofName };

const must = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Independent model of the name rule. */
export function modelName(name: string): string {
  const lower = name.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
  return `${slug === "" ? "x" : slug}-${createHash("sha256").update(lower).digest("hex").slice(0, 8)}`;
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const cut = (s: string): string => (s.length > 200 ? s.slice(0, 200) + "…" : s);
const usesString = (u: ActionUse): string => `${u.owner}/${u.repo}${u.path ? `/${u.path}` : ""}@${u.ref}`;

/** Independent model of the call sites of Requirement 14.6. */
export function modelCallSites(uses: readonly ActionUse[]): unknown[] {
  return [...uses]
    .sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column)
    .map((u) => ({
      file: u.file,
      line: u.line,
      column: u.column,
      callee: usesString(u),
      member: "",
      argCount: Object.keys(u.with).length,
      argTexts: u.withKeys.map((k) => cut(collapse(`${k.name}: ${u.with[k.name] ?? ""}`))),
      enclosing: "src",
    }));
}

export function attemptOf(impl: AttemptImpl, c: AttemptCase): Omit<ProofAttempt, "attempt"> {
  if (c.outcome === "error") return impl.buildErrorAttempt(c.kind, c.message);
  return c.kind === "pin"
    ? impl.buildPinAttempt({ actionName: c.actionName, check: c.check, pinned: c.uses, sabotage: c.sabotage, originals: c.originals, rewritten: c.rewritten })
    : impl.buildContractAttempt({ actionName: c.actionName, results: c.results, sabotage: c.sabotage, originals: c.originals, rewritten: c.rewritten });
}

/** Runs one case through the real codec; returns the parse outcome and the text. */
export function roundTrip(impl: AttemptImpl, c: AttemptCase): { text: string; parsed: ReturnType<typeof parseProofReport> } {
  const base = impl.buildProofReport(c.label, c.commit, c.actionName, c.filesRead, c.uses);
  const text = serializeProofReport(appendAttempt(base, attemptOf(impl, c)));
  return { text, parsed: parseProofReport(text) };
}

export const attemptProperties: NamedProperty<AttemptImpl>[] = [
  {
    name: "P12 every outcome is accepted by parseProofReport, is canonical, and has a consistent weak flag and sabotage",
    build: (impl) =>
      fc.property(attemptCaseArb, (c) => {
        const { text, parsed } = roundTrip(impl, c);
        must(parsed.ok, `rejected: ${parsed.ok ? "" : parsed.error.message}`);
        if (!parsed.ok) return;
        must(serializeProofReport(parsed.report) === text, "not canonical");
        const a = parsed.report.attempts[0]!;
        must(a.status === (c.outcome === "proved" ? "proved" : c.outcome), `status ${a.status} for ${c.outcome}`);
        const s = a.sabotage;
        must(s.applied === s.caught + s.survivors.length, "applied != caught + survivors");
        must(a.weak === (a.status === "proved" && (s.applied === 0 || s.survivors.length > 0)), "weak rule");
        if (a.status === "proved") {
          must(JSON.stringify(s) === JSON.stringify(c.sabotage), "sabotage summary changed");
        } else {
          must(s.applied === 0 && s.caught === 0 && s.survivors.length === 0, "sabotage numbers on a non-proved attempt");
        }
        must(a.seed === 0 && a.numRuns === a.runs, "seed or runs");
      }),
  },
  {
    name: "P12 the report names the action by its Action_Proof_Name and the label, and callSites are one per use and never empty",
    build: (impl) =>
      fc.property(attemptCaseArb, (c) => {
        const { parsed } = roundTrip(impl, c);
        must(parsed.ok, "rejected");
        if (!parsed.ok) return;
        const r = parsed.report;
        must(r.package === modelName(c.actionName), `package ${r.package}`);
        must(r.repo === c.label && r.filesScanned === c.filesRead && r.importSites.length === 0, "header fields");
        must(r.callSites.length === c.uses.length && r.callSites.length > 0, "callSites length");
        must(JSON.stringify(r.callSites) === JSON.stringify(modelCallSites(c.uses)), "callSites differ from the model");
      }),
  },
  {
    name: "P12 argTexts are collapsed and cut at 200 code units plus an ellipsis",
    build: (impl) =>
      fc.property(attemptCaseArb, (c) => {
        const base = impl.buildProofReport(c.label, c.commit, c.actionName, c.filesRead, c.uses);
        for (const site of base.callSites) {
          for (const t of site.argTexts) {
            must(t.length <= 201, `argText of ${t.length} code units`);
            must(!/\s\s|\n|\t/.test(t), "whitespace not collapsed");
          }
        }
        must(base.callSites.some((s) => s.argTexts.length > 0) === c.uses.some((u) => u.withKeys.length > 0), "argTexts presence");
      }),
  },
  {
    name: "P12 a counterexample, a candidate and an error carry the fields of the mapping table",
    build: (impl) =>
      fc.property(attemptCaseArb, (c) => {
        const a = attemptOf(impl, c);
        const shape = c.kind;
        if (c.outcome === "error") {
          must(a.status === "error" && a.error?.code === "recipe_failure" && a.error.message === c.message, "error attempt");
          must(a.counterexample === undefined && a.candidate === undefined, "error with extra records");
          return;
        }
        const name = `${c.kind === "pin" ? "pin" : "swap"}-${modelName(c.actionName)}`;
        must(a.candidate?.name === name, `candidate name ${a.candidate?.name}`);
        for (const l of (a.candidate?.source ?? "").split("\n")) must(l === "" || l.startsWith("- ") || l.startsWith("+ "), `source line ${l}`);
        must(a.shapes.length === 1 && a.shapes[0]!.id === shape, "shape id");
        must(a.shapes[0]!.status === (c.outcome === "proved" ? "passed" : "failed"), "shape status");
        must(a.shapes[0]!.runs === a.runs, "shape runs");
        if (c.outcome === "proved") {
          must(a.counterexample === undefined, "counterexample on proved");
          if (c.kind === "pin") {
            must(JSON.stringify(a.shapes[0]!.coverage) === JSON.stringify({ files: new Set(c.uses.map((u) => u.file)).size, uses: c.uses.length }), "pin coverage");
          } else {
            const want: Record<string, number> = { uses: c.results.length };
            for (const r of c.results) {
              if (!r.check.ok) continue;
              for (const [p, list] of [["dropped", r.check.dropped], ["renamed", r.check.renamed], ["required", r.check.required]] as const) {
                for (const n of list) want[`${p}.${n}`] = (want[`${p}.${n}`] ?? 0) + 1;
              }
            }
            must(JSON.stringify(Object.entries(a.shapes[0]!.coverage).sort(([x], [y]) => cmp(x, y))) === JSON.stringify(Object.entries(want).sort(([x], [y]) => cmp(x, y))), "contract coverage");
          }
          return;
        }
        const ce = a.counterexample;
        must(ce !== undefined && ce.shape === shape && ce.shrinks === 0, "counterexample record");
        if (!ce) return;
        if (c.kind === "pin" && !c.check.ok) {
          const v = c.check.violation;
          const use = c.uses.find((u) => u.file === v.file && u.line === v.line);
          must(ce.input === `${v.file}:${v.line} ${use ? `${use.owner}/${use.repo}@${use.ref}` : "-"}`, `input ${ce.input}`);
          must(ce.path === v.kind, "path");
          must(ce.oldProjected === (v.kind === "sha" ? v.resolved : "-") && ce.newProjected === (v.kind === "sha" ? v.written : "-"), "projected");
        } else if (c.kind === "contract") {
          const bad = c.results.find((r) => !r.check.ok);
          must(bad !== undefined && !bad.check.ok, "no failing result");
          if (bad && !bad.check.ok) {
            const v = bad.check.violation;
            must(ce.input === `${bad.use.file}:${bad.use.line} ${v.name}` && ce.path === v.kind, "contract input or path");
            must(ce.oldOutput === "-" && ce.newOutput === "-" && ce.newProjected === "missing", "contract outputs");
          }
        }
      }),
  },
  {
    name: "P12 actionProofName is a Proof_Name of at most 64 characters ending in a hash, equal up to case and different otherwise",
    build: (impl) =>
      fc.property(actionNamePairArb, ([a, b]) => {
        const x = impl.actionProofName(a);
        const y = impl.actionProofName(b);
        must(isProofName(x) && x.length <= 64, `not a Proof_Name: ${x}`);
        must(/-[0-9a-f]{8}$/.test(x), `no hash suffix: ${x}`);
        must(x === modelName(a), `name ${x} != model`);
        must((x === y) === (a.toLowerCase() === b.toLowerCase()), `equality of ${a} and ${b}`);
      }),
  },
  {
    name: "P12 actionProofName is a short Proof_Name for long and odd input",
    build: (impl) =>
      fc.property(fc.oneof(fc.string({ maxLength: 200 }), actionNameArb.map((n) => n.repeat(12))), (n) => {
        const x = impl.actionProofName(n);
        must(isProofName(x) && x.length <= 64 && /-[0-9a-f]{8}$/.test(x), `bad name ${x}`);
        must(x === impl.actionProofName(n), "not deterministic");
      }),
  },
  {
    name: "P12 repoProofName is a Proof_Name ending -actions",
    build: (impl) =>
      fc.property(labelArb, (l) => {
        const x = impl.repoProofName(l);
        must(isProofName(x) && x.endsWith("-actions") && x.length <= 64, `bad name ${x}`);
      }),
  },
];
