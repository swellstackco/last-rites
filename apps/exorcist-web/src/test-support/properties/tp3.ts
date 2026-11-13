// Property TP3 (toe-tag-polish, T5): the home Masthead, hanging Demo_Cards and their dead counts. The four demo
// snapshots are served by the fake fetch (each readable, failing or unreadable, answered in a random order). The
// expected texts are written here (not imported) so the property does not depend on the code under test.
import fc from "fast-check";
import { serializeReport } from "@graveyard-kit/exorcist-npm/report";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/report";
import { DEMO_REPOS } from "../../model/demo-repos.js";
import { snapshotSetArb } from "../arbitraries.js";
import type { SnapshotCase } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { Page } from "../dom-harness.js";
import { deferred } from "../fake-fetch.js";
import type { FakeHandler, FakeResponseSpec } from "../fake-fetch.js";
import type { ToeContext, ToeMutate } from "../sabotage/toe.js";
import { pickerFacts } from "../toe-facts.js";
import { renderReferenceV3Picker } from "../toe-reference-v3.js";
import { assertSubtitle } from "./tp2.js";

export const EXPECTED_PITCH = "Find the dead npm packages in a repo, swap them out, and prove the new code behaves the same.";
export const OLD_INTRO = "Find the dead packages in a codebase, and see exactly why each one scores the way it does.";

export class TP3Failure extends Error {}
const fail = (message: string): never => {
  throw new TP3Failure(message);
};

/** The Dead_Count: packages whose `death.grade` is "dead" (a recount, not `report.summary`). */
export const deadCount = (report: ScanReport): number => report.dependencies.filter((d) => d.death.grade === "dead").length;

const specOf = (s: SnapshotCase): FakeResponseSpec =>
  s.kind === "ok" ? { body: serializeReport(s.report) } : s.kind === "failed" ? { status: 500, body: "boom" } : { body: "this is not json" };

/** Routes for the four snapshots (API and static fallback), each held until the test releases it. */
function snapshotRoutes(snapshots: readonly SnapshotCase[]): {
  routes: Record<string, FakeHandler>;
  release: (index: number) => void;
} {
  const routes: Record<string, FakeHandler> = {};
  const held = snapshots.map((s, i) => {
    const d = deferred<FakeResponseSpec>();
    const name = DEMO_REPOS[i]!.name;
    routes[`GET /api/demo/${name}`] = () => d.promise;
    // A failed read falls back to the static file, which fails too.
    routes[`GET /demo/${name}.json`] = s.kind === "ok" ? { body: serializeReport(s.report) } : { status: 500, body: "boom" };
    return { d, s };
  });
  return { routes, release: (i) => held[i]!.d.resolve(specOf(held[i]!.s)) };
}

const cardOf = (doc: Document, name: string): HTMLElement => {
  const card = doc.querySelector<HTMLElement>(`ul.demo-cards button.demo-card[data-demo='${name}']`);
  if (!card) return fail(`no demo card for ${name}`);
  return card;
};

/** Structure of the home page that does not depend on the snapshots. */
export function assertHomeStructure(page: Page): void {
  const doc = page.document;
  const h1s = doc.querySelectorAll("h1");
  if (h1s.length !== 1) fail(`expected exactly one h1, found ${h1s.length}`);
  const h1 = h1s[0]!;
  if (h1.textContent !== "Last Rites") fail(`h1 text is ${JSON.stringify(h1.textContent)}`);
  if (h1.getAttribute("tabindex") !== "-1") fail("h1 has no tabindex=-1");
  if (!h1.classList.contains("wordmark")) fail("h1 is not the wordmark");
  const masthead = h1.closest("div.masthead");
  if (!masthead) fail("the h1 is not inside div.masthead");
  if (masthead!.querySelector("p.wordmark")) fail("a second wordmark paragraph is present");
  assertSubtitle(masthead!.querySelector("p.form-subtitle"), "home page");
  const pitch = doc.querySelector("p.pitch");
  if (!pitch) fail("no p.pitch");
  if (pitch!.textContent !== EXPECTED_PITCH) fail(`pitch text is ${JSON.stringify(pitch!.textContent)}`);
  if (doc.querySelector("p.meta")) fail("the old eyebrow p.meta is still present");
  const text = doc.body.textContent ?? "";
  if (text.includes("The Graveyard")) fail('the "The Graveyard" eyebrow is still present');
  if (text.includes(OLD_INTRO)) fail("the old intro sentence is still present");
  if (page.active() !== h1) fail("the h1 does not have focus");

  const cards = Array.from(doc.querySelectorAll<HTMLElement>("ul.demo-cards button.demo-card"));
  if (cards.map((c) => c.getAttribute("data-demo")).join() !== DEMO_REPOS.map((d) => d.name).join()) fail("demo cards are not in DEMO_REPOS order");
  for (const [i, card] of cards.entries()) {
    const hole = card.firstElementChild;
    if (!hole || hole.tagName !== "SPAN" || !hole.classList.contains("tag-hole") || hole.getAttribute("aria-hidden") === null) {
      fail(`demo card ${card.getAttribute("data-demo")} does not start with span.tag-hole[aria-hidden]`);
    }
    const spans = Array.from(card.querySelectorAll(":scope > span:not(.tag-hole):not(.demo-dead)"));
    const want = DEMO_REPOS[i]!;
    const got = spans.map((s) => s.textContent);
    if (got[0] !== want.name || got[1] !== want.repo || got[2] !== want.blurb || got[3] !== "Cached snapshot, loads instantly, runs no scan") {
      fail(`demo card ${want.name} text changed: ${JSON.stringify(got)}`);
    }
  }
}

