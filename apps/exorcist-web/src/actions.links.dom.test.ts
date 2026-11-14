// @vitest-environment jsdom
// graveyard-ui-actions 1.4: B3 exploratory tests (Property 6). All FAIL on the unfixed page: `packageHref` does not
// exist (the import rejects) and the page has no Repository link and says "Deprecated on npm". No network.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseReport } from "@last-rites/exorcist-npm/report";
import { buildReport } from "./test-support/build-report.js";
import { DYING_SIGNALS } from "./test-support/signals.js";
import { checkAsyncProperty, formatAsyncReport } from "./test-support/async-property.js";
import { build as p6, checkActionsPage, checkHref, loadPackageHref } from "./test-support/properties/p-actions-6.js";

const demo = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "demo", `${name}.json`), "utf8");

describe("Property 6: Package_Links and labels of an Action_Name (B3)", () => {
  it("packageHref links github-actions names to https://github.com/<owner>/<repo> and nothing else", async () => {
    const packageHref = await loadPackageHref();
    const report = await checkAsyncProperty("Property 6: packageHref", p6(packageHref));
    expect(report === undefined ? "" : formatAsyncReport(report)).toBe("");
  });

  it("examples: a sub path links to the repository; a local path has no link", async () => {
    const packageHref = await loadPackageHref();
    expect(packageHref("github-actions", "github/codeql-action/analyze")).toEqual({ href: "https://github.com/github/codeql-action", host: "github.com" });
    expect(packageHref("github-actions", "actions/checkout")).toEqual({ href: "https://github.com/actions/checkout", host: "github.com" });
    expect(packageHref("github-actions", "./local")).toBeUndefined();
    expect(packageHref("npm", "left-pad")).toBeUndefined();
    checkHref(packageHref, "owner/repo/sub/path");
  });

  it("the committed nixpacks demo, every package opened: no npmjs.com, no 'on npm', github.com links", async () => {
    const parsed = parseReport(demo("nixpacks-actions"));
    if (!parsed.ok) throw new Error("demo/nixpacks-actions.json does not parse");
    await checkActionsPage(parsed.report, "nixpacks-actions");
  }, 60_000);

  it("page examples: owner/repo/sub/path links to owner/repo, ./local stays text without a link", async () => {
    const names = ["owner/repo/sub/path", "./local"];
    const report = { ...buildReport(names.map((name) => ({ name, signals: DYING_SIGNALS, versionSource: "range" as const }))), ecosystem: "github-actions" as const };
    // checkActionsPage asserts the Repository link of every opened package against the independent rule.
    await checkActionsPage(report, "x");
  }, 60_000);
});
