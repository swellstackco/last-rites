// Property 2 (toe-tag-redesign): Proof_Report facts are preserved. The Proof section of an open dead package shows
// the same Proof facts as the frozen Reference_Views and as the facts computed through the skeleton's proof view.
import fc from "fast-check";
import { buildProofView } from "@graveyard-kit/skeleton/graveyard";
import { serializeProofReport } from "@graveyard-kit/skeleton/proof";
import type { ProofReport } from "@graveyard-kit/skeleton/proof";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import { COPY } from "../../constants.js";
import { proofReportArb } from "../arbitraries.js";
import { buildReport } from "../build-report.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";
import { DYING_SIGNALS } from "../signals.js";
import { renderReferenceProofFacts } from "../toe-reference.js";
import { toeFacts } from "../toe-facts.js";
import type { AttemptFacts, ProofFacts } from "../toe-facts.js";

export class TT2Failure extends Error {}
const fail = (message: string): never => {
  throw new TT2Failure(message);
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export type ProofCase = { kind: "report"; report: ProofReport } | { kind: "absent" | "failed" | "invalid" };

const known = <T>(value: T) => ({ kind: "known" as const, value });
/** One dead package, named so that its proof path is a valid Proof_Name. */
export const DEAD_REPORT = buildReport([
  { name: "gone", signals: { ...DYING_SIGNALS, deprecated: known(true), repoArchived: known(true) } },
]);

const PLACEHOLDER = "Pin tests against the old package and the new one, and a sabotage check, will appear here.";

/** Proof facts the Proof_Report promises, computed through the skeleton's proof view (no markup). */
export function expectedProofFacts(c: ProofCase): ProofFacts {
  if (c.kind !== "report") {
    return {
      heading: "Proof",
      lines: [COPY.exorcismComing, PLACEHOLDER, ...(c.kind === "invalid" ? [COPY.proofUnreadable] : [])],
      badge: null,
      badgeKind: null,
      control: { text: "Start exorcism", ariaDisabled: "true" },
      sitesSummary: null,
      sites: [],
      attempts: [],
    };
  }
  const v = buildProofView(c.report);
  const attempts: AttemptFacts[] = v.attempts.map((a) => ({
    headline: ` Attempt ${a.attempt}${a.candidateName !== undefined ? `: ${a.candidateName}` : ""}`.trim(),
    badge: a.badgeLabel,
    badgeKind: a.badge,
    lines: [`${a.runsText}, ${a.seedText}`, a.sabotageLine, ...(a.errorText !== undefined ? [a.errorText] : [])],
    heading: a.counterexample ? COPY.proofCounterexampleHeading : null,
    blocks: a.counterexample
      ? [
          { label: "Shrunk input", text: a.counterexample.input },
          { label: "Old output", text: a.counterexample.oldOutput },
          { label: "New output", text: a.counterexample.newOutput },
        ]
      : [],
  }));
  return {
    heading: "Proof",
    lines: [v.badgeLabel, `${v.runsText}, ${v.seedText}`, v.sabotageLine, ...(v.recommendation !== undefined ? [v.recommendation] : [])],
    badge: v.badgeLabel,
    badgeKind: v.badge,
    control: null,
    sitesSummary: `Call sites (${v.callSiteTotal})`,
    sites: [...v.callSites.map((s) => `${s.label} (${s.enclosing})`), ...(v.moreCount > 0 ? [`and ${v.moreCount} more`] : [])],
    attempts,
  };
}

function proofRoute(c: ProofCase): { status?: number; body?: unknown } {
  switch (c.kind) {
    case "report":
      return { body: serializeProofReport(c.report) };
    case "absent":
      return { status: 404, body: "not found" };
    case "failed":
      return { status: 500, body: "boom" };
    case "invalid":
      return { body: '{"not":"a proof report"}' };
  }
}

export async function checkProofFacts(c: ProofCase, mutate?: ToeMutate): Promise<void> {
  const page = mountPage({
    route: "#/demo/pump",
    fetchRoutes: {
      "GET /api/demo/pump": { body: serializeReport(DEAD_REPORT) },
      "GET /demo/proofs/pump/gone.json": proofRoute(c),
    },
  });
  try {
    await page.flush();
    const opener = page.document.querySelector<HTMLElement>("button.tombstone[data-key='gone']");
    if (!opener) fail("no tombstone for gone");
    page.click(opener!);
    await page.flush();
    mutate?.(page.document, {
      report: DEAD_REPORT,
      openName: "gone",
      proofCase: c.kind,
      ...(c.kind === "report" ? { proof: c.report } : {}),
    });
    const actual = toeFacts(page.document.body).proof;
    if (actual === null) fail("no Proof section in the open panel");

    const reference =
      c.kind === "report"
        ? renderReferenceProofFacts({ status: "report", view: buildProofView(c.report) })
        : renderReferenceProofFacts(c.kind === "invalid" ? { status: "unreadable" } : { status: "coming_soon" });
    if (!same(actual, reference)) {
      fail(`proof facts differ from the Reference_Views:\nactual=${JSON.stringify(actual)}\nreference=${JSON.stringify(reference)}`);
    }
    const want = expectedProofFacts(c);
    if (!same(actual, want)) {
      fail(`proof facts differ from the report's:\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(want)}`);
    }
    page.fake.assertNoUnexpected();
  } finally {
    page.destroy();
  }
}

export const proofCaseArb: fc.Arbitrary<ProofCase> = fc.oneof(
  { weight: 8, arbitrary: proofReportArb.map((report): ProofCase => ({ kind: "report", report })) },
  { weight: 1, arbitrary: fc.constantFrom<ProofCase>({ kind: "absent" }, { kind: "failed" }, { kind: "invalid" }) },
);

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[ProofCase]> {
  return fc.asyncProperty(proofCaseArb, async (c) => {
    await checkProofFacts(c, mutate);
  });
}