/** The "N dead" text of every card, after all snapshots were answered. */
export function assertCounts(page: Page, snapshots: readonly SnapshotCase[]): void {
  const doc = page.document;
  for (const [i, s] of snapshots.entries()) {
    const card = cardOf(doc, DEMO_REPOS[i]!.name);
    const dead = card.querySelectorAll(":scope > .demo-dead");
    if (s.kind === "ok") {
      if (dead.length !== 1) fail(`${DEMO_REPOS[i]!.name}: expected one .demo-dead, found ${dead.length}`);
      const want = `${deadCount(s.report)} dead`;
      if (dead[0]!.textContent !== want) fail(`${DEMO_REPOS[i]!.name}: count is ${JSON.stringify(dead[0]!.textContent)}, expected ${JSON.stringify(want)}`);
      if (card.lastElementChild !== dead[0]) fail(`${DEMO_REPOS[i]!.name}: .demo-dead is not the last child of the card`);
    } else if (dead.length !== 0) {
      fail(`${DEMO_REPOS[i]!.name}: a ${s.kind} snapshot shows ${JSON.stringify(dead[0]!.textContent)}`);
    }
  }
  if (doc.querySelector("[role='alert'], .error, .notice")) fail("the counts added an error or notice to the home page");
}

const ctxOf = (snapshots: readonly SnapshotCase[], phase: ToeContext["phase"]): ToeContext => ({
  phase,
  snapshots: snapshots.map((s) => s.kind),
});

export async function checkHome(snapshots: readonly SnapshotCase[], order: readonly number[], mutate?: ToeMutate): Promise<void> {
  const { routes, release } = snapshotRoutes(snapshots);
  const page = mountPage({ route: "", fetchRoutes: routes });
  try {
    await page.flush();
    // While the reads are pending the cards show today's text only.
    if (page.document.querySelector(".demo-dead")) fail("a count is shown before any snapshot was read");
    for (const i of order) {
      release(i);
      await page.flush();
    }
    mutate?.(page.document, ctxOf(snapshots, "final"));
    assertHomeStructure(page);
    assertCounts(page, snapshots);

    // The Live_Scan_Form is unchanged.
    const actual = pickerFacts(page.document.body);
    const reference = renderReferenceV3Picker();
    if (JSON.stringify(actual.form) !== JSON.stringify(reference.form)) fail("the Live_Scan_Form facts differ from the v3 picker");

    // Back on the picker (a live link shows it again), settled demos are not read twice and are painted at once.
    const reads = (name: string): number => page.fake.calls.filter((c) => c.url === `/api/demo/${name}`).length;
    page.navigateTo("#/live?repo=owner/name");
    for (const [i, s] of snapshots.entries()) {
      if (s.kind !== "ok") continue;
      const card = cardOf(page.document, DEMO_REPOS[i]!.name);
      if (card.querySelector(":scope > .demo-dead")?.textContent !== `${deadCount(s.report)} dead`) {
        fail(`${DEMO_REPOS[i]!.name}: the count is not painted at once when the picker comes back`);
      }
    }
    await page.flush();
    for (const [i, s] of snapshots.entries()) {
      if (s.kind === "ok" && reads(DEMO_REPOS[i]!.name) !== 1) fail(`${DEMO_REPOS[i]!.name}: read ${reads(DEMO_REPOS[i]!.name)} times`);
    }
  } finally {
    page.destroy();
  }
}

/** The user leaves the picker (opens a demo) before the snapshot reads answer: nothing is painted afterwards. */
export async function checkLeave(snapshots: readonly SnapshotCase[], order: readonly number[], mutate?: ToeMutate): Promise<void> {
  const { routes, release } = snapshotRoutes(snapshots);
  const page = mountPage({ route: "", fetchRoutes: routes });
  try {
    await page.flush();
    page.click(cardOf(page.document, DEMO_REPOS[0]!.name));
    for (const i of order) {
      release(i);
      await page.flush();
    }
    mutate?.(page.document, ctxOf(snapshots, "left"));
    if (page.document.querySelector(".demo-dead, .demo-card")) fail("the picker painted counts after the user left it");
    if (page.fake.unexpected.length > 0) fail(`unexpected fetches: ${page.fake.unexpected.join(", ")}`);
  } finally {
    page.destroy();
  }
}

export function build(mutate?: ToeMutate): fc.IAsyncProperty<[{ snapshots: SnapshotCase[]; order: number[] }]> {
  return fc.asyncProperty(snapshotSetArb, async ({ snapshots, order }) => {
    await checkHome(snapshots, order, mutate);
    await checkLeave(snapshots, order, mutate);
  });
}
