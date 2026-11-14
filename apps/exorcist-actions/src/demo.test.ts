// Requirement 16.5: the committed Demo_Snapshot is an ordinary, canonical Scan_Report the graveyard accepts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIGNAL_NAMES } from "@last-rites/skeleton";
import { buildGraveyard } from "@last-rites/skeleton/graveyard";
import { parseReport, serializeReport } from "@last-rites/exorcist-npm/programmatic";
import { DEMO_SNAPSHOT_PATH } from "./test-support/harness.js";

const text = readFileSync(DEMO_SNAPSHOT_PATH, "utf8");
const parsed = parseReport(text);
const report = parsed.ok ? parsed.report : undefined;

describe("demo/nixpacks-actions.json", () => {
  it("passes parseReport and is canonical", () => {
    expect(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.error)).toBe(true);
    expect(serializeReport(report!)).toBe(text);
  });

  it("is a github-actions report of railwayapp/nixpacks at 144b4f9", () => {
    expect(report!.ecosystem).toBe("github-actions");
    expect(report!.repo).toBe("railwayapp/nixpacks");
    expect(report!.ref).toBe("144b4f9");
    expect(report!.dependencies.length).toBeGreaterThan(0);
  });

  it("is accepted by buildGraveyard", () => {
    const view = buildGraveyard(report!.dependencies);
    expect(view.total).toBe(report!.dependencies.length);
    expect(view.counts.dead).toBe(report!.summary.dead);
  });

  it.each(["actions-rs/toolchain", "actions-rs/cargo"])("lists %s with repoArchived known and true", (name) => {
    const dep = report!.dependencies.find((d) => d.name === name);
    expect(dep, name).toBeDefined();
    expect(dep!.signals.repoArchived).toEqual({ kind: "known", value: true });
  });

  it("has a source URL for every known signal", () => {
    let known = 0;
    for (const dep of report!.dependencies) {
      for (const s of SIGNAL_NAMES) {
        if (dep.signals[s].kind !== "known") continue;
        known++;
        expect(dep.signals.sourceUrls?.[s], `${dep.name}.${s}`).toMatch(/^https:\/\//);
      }
    }
    expect(known).toBeGreaterThan(0);
  });
});
