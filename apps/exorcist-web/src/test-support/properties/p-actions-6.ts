// Property 6 (graveyard-ui-actions, B3, fail-first): Package_Links and labels derived from an Action_Name.
// `packageHref` is loaded dynamically so this file type-checks (and the page checks run) before the function exists.
import fc from "fast-check";
import { serializeReport } from "@last-rites/exorcist-npm/report";
import type { ScanReport } from "@last-rites/exorcist-npm/report";
import { actionNameArb } from "../arbitraries.js";
import { mountPage } from "../dom-harness.js";
import type { Page } from "../dom-harness.js";

export class ActionsP6Failure extends Error {}

export type Ecosystem = "npm" | "github-actions";
export type PackageHref = (ecosystem: Ecosystem | undefined, name: string) => { href: string; host: string } | undefined;

/** Imports model/package-link.ts; rejects while the module does not exist (the fail-first state). */
export async function loadPackageHref(): Promise<PackageHref> {
  // A variable specifier: neither the type checker nor vite resolves it before the module exists (added by 3.7).
  const specifier = "../../model/package-link.js";
  const mod = (await import(/* @vite-ignore */ specifier)) as { packageHref: PackageHref };
  return mod.packageHref;
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The rule of design.md "Package link", written independently: the expected href, or undefined. */
export function expectedHref(name: string): string | undefined {
  if (name === "" || name.length > 200 || /\s/.test(name) || name.includes("@")) return undefined;
  const parts = name.split("/");
  const [owner, repo, ...rest] = parts;
  if (owner === undefined || repo === undefined) return undefined;
  if (!SEGMENT.test(owner) || !SEGMENT.test(repo) || repo === "." || repo === "..") return undefined;
  if (rest.some((p) => !/^[A-Za-z0-9._-]+$/.test(p) || p === "." || p === "..")) return undefined;
  return `https://github.com/${owner}/${repo}`;
}

const HOSTILE: readonly string[] = [
  "",
  "javascript:alert(1)",
  "//evil",
  "a/b c",
  "../x",
  "./local",
  "./.github/actions/setup",
  "docker://alpine:3",
  "owner/repo@v1",
  "owner",
  "owner/",
  "/repo",
  "owner//repo",
  "-owner/repo",
  "owner/.",
  "owner/..",
  "owner/repo/../x",
  "<img src=x onerror=alert(1)>",
  "x".repeat(10_000),
  `${"o".repeat(150)}/${"r".repeat(150)}`,
  "https://github.com/owner/repo",
  "o/r\n",
];

export const nameCaseArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 5, arbitrary: actionNameArb },
  { weight: 3, arbitrary: fc.constantFrom(...HOSTILE) },
  { weight: 2, arbitrary: fc.string({ maxLength: 30 }) },
);

function fail(message: string): never {
  throw new ActionsP6Failure(message);
}

export function checkHref(packageHref: PackageHref, name: string): void {
  const want = expectedHref(name);
  const got = packageHref("github-actions", name);
  if (want === undefined) {
    if (got !== undefined) fail(`${JSON.stringify(name.slice(0, 60))} got a link ${JSON.stringify(got)}, expected none`);
    return;
  }
  if (got === undefined) fail(`${JSON.stringify(name)} got no link, expected ${want}`);
  if (got.href !== want || got.host !== "github.com") fail(`${JSON.stringify(name)} -> ${JSON.stringify(got)}, expected ${want} on github.com`);
  if (packageHref("npm", name) !== undefined || packageHref(undefined, name) !== undefined) fail("an npm package got a link");
}

export function build(packageHref: PackageHref): fc.IAsyncProperty<[string]> {
  return fc.asyncProperty(nameCaseArb, async (name) => checkHref(packageHref, name));
}

/** The "Repository" fact of an open Detail_Panel: its link, if any. */
export function repositoryLink(page: Page): HTMLAnchorElement | null {
  const label = Array.from(page.dialogRoot.querySelectorAll("p.muted")).find((p) => p.textContent === "Repository");
  return label?.nextElementSibling?.querySelector("a") ?? null;
}

/** Opens every package of a github-actions report in turn and checks every href, aria-label and label. */
export async function checkActionsPage(
  report: ScanReport,
  demo: string,
  proofs: Record<string, string> = {},
  /** Emulates a wrong page (4.3): called with the open panel before the checks. Default: none. */
  tamper?: (page: Page) => void,
): Promise<void> {
  const fetchRoutes: Record<string, { body: string }> = { [`GET /api/demo/${demo}`]: { body: serializeReport(report) } };
  for (const [name, text] of Object.entries(proofs)) fetchRoutes[`GET /demo/proofs/${demo}/${name}.json`] = { body: text };
  const page = mountPage({ route: `#/demo/${demo}`, fetchRoutes });
  try {
    await page.flush();
    for (const dep of report.dependencies) {
      const alive = page.document.querySelector<HTMLElement>("[aria-controls='alive-list']");
      if (alive && !Array.from(page.document.querySelectorAll("button.tombstone")).some((t) => t.getAttribute("data-key") === dep.name)) page.click(alive);
      const tombstone = Array.from(page.document.querySelectorAll<HTMLElement>("button.tombstone")).find((t) => t.getAttribute("data-key") === dep.name);
      if (!tombstone) fail(`no tombstone for ${dep.name}`);
      page.click(tombstone);
      await page.flush();
      tamper?.(page);

      for (const el of Array.from(page.document.body.querySelectorAll("[href], [aria-label]"))) {
        const href = el.getAttribute("href") ?? "";
        const aria = el.getAttribute("aria-label") ?? "";
        if (/npmjs\.com/i.test(href) || /npmjs\.com/i.test(aria)) fail(`${dep.name}: npmjs.com in ${el.tagName} href=${href} aria-label=${aria}`);
      }
      if (/on npm/i.test(page.dialogRoot.textContent ?? "")) fail(`${dep.name}: the panel says "on npm"`);
      for (const el of Array.from(page.dialogRoot.querySelectorAll("[aria-label]"))) {
        if (/on npm/i.test(el.getAttribute("aria-label") ?? "")) fail(`${dep.name}: aria-label says "on npm": ${el.getAttribute("aria-label")}`);
      }

      const want = expectedHref(dep.name);
      const link = repositoryLink(page);
      if (want === undefined) {
        if (link) fail(`${dep.name}: a link was rendered for a name that has none`);
      } else {
        if (!link) fail(`${dep.name}: no Repository link (expected ${want})`);
        if (link.getAttribute("href") !== want) fail(`${dep.name}: link goes to ${link.getAttribute("href")}, expected ${want}`);
        if (new URL(link.href).host !== "github.com") fail(`${dep.name}: link host is not github.com`);
        if (link.getAttribute("rel") !== "noopener noreferrer") fail(`${dep.name}: link rel is ${link.getAttribute("rel")}`);
      }
      page.press("Escape");
      await page.flush();
    }
  } finally {
    page.destroy();
  }
}
