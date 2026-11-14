// Property 4 (graveyard-ui-actions, B1 view, fail-first): Pin_Kind and Contract_Kind attempts show what was
// proved; every other attempt keeps the view it has today. The new fields are read through a local type so the
// property type-checks before the fields exist.
import fc from "fast-check";
import { buildProofView } from "@last-rites/skeleton/graveyard";
import type { AttemptView, ProofView } from "@last-rites/skeleton/graveyard";
import type { ProofAttempt, ProofReport, ShapeResult } from "@last-rites/skeleton/proof";
import { buildProofReport } from "../build-proof-report.js";
import { renderProofState } from "../../views/proof-slot.js";

export class ActionsP4Failure extends Error {}

export const MAX_REWRITE_LINES = 40;
export const PIN_LINE = "Pin check: refs pinned to a commit";
export const CONTRACT_LINE = "Swap contract: inputs of the old action mapped to the replacement";

/** The fields task 3.4 adds to AttemptView. */
export interface KindFields {
  kind?: "pin" | "contract";
  kindLine?: string;
  coverageText?: string;
  rewrite?: { lines: string[]; moreCount: number };
}
export type AttemptViewK = AttemptView & KindFields;

export type Variant = "pin" | "contract" | "other";

export interface P4Case {
  variant: Variant;
  shapes: ShapeResult[];
  /** `candidate.source`, 1-90 lines (a single empty line is allowed: an empty source is a present, one-line rewrite). */
  source: string;
  candidateName: string;
  status: "proved" | "error";
}

