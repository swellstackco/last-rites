// Property TP4 (toe-tag-polish, T7): a Toe_Tag name breaks only at Split_Points. `.tomb-name` holds the cut name as text
// plus one <wbr> after each "/" and "-" that has a character after it, and nothing else. The expectation is written
// here from scratch (not by calling withSplitPoints), so the property does not depend on the code under test.
import fc from "fast-check";
import { MAX_TOMBSTONE_TEXT } from "../../constants.js";
import { packageNameArb } from "../arbitraries.js";
import { buildReport } from "../build-report.js";
import { DEAD_SIGNALS } from "../signals.js";
import { renderTombstone } from "../../views/tombstone.js";
import { withSplitPoints } from "../../views/wrap-points.js";

export class TP4Failure extends Error {}
const fail = (message: string): never => {
  throw new TP4Failure(message);
};

/** The name as the tag shows it: cut to the limit with an ellipsis. */
export const cutExpected = (name: string): string => (name.length > MAX_TOMBSTONE_TEXT ? `${name.slice(0, MAX_TOMBSTONE_TEXT - 1)}…` : name);

/** The expected child sequence of `.tomb-name` as "text" pieces and "<wbr>" markers. */
export function expectedPieces(text: string): string[] {
  const out: string[] = [];
  let run = "";
  for (let i = 0; i < text.length; i++) {
    run += text[i];
    if ((text[i] === "/" || text[i] === "-") && i < text.length - 1) {
      out.push(run, "<wbr>");
      run = "";
    }
  }
  if (run !== "") out.push(run);
  return out;
}

export type TombstoneMutate = (tombName: Element, name: string) => void;

/** Asserts the name structure of one Toe_Tag rendered for `name`. */
export function checkName(name: string, mutate?: TombstoneMutate): void {
  const report = buildReport([{ name, signals: DEAD_SIGNALS }]);
  const dep = report.dependencies[0]!;
  const button = renderTombstone({ key: name, index: 0, record: dep });
  const el = button.querySelector(".tomb-name");
  if (!el) return fail("no .tomb-name");
  mutate?.(el, name);
  const cut = cutExpected(name);
  if (el.textContent !== cut) fail(`text is ${JSON.stringify(el.textContent)}, expected ${JSON.stringify(cut)}`);
  const actual: string[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) actual.push(node.textContent ?? "");
    else if (node.nodeType === 1 && (node as Element).tagName === "WBR") actual.push("<wbr>");
    else fail(`unexpected child node ${node.nodeName} in .tomb-name`);
  }
  // Adjacent text nodes are equivalent to one; merge before comparing.
  const merged: string[] = [];
  for (const p of actual) {
    if (p !== "<wbr>" && merged.length > 0 && merged[merged.length - 1] !== "<wbr>") merged[merged.length - 1] += p;
    else merged.push(p);
  }
  const expected = expectedPieces(cut);
  if (JSON.stringify(merged) !== JSON.stringify(expected)) fail(`children are ${JSON.stringify(merged)}, expected ${JSON.stringify(expected)}`);
  if (button.getAttribute("data-key") !== name) fail("data-key changed");
  const label = `${name}, ${dep.death.grade}, score ${dep.death.score} of 100`;
  if (button.getAttribute("aria-label") !== label || button.getAttribute("title") !== label) fail("aria-label or title changed");
  if (button.querySelectorAll(".tomb-name *:not(wbr)").length > 0) fail("an element other than wbr was created from the name");
}

/** withSplitPoints joined back (text nodes only) equals its input. */
export function checkRoundTrip(text: string, mutate?: (pieces: Array<string | HTMLElement>) => Array<string | HTMLElement>): void {
  const pieces = mutate ? mutate(withSplitPoints(text)) : withSplitPoints(text);
  const joined = pieces.map((p) => (typeof p === "string" ? p : p.tagName === "WBR" ? "" : fail("non-wbr element"))).join("");
  if (joined !== text) fail(`round trip gives ${JSON.stringify(joined)} for ${JSON.stringify(text)}`);
}

export function build(mutate?: TombstoneMutate): fc.IPropertyWithHooks<[string]> {
  return fc.property(packageNameArb, (name) => {
    checkName(name, mutate);
    checkRoundTrip(name);
  });
}

export const roundTripArb = fc.string({ maxLength: 60 });
