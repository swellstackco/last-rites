import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { parseReport, type ScanOutcome, type ScanPipeline } from "@graveyard-kit/exorcist-npm/programmatic";
import { ERROR_CODES } from "../errors.js";
import { fakeDemoStore, makeDeps, counting } from "../test-support/fakes.js";
import { scanRepoImpl } from "./scan-repo.js";

const SAMPLE = readFileSync(new URL("../__fixtures__/demo/sample.json", import.meta.url), "utf8");
const parsed = parseReport(SAMPLE);
if (!parsed.ok) throw new Error("sample invalid");
const REPORT = parsed.report;
const OK = async (): Promise<ScanOutcome> => ({ ok: true, report: REPORT });

const errorOf = (r: CallToolResult) => {
  expect(r.isError).toBe(true);
  expect(r.content).toHaveLength(1);
  return JSON.parse((r.content[0] as { text: string }).text) as { error: { code: string; message: string } };
};

describe("scan_repo", () => {
  it("serves a demo snapshot as the canonical report text", async () => {
    const deps = makeDeps({ demoStore: fakeDemoStore({ pump: SAMPLE }) });
    const r = await scanRepoImpl(deps, { repo: "pump" });
    expect(r.isError).toBeFalsy();
    expect(r.content).toEqual([{ type: "text", text: SAMPLE }]);
    expect(deps.totalCalls()).toBe(0);
  });

  it("scans a GitHub repo through the pipeline and returns text accepted by parseReport", async () => {
    const github = counting<Parameters<ScanPipeline>, ReturnType<ScanPipeline>>(OK);
    const base = makeDeps();
    const r = await scanRepoImpl(makeDeps({ scan: { ...base.scan, github } }), { repo: "o/r", ref: "main" });
    expect(github.calls[0]![0]).toEqual({ owner: "o", repo: "r", ref: "main" });
    const text = (r.content[0] as { text: string }).text;
    expect(parseReport(text).ok).toBe(true);
  });

  it("scans a local directory", async () => {
    const { memoryProbe } = await import("../test-support/fakes.js");
    const base = makeDeps();
    const local = counting<[string], ScanPipeline>(() => OK);
    const r = await scanRepoImpl(makeDeps({ probe: memoryProbe({ "/work/fx/package.json": "{}" }), scan: { ...base.scan, local } }), { repo: "./fx" });
    expect(local.calls).toEqual([["/work/fx"]]);
    expect(r.isError).toBeFalsy();
  });

  it.each([
    [{ repo: "nope" }, "invalid_repo"],
    [{ repo: "jest" }, "demo_not_found"],
    [{ repo: "jest", ref: "main" }, "invalid_ref"],
    [{ repo: "./missing" }, "path_not_found"],
    [{ repo: 5 }, "invalid_repo"],
  ])("returns a Tool_Error for %j", async (args, code) => {
    const e = errorOf(await scanRepoImpl(makeDeps(), args as never));
    expect(e.error.code).toBe(code);
    expect(ERROR_CODES).toContain(e.error.code);
    expect(e.error.message).not.toBe("");
  });

  it("maps a pipeline error to scan_failed with the pipeline code first", async () => {
    const base = makeDeps();
    const github: ScanPipeline = async () => ({ ok: false, error: { code: "no_package_json", message: "none" } });
    const e = errorOf(await scanRepoImpl(makeDeps({ scan: { ...base.scan, github } }), { repo: "o/r" }));
    expect(e.error).toEqual({ code: "scan_failed", message: "no_package_json: none" });
  });
});
