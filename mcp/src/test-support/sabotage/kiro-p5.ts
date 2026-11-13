import { dirname, resolve } from "node:path";
import { REAL_TOOLS, type Tools } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_TOOLS;

const isOk = (r: { isError?: boolean }): boolean => r.isError !== true;
const firstText = (r: { content: unknown[] }): string => (r.content[0] as { text: string }).text;

export const KIRO_P5_SABOTAGES: Sabotage<Tools>[] = [
  {
    name: "(a) write next to out (a .bak file)",
    impl: {
      ...R,
      generatePinTests: async (d, a) => {
        const r = await R.generatePinTests(d, a);
        if (isOk(r) && typeof a.out === "string") await d.proof.nodeReportFs.writeAtomic(`${resolve(d.cwd, a.out)}.bak`, firstText(r));
        return r;
      },
    },
  },
  {
    name: "(b) write the report when out is absent",
    impl: {
      ...R,
      generatePinTests: async (d, a) => {
        const r = await R.generatePinTests(d, a);
        if (isOk(r) && a.out === undefined) await d.proof.nodeReportFs.writeAtomic(resolve(d.cwd, "proofs/dry-run/report.json"), firstText(r));
        return r;
      },
    },
  },
  {
    name: "(c) write the report to the candidate's directory",
    impl: {
      ...R,
      generatePinTests: async (d, a) => {
        const r = await R.generatePinTests(d, a);
        if (isOk(r) && typeof a.candidate === "string") {
          await d.proof.nodeReportFs.writeAtomic(`${dirname(resolve(d.cwd, a.candidate))}/report.json`, firstText(r));
        }
        return r;
      },
    },
  },
  {
    name: "(d) write the cache under the target directory",
    impl: {
      ...R,
      usageSurface: async (d, a) => {
        const r = await R.usageSurface(d, a);
        if (isOk(r) && typeof a.path === "string") await d.proof.nodeReportFs.writeAtomic(`${resolve(d.cwd, a.path)}/.cache/usage.json`, firstText(r));
        return r;
      },
    },
  },
  {
    name: "(e) accept an out outside a proofs/<name>/ directory",
    impl: {
      ...R,
      generatePinTests: async (d, a) => {
        const r = await R.generatePinTests(d, a);
        if (!isOk(r) && typeof a.out === "string" && firstText(r).includes('"invalid_out"')) {
          await d.proof.nodeReportFs.writeAtomic(resolve(d.cwd, a.out), "{}");
        }
        return r;
      },
    },
  },
  {
    name: "(f) write before the guards run",
    impl: {
      ...R,
      generatePinTests: async (d, a) => {
        if (typeof a.out === "string") await d.proof.nodeReportFs.writeAtomic(resolve(d.cwd, a.out), "{}");
        return R.generatePinTests(d, a);
      },
    },
  },
];
