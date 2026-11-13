// Property 3 (toe-tag-redesign): report strings stay text and links stay safe. Hostile strings in every free-text
// field of generated Scan_Reports and Proof_Reports; page mounted, package opened.
import fc from "fast-check";
import { serializeProofReport } from "@graveyard-kit/skeleton/proof";
import type { ProofReport } from "@graveyard-kit/skeleton/proof";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { isProofName } from "@graveyard-kit/skeleton/proof";
import { openPackageArb, proofReportArb, scanReportArb } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { ToeMutate } from "../sabotage/toe.js";

export class TT3Failure extends Error {}
const fail = (message: string): never => {
  throw new TT3Failure(message);
};

export const HOSTILE_CORPUS = [
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  "&lt;b&gt;",
  '"><script>',
  "u".repeat(200),
  "data:text/html,x",
] as const;

/**
 * Class names of decorative elements the redesign adds. They must hold no report text. Later tasks extend this
 * list as they add decorations (tag-band, sheet-tag parts, ...).
 */
export const DECORATIVE_CLASSES: string[] = ["tag-hole", "tag-label", "tag-range"];

const hostileArb = fc.constantFrom(...HOSTILE_CORPUS);

/** scanReportArb with hostile strings in the free-text fields the page shows. */
export const hostileScanReportArb: fc.Arbitrary<ScanReport> = fc
  .tuple(scanReportArb, fc.array(hostileArb, { maxLength: 3 }), hostileArb, hostileArb)
  .map(([report, warnings, evidence, reason]) => ({
    ...report,
    warnings: [...report.warnings, ...warnings],
    dependencies: report.dependencies.map((d) => ({
      ...d,
      evidenceWarnings: [...d.evidenceWarnings, evidence],
      unknownReasons: Object.fromEntries(
        d.death.parts
          .filter((p) => p.status === "unknown")
          .map((p) => [p.signal, { source: "npm", category: "not_found", message: reason }]),
      ) as ScanReport["dependencies"][number]["unknownReasons"],
    })),
  }));

const ANY_ATTR_ON = /^on/i;
/**
 * The points-bar width, plus (until task 4.1 removes it) the header count's token-colored top border. Neither can
 * hold report text: a number followed by `%`, or `var(--token)`.
 */
const ALLOWED_STYLE = /^(width:\s*\d+(\.\d+)?%|border-top-color:\s*var\(--[a-z-]+\));?$/;
const FORBIDDEN = "img, script, iframe, object, embed, svg, style";

/** Throws a TT3Failure naming the first violated rule. */
export function assertSafe(doc: Document, strings: readonly string[]): void {
  const body = doc.body;
  const bad = body.querySelector(FORBIDDEN);
  if (bad) fail(`a <${bad.tagName.toLowerCase()}> element exists`);
  for (const el of Array.from(body.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (ANY_ATTR_ON.test(attr.name)) fail(`attribute ${attr.name} on <${el.tagName.toLowerCase()}>`);
      if (attr.name === "style" && !ALLOWED_STYLE.test(attr.value)) fail(`style attribute "${attr.value}"`);
      if (attr.name.startsWith("data-") && attr.name !== "data-key" && attr.name !== "data-grade" && attr.name !== "data-label" && attr.name !== "data-status") {
        fail(`unexpected attribute ${attr.name}`);
      }
    }
  }
  for (const a of Array.from(body.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") ?? "";
    if (!/^https?:\/\//i.test(href) && !href.startsWith("#")) fail(`an unsafe href was rendered: ${href}`);
    if (a.closest("section.proof")) fail("an anchor exists inside section.proof");
    if (a.closest(".tag-field")) fail("an anchor exists inside a Tag_Field");
  }
  const selector = DECORATIVE_CLASSES.map((c) => `.${c}`).join(", ");
  for (const el of Array.from(body.querySelectorAll(selector))) {
    const text = el.textContent ?? "";
    for (const s of strings) if (s.length > 2 && text.includes(s)) fail(`decorative element .${el.className} holds report text "${s}"`);
  }
}

export interface SafetyCase {
  report: ScanReport;
  index: number;
  proof: ProofReport;
}

export async function checkSafety(c: SafetyCase, mutate?: ToeMutate): Promise<void> {
  const dep = c.report.dependencies[c.index % c.report.dependencies.length]!;
  const routes: Record<string, { body?: unknown; status?: number }> = {
    "GET /api/demo/pump": { body: serializeReport(c.report) },
  };
  if (isProofName(dep.name)) routes[`GET /demo/proofs/pump/${dep.name}.json`] = { body: serializeProofReport(c.proof) };
  const page = mountPage({ route: "#/demo/pump", fetchRoutes: routes });
  try {
    await page.flush();
    page.document.querySelector<HTMLElement>("button.disclosure[aria-controls='alive-list']")?.click();
    const opener = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find(
      (t) => t.getAttribute("data-key") === dep.name,
    );
    if (!opener) fail(`no tombstone for ${dep.name}`);
    page.click(opener!);
    await page.flush();
    mutate?.(page.document, { report: c.report, openName: dep.name, proof: c.proof });
    const strings: string[] = [
      ...HOSTILE_CORPUS,
      ...c.report.dependencies.map((d) => d.name),
      ...c.report.warnings,
      ...c.proof.attempts.flatMap((a) => (a.counterexample ? [a.counterexample.input, a.counterexample.oldOutput] : [])),
    ];
    assertSafe(page.document, strings);
  } finally {
    page.destroy();
  }
}

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[ScanReport, number, ProofReport]> {
  return fc.asyncProperty(hostileScanReportArb, openPackageArb, proofReportArb, async (report, index, proof) => {
    await checkSafety({ report, index, proof }, mutate);
  });
}
