// Sabotage_List for Property 6 (graveyard-ui-actions 4.3, design.md): wrong links and labels the property must
// catch. Link sabotages wrap `packageHref`; label sabotages tamper with the open panel of the committed demo.
import type { Page } from "../dom-harness.js";
import type { PackageHref } from "../properties/p-actions-6.js";

export interface P6LinkSabotage {
  name: string;
  wrap: (real: PackageHref) => PackageHref;
}
export interface P6PageSabotage {
  name: string;
  tamper: (page: Page) => void;
}

export const P6_LINK_SABOTAGES: readonly P6LinkSabotage[] = [
  {
    name: "(a) link to https://www.npmjs.com/package/<name>",
    wrap: () => (_eco, name) => (name === "" ? undefined : { href: `https://www.npmjs.com/package/${name}`, host: "www.npmjs.com" }),
  },
  {
    name: "(b) the whole name including the sub path",
    wrap: (real) => (eco, name) => {
      const r = real(eco, name);
      return r && name.includes("/") ? { href: `https://github.com/${name}`, host: "github.com" } : r;
    },
  },
  {
    name: "(c) accepts docker://",
    wrap: (real) => (eco, name) => (name.startsWith("docker://") ? { href: `https://github.com/${name.slice(9)}`, host: "github.com" } : real(eco, name)),
  },
  {
    name: "(d) skips validation (safeHref and the name pattern)",
    wrap: (real) => (eco, name) => real(eco, name) ?? (name === "" ? undefined : { href: name, host: "github.com" }),
  },
  {
    name: "(f) adds a link for npm",
    wrap: (real) => (eco, name) => real(eco, name) ?? (eco !== "github-actions" && name !== "" ? { href: `https://www.npmjs.com/package/${name}`, host: "www.npmjs.com" } : undefined),
  },
];

export const P6_PAGE_SABOTAGES: readonly P6PageSabotage[] = [
  {
    name: '(e) leaves "Deprecated on npm"',
    tamper: (page) => {
      for (const th of Array.from(page.dialogRoot.querySelectorAll("table.breakdown tbody th"))) {
        if (th.textContent?.startsWith("Deprecated")) th.textContent = "Deprecated on npm";
      }
    },
  },
];
