import { DEMO_REPOS } from "@last-rites/exorcist-npm/programmatic";
import { REAL_SCAN_SOURCE, type ScanSource } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_SCAN_SOURCE.obtainScanReport;

type Asked = { asked?: string[] };

export const KIRO_P7_SABOTAGES: Sabotage<ScanSource>[] = [
  {
    name: "(a) fall back to a live scan on an invalid snapshot",
    impl: {
      obtainScanReport: async (deps, input) => {
        const r = await R(deps, input);
        if (!r.ok && r.code === "demo_invalid") return R(deps, { repo: "o/r" });
        return r;
      },
    },
  },
  {
    name: "(b) serve an unvalidated snapshot",
    impl: {
      obtainScanReport: async (deps, input) => {
        const r = await R(deps, input);
        return !r.ok && r.code === "demo_invalid" ? { ok: true, report: {} as never } : r;
      },
    },
  },
  {
    name: "(c) route owner/repo with a ref to the demo",
    impl: {
      obtainScanReport: (deps, input) => {
        const d = DEMO_REPOS.find((x) => `${x.owner}/${x.repo}` === input.repo);
        return R(deps, d !== undefined && input.ref !== undefined ? { repo: d.name } : input);
      },
    },
  },
  {
    name: "(d) call the pipeline and the store",
    impl: {
      obtainScanReport: async (deps, input) => {
        const r = await R(deps, input);
        if (((deps.demoStore as unknown as Asked).asked ?? []).length > 0) await deps.scan.github({ owner: "o", repo: "r" });
        return r;
      },
    },
  },
  {
    name: "(e) treat a missing snapshot as empty",
    impl: {
      obtainScanReport: async (deps, input) => {
        const r = await R(deps, input);
        return !r.ok && r.code === "demo_not_found" ? { ok: true, report: { dependencies: [], skipped: [] } as never } : r;
      },
    },
  },
];
