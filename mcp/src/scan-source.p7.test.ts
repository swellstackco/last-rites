import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { DEMO_REPOS, parseReport, type DemoStore, type ScanOutcome, type ScanPipeline } from "@last-rites/exorcist-npm/programmatic";
import { assertPropertyAsync } from "./test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "./test-support/sabotage-runner.js";
import { REAL_SCAN_SOURCE, type ScanSource } from "./test-support/validators.js";
import { KIRO_P7_SABOTAGES } from "./test-support/sabotage/kiro-p7.js";
import { counting, makeDeps } from "./test-support/fakes.js";

const SAMPLE = readFileSync(new URL("./__fixtures__/demo/sample.json", import.meta.url), "utf8");
const parsed = parseReport(SAMPLE);
if (!parsed.ok) throw new Error("sample fixture invalid");
const REPORT = parsed.report;
const LIVE_REPORT = { ...REPORT, repo: "live/report" };
const LIVE: ScanPipeline = async (): Promise<ScanOutcome> => ({ ok: true, report: LIVE_REPORT });

type State = "valid" | "missing" | "not-json" | "not-canonical" | "bad-utf8";
const STATES: State[] = ["valid", "missing", "not-json", "not-canonical", "bad-utf8"];
const bytesFor = (s: State): Uint8Array | undefined => {
  switch (s) {
    case "valid": return new TextEncoder().encode(SAMPLE);
    case "missing": return undefined;
    case "not-json": return new TextEncoder().encode("not json");
    case "not-canonical": return new TextEncoder().encode(JSON.stringify(JSON.parse(SAMPLE), null, 4));
    case "bad-utf8": return new Uint8Array([0xff, 0xfe]);
  }
};

export const name = "Property 7: Demo routing";

export function build(impl: ScanSource) {
  return fc.asyncProperty(
    fc.constantFrom(...DEMO_REPOS),
    fc.constantFrom<"name" | "owner/repo" | "other">("name", "owner/repo", "other"),
    fc.constantFrom<string | undefined>(undefined, undefined, "main", "v1.2.3"),
    fc.array(fc.constantFrom(...STATES), { minLength: DEMO_REPOS.length, maxLength: DEMO_REPOS.length }),
    async (demo, form, ref, states) => {
      const snapshots = new Map(DEMO_REPOS.map((d, i) => [d.name, bytesFor(states[i]!)]));
      const asked: string[] = [];
      const store = Object.assign(async (n: string) => {
        asked.push(n);
        return snapshots.get(n);
      }, { asked }) as unknown as DemoStore;
      const github = counting(LIVE);
      const base = makeDeps();
      const deps = makeDeps({ demoStore: store, scan: { ...base.scan, github } });
      const repo = form === "name" ? demo.name : form === "owner/repo" ? `${demo.owner}/${demo.repo}` : "someone/else";
      const input = ref === undefined ? { repo } : { repo, ref };
      const r = await impl.obtainScanReport(deps, input);

      const fromStore = form !== "other" && ref === undefined;
      if (form === "name" && ref !== undefined) {
        if (r.ok || r.code !== "invalid_ref") throw new Error(`demo name with ref: expected invalid_ref, got ${JSON.stringify(r)}`);
        if (asked.length + github.calls.length + deps.totalCalls() !== 0) throw new Error("rejected input reached a Dep");
        return true;
      }
      if (fromStore) {
        if (JSON.stringify(asked) !== JSON.stringify([demo.name])) throw new Error(`store asked ${JSON.stringify(asked)}`);
        if (github.calls.length !== 0) throw new Error("pipeline called for a demo");
        const state = states[DEMO_REPOS.indexOf(demo)]!;
        if (state === "valid") {
          if (!r.ok || JSON.stringify(r.report) !== JSON.stringify(REPORT)) throw new Error("valid snapshot not served as is");
        } else {
          const want = state === "missing" ? "demo_not_found" : "demo_invalid";
          if (r.ok || r.code !== want) throw new Error(`state ${state}: expected ${want}, got ${JSON.stringify(r).slice(0, 80)}`);
        }
        return true;
      }
      if (asked.length !== 0) throw new Error("store asked for a live scan");
      if (github.calls.length !== 1) throw new Error(`pipeline called ${github.calls.length} times`);
      const input0 = github.calls[0]![0] as { ref?: string };
      if (input0.ref !== ref) throw new Error("ref not forwarded");
      if (!r.ok || r.report.repo !== "live/report") throw new Error("live result not returned");
      return true;
    },
  );
}

export const property7: NamedAsyncProperty<ScanSource> = { name, build };

describe("Property 7: Demo routing", () => {
  it("holds for the real scan source", async () => {
    await assertPropertyAsync(name, build(REAL_SCAN_SOURCE));
  });

  it("every sabotage is caught", async () => {
    expect(KIRO_P7_SABOTAGES.length).toBeGreaterThan(0);
    await assertAllSabotagesCaughtAsync(name, [property7], KIRO_P7_SABOTAGES);
  });

  it("every committed demo/*.json is accepted by parseReport", () => {
    const dir = new URL("../../demo/", import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const p = parseReport(readFileSync(new URL(f, dir), "utf8"));
      expect(p.ok, f).toBe(true);
    }
  });
});
