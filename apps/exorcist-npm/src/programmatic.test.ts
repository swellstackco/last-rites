import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as programmatic from "./programmatic.js";
import * as testing from "./programmatic-testing.js";

const PROGRAMMATIC_NAMES = [
  "CacheLayer",
  "DEFAULT_SCAN_API_CONFIG",
  "DEMO_NAME_PATTERN",
  "DEMO_REPOS",
  "RECIPES",
  "REPO_PATTERN",
  "ResilientClient",
  "assembleReport",
  "configFromEnv",
  "createDeadline",
  "createEvidenceStage",
  "createFetchClient",
  "createFsDemoStore",
  "createNodeReportFs",
  "createNodeSourceFs",
  "createRepoFileSource",
  "createScanPipeline",
  "createScanRuntime",
  "createUsageSurface",
  "exorcise",
  "fetchE18e",
  "isProofOutPath",
  "loadCandidate",
  "parseRepoTarget",
  "parseReport",
  "realWatchdog",
  "serializeReport",
];

const TESTING_NAMES = ["FakeHttp", "createFakeClock", "createFakeSleep", "createMemoryFs", "memoryFiles", "reportArb"];

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

/** True when the source is only comments, blank lines and `export ... from` re-exports (no bodies). */
function isReExportsOnly(text: string): boolean {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return statements.every((s) => /^export\s+(type\s+)?\{[^{}]*\}\s+from\s+"[^"]+"$/.test(s));
}

describe("programmatic entries", () => {
  it("exports exactly the pinned names", () => {
    expect(Object.keys(programmatic).sort()).toEqual(PROGRAMMATIC_NAMES);
    expect(Object.keys(testing).sort()).toEqual(TESTING_NAMES);
  });

  it("contains re-exports only, no function bodies", () => {
    expect(isReExportsOnly(read("./programmatic.ts"))).toBe(true);
    expect(isReExportsOnly(read("./programmatic-testing.ts"))).toBe(true);
  });

  it("the static check rejects a file with a function body", () => {
    expect(isReExportsOnly('export { a } from "./a.js";\nexport function f() { return 1; }\n')).toBe(false);
    expect(isReExportsOnly('export const x = () => 1;\n')).toBe(false);
  });

  it("scan/index.ts and evidence/index.ts do not pull in the programmatic entries", () => {
    for (const rel of ["./scan/index.ts", "./evidence/index.ts"]) {
      expect(read(rel)).not.toMatch(/programmatic/);
    }
  });
});