const KEY = fc.constantFrom("dropped.override", "dropped.profile", "renamed.target", "required.toolchain", "uses", "files", "a", "é");
const coverageArb = fc
  .array(fc.tuple(KEY, fc.integer({ min: 0, max: 5000 })), { maxLength: 6 })
  .map((pairs) => Object.fromEntries([...new Map(pairs)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

const shapeArb = (id: string): fc.Arbitrary<ShapeResult> =>
  fc.record({ id: fc.constant(id), status: fc.constant<"passed">("passed"), runs: fc.integer({ min: 0, max: 900 }), coverage: coverageArb });

const LINE = fc.oneof(
  fc.constantFrom("-         uses: actions/checkout@v4", "+         uses: actions/checkout@abc # v4", "<img src=x onerror=alert(1)>", "  ", "&lt;b&gt;", "javascript:alert(1)"),
  fc.string({ maxLength: 20 }).map((s) => s.replace(/[\r\n]/g, " ")),
);
const sourceArb = fc.integer({ min: 1, max: 90 }).chain((n) => fc.array(LINE, { minLength: n, maxLength: n })).map((l) => l.join("\n"));

export const p4CaseArb: fc.Arbitrary<P4Case> = fc.record({
  variant: fc.constantFrom<Variant>("pin", "contract", "other"),
  shapes: fc.constant<ShapeResult[]>([]),
  source: sourceArb,
  candidateName: fc.constantFrom("pin-x-12345678", "swap-x-12345678", "intersect", "candidate-1", "pin-", "swap-"),
  status: fc.constantFrom<"proved" | "error">("proved", "proved", "error"),
}).chain((c) =>
  (c.variant === "pin"
    ? fc.tuple(shapeArb("pin")).map((s) => s as ShapeResult[])
    : c.variant === "contract"
      ? fc.tuple(shapeArb("contract")).map((s) => s as ShapeResult[])
      : fc.oneof(
          fc.constant<ShapeResult[]>([]),
          fc.tuple(shapeArb("intersect")).map((s) => s as ShapeResult[]),
          fc.tuple(shapeArb("pin"), shapeArb("contract")).map((s) => s as ShapeResult[]),
          fc.tuple(shapeArb("pin"), shapeArb("pin")).map((s) => s as ShapeResult[]),
          fc.tuple(shapeArb("pins")).map((s) => s as ShapeResult[]),
        )
  ).map((shapes) => ({ ...c, shapes })),
);

export function reportOf(c: P4Case): ProofReport {
  const report = buildProofReport("proved");
  const base = report.attempts[0] as ProofAttempt;
  const attempt: ProofAttempt = {
    ...base,
    candidate: { name: c.candidateName, source: c.source },
    shapes: c.shapes,
    status: c.status,
    ...(c.status === "error" ? { error: { code: "no_recipe" as const, message: "m" }, sabotage: { applied: 0, caught: 0, survivors: [] } } : {}),
  };
  return { ...report, attempts: [attempt] };
}

/** The coverage text the design fixes: `files` and `uses` of a pin as "<n> <word>", every other key as "<key> <n>". */
export function expectedCoverage(shape: ShapeResult, kind: "pin" | "contract"): string | undefined {
  const parts = Object.entries(shape.coverage).map(([k, n]) => (kind === "pin" && (k === "files" || k === "uses") ? `${n} ${k}` : `${k} ${n}`));
  return parts.length === 0 ? undefined : parts.join(", ");
}

function fail(message: string): never {
  throw new ActionsP4Failure(message);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The text of an attempt as the page shows it. */
export function renderedAttemptText(view: ProofView): { text: string; elements: number } {
  const el = renderProofState({ status: "report", view }, "t");
  return { text: el.textContent ?? "", elements: el.querySelectorAll("img, script, iframe, object, a").length };
}

export function checkCase(c: P4Case, rewriteLimit = MAX_REWRITE_LINES): void {
  const report = reportOf(c);
  const view = buildProofView(report);
  const a = view.attempts[0] as AttemptViewK;
  const attempt = report.attempts[0] as ProofAttempt;
  // Fields that exist today.
  if (a.runsText !== `${attempt.runs} runs` || a.seedText !== `seed ${attempt.seed}` || a.candidateName !== c.candidateName) {
    fail(`existing fields changed: ${JSON.stringify(a)}`);
  }
  if (c.variant === "other") {
    for (const f of ["kind", "kindLine", "coverageText", "rewrite"] as const) {
      if (f in a) fail(`field ${f} is set for a non-pin, non-contract attempt: ${JSON.stringify(a[f])}`);
    }
    return;
  }
  const kind = c.variant;
  if (a.kind !== kind) fail(`kind is ${JSON.stringify(a.kind)}, expected ${kind} (the candidate name is ${JSON.stringify(c.candidateName)})`);
  const line = kind === "pin" ? PIN_LINE : CONTRACT_LINE;
  if (a.kindLine !== line) fail(`kindLine is ${JSON.stringify(a.kindLine)}`);
  const cov = expectedCoverage(c.shapes[0] as ShapeResult, kind);
  if (a.coverageText !== cov) fail(`coverageText is ${JSON.stringify(a.coverageText)}, expected ${JSON.stringify(cov)}`);
  const lines = c.source.split("\n");
  if (!a.rewrite) fail("no rewrite");
  const want = lines.slice(0, rewriteLimit);
  if (!same(a.rewrite.lines, want)) fail(`rewrite lines ${JSON.stringify(a.rewrite.lines)} differ from the first ${rewriteLimit} source lines`);
  if (a.rewrite.lines.length + a.rewrite.moreCount !== lines.length) fail("rewrite lines + moreCount is not the number of source lines");
  if (a.rewrite.lines.length > rewriteLimit) fail(`more than ${rewriteLimit} rewrite lines shown`);

  // Rendering: every added string is text; a hostile line creates no element.
  const { text, elements } = renderedAttemptText(view);
  if (elements > 0) fail("an element was created from report text");
  for (const s of [line, ...(cov ? [cov] : []), want.join("\n")]) if (!text.includes(s)) fail(`the rendered proof lacks ${JSON.stringify(s)}`);
  const more = a.rewrite.moreCount;
  if (more > 0 && !text.includes(`and ${more} more lines`)) fail(`the rendered proof lacks "and ${more} more lines"`);
  if (more === 0 && /and \d+ more lines/.test(text)) fail("a 'more lines' line is shown for a short rewrite");
}

export function build(): fc.IAsyncProperty<[P4Case]> {
  return fc.asyncProperty(p4CaseArb, async (c) => checkCase(c));
}

/** Only the "other shapes unchanged" half. */
export function buildOther(): fc.IAsyncProperty<[P4Case]> {
  return fc.asyncProperty(p4CaseArb.filter((c) => c.variant === "other"), async (c) => checkCase(c));
}
