import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configFromEnv } from "@graveyard-kit/exorcist-npm/programmatic";
import { FakeHttp, createFakeClock, createFakeSleep } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import type { FixtureEntry } from "@graveyard-kit/exorcist-npm/programmatic/testing";
import { createActionEvidenceStage } from "./stage.js";
import type { ActionEvidenceInput } from "./stage.js";
import { rawManifestUrl, releasesLatestUrl } from "./urls.js";

const NOW = "2026-01-01T00:00:00Z";
const input: ActionEvidenceInput = { name: "o/r", ref: "v1", site: "step", now: NOW };
const json = (body: unknown, status = 200) => ({ status, headers: {}, body: JSON.stringify(body) });

const FIXTURES: FixtureEntry[] = [
  { method: "GET", url: "https://api.github.com/repos/o/r", response: json({ archived: true, default_branch: "main" }) },
  {
    method: "GET",
    url: "https://api.github.com/repos/o/r/commits?per_page=1&sha=main",
    response: json([{ commit: { committer: { date: "2024-01-01T00:00:00Z" } } }]),
  },
  { method: "GET", url: releasesLatestUrl("o", "r"), response: json({ published_at: "2023-01-01T00:00:00Z" }) },
  {
    method: "GET",
    url: rawManifestUrl("o/r", "v1", undefined, "action.yml"),
    response: { status: 200, headers: {}, body: "runs:\n  using: node12\n" },
  },
  { method: "POST", url: "https://api.osv.dev/v1/query", response: json({}) },
];

let root: string | undefined;
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

/** One stage over a fresh temporary cache (so a failure is never masked by an earlier success). */
function run(
  inp: ActionEvidenceInput | Record<string, unknown>,
  opts: { failHost?: string; failUrl?: string } = {},
) {
  root = mkdtempSync(join(tmpdir(), "exorcist-actions-stage-"));
  const failures = [
    ...(opts.failHost !== undefined ? [{ match: (r: { url: string }) => new URL(r.url).hostname === opts.failHost, mode: "http_500" as const }] : []),
    ...(opts.failUrl !== undefined ? [{ match: (r: { url: string }) => r.url === opts.failUrl, mode: "http_500" as const }] : []),
  ];
  const http = new FakeHttp({ fixtures: FIXTURES, failures });
  const clock = createFakeClock(NOW);
  const stage = createActionEvidenceStage(configFromEnv({}, root), { http, clock: clock.clock, sleep: createFakeSleep(clock).sleep });
  return stage(inp as ActionEvidenceInput).then((result) => ({ result, http }));
}

describe("createActionEvidenceStage", () => {
  it("all sources succeed", async () => {
    const { result, http } = await run(input);
    expect(http.unmatched).toEqual([]);
    expect(result.signals.repoArchived).toEqual({ kind: "known", value: true });
    expect(result.signals.monthsSinceLastCommit).toEqual({ kind: "known", value: 24 });
    expect(result.signals.monthsSinceLastPublish).toEqual({ kind: "known", value: 36 });
    expect(result.signals.deprecated).toEqual({ kind: "known", value: true });
    expect(result.signals.openVulnsNoFix).toEqual({ kind: "known", value: 0 });
    expect(result.signals.knownReplacementExists).toEqual({ kind: "known", value: false });
    expect(result.signals.maintainerCount).toEqual({ kind: "unknown" });
    expect(Object.keys(result.unknownReasons)).toEqual(["maintainerCount"]);
  });

  it.each([
    ["the repository metadata", { failUrl: "https://api.github.com/repos/o/r" }, ["repoArchived", "monthsSinceLastCommit"]],
    ["the release and tags", { failUrl: releasesLatestUrl("o", "r") }, ["monthsSinceLastPublish"]],
    ["the manifest", { failHost: "raw.githubusercontent.com" }, ["deprecated"]],
    ["OSV", { failHost: "api.osv.dev" }, ["openVulnsNoFix"]],
  ])("a failing %s makes only its own signals unknown", async (_n, opts, unknowns) => {
    const { result } = await run(input, opts);
    const unknown = Object.entries(result.signals)
      .filter(([k, v]) => k !== "sourceUrls" && (v as { kind: string }).kind === "unknown")
      .map(([k]) => k)
      .filter((k) => k !== "maintainerCount")
      .sort();
    expect(unknown).toEqual([...unknowns].sort());
    for (const k of unknowns) expect(result.unknownReasons[k as "deprecated"]?.category).toBe("network_error");
  });

  it("a stage that fails unexpectedly gives all seven unknown and the warning", async () => {
    const { result } = await run({ ...input, now: "not a date" });
    expect(Object.values(result.signals).filter((v) => (v as { kind?: string }).kind === "unknown")).toHaveLength(7);
    expect(Object.values(result.unknownReasons).every((r) => r?.category === "network_error")).toBe(true);
    expect(result.warnings).toEqual(["evidence failed for o/r"]);
    expect(result.signals.sourceUrls).toEqual({});
  });

  it("does not reject on an invalid name", async () => {
    const { result } = await run({ ...input, name: "no-slash" });
    expect(result.warnings).toEqual(["evidence failed for no-slash"]);
  });

  it("two calls with the same inputs give equal results", async () => {
    const a = await run(input);
    const b = await run(input);
    expect(a.result).toEqual(b.result);
  });

  it("a Site job use makes no manifest request", async () => {
    const { result, http } = await run({ ...input, site: "job" });
    expect(http.requests.filter((r) => new URL(r.url).hostname === "raw.githubusercontent.com")).toEqual([]);
    expect(result.signals.deprecated).toEqual({ kind: "unknown" });
    expect(result.unknownReasons.deprecated).toEqual({ source: "github", category: "not_applicable", message: "github: not_applicable" });
  });
});
