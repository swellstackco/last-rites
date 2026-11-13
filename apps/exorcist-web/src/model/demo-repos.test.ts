import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCAN_API_CONFIG } from "../../../exorcist-npm/src/scan/api/config.js";
import { LIVE_SCAN_LIMIT } from "../constants.js";
import { DEMO_REPOS } from "./demo-repos.js";

const demoDir = fileURLToPath(new URL("../../../../demo/", import.meta.url));

describe("DEMO_REPOS", () => {
  it("names equal the set of demo/*.json file names", () => {
    const files = readdirSync(demoDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
    expect(DEMO_REPOS.map((d) => d.name).sort()).toEqual(files);
  });

  it("every name is a valid demo name", () => {
    for (const d of DEMO_REPOS) expect(d.name).toMatch(/^[a-z0-9][a-z0-9-]{0,63}$/);
  });

  it("is in the documented order", () => {
    expect(DEMO_REPOS.map((d) => d.name)).toEqual(["parse-server", "prettier", "jest", "pump"]);
  });

  it("blurbs contain no digits", () => {
    for (const d of DEMO_REPOS) expect(d.blurb).not.toMatch(/\d/);
  });
});

describe("LIVE_SCAN_LIMIT", () => {
  it("equals the Scan_Api default scan rate limit", () => {
    expect(LIVE_SCAN_LIMIT).toEqual(DEFAULT_SCAN_API_CONFIG.scanRateLimit);
  });
});
