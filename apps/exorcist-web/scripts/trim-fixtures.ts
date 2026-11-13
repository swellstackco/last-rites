// One-off helper, run by hand: npx vite-node apps/exorcist-web/scripts/trim-fixtures.ts
// Regenerates the trimmed fixtures from /demo. See src/__fixtures__/README.md.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { trimReportText } from "../src/test-support/trim-report.js";

const demo = new URL("../../../demo/", import.meta.url);
const out = new URL("../src/__fixtures__/", import.meta.url);
mkdirSync(out, { recursive: true });
const read = (n: string): string => readFileSync(new URL(`${n}.json`, demo), "utf8");

const PLAN: Record<string, readonly string[]> = {
  "parse-server": [
    "@babel/plugin-proposal-object-rest-spread",
    "@saithodev/semantic-release-backmerge",
    "deep-diff",
    "ldapjs",
    "node-abort-controller",
    "cross-env",
    "jasmine-spec-reporter",
    "pg-monitor",
    "lodash",
  ],
  prettier: ["remark-footnotes", "cross-env", "unified", "leven"],
  jest: ["netlify-plugin-cache", "promise", "jest-silent-reporter", "ts-node"],
};
for (const [name, keep] of Object.entries(PLAN)) {
  writeFileSync(new URL(`${name}.trim.json`, out), trimReportText(read(name), keep));
}
copyFileSync(new URL("pump.json", demo), new URL("pump.json", out));
