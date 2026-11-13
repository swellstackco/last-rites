import { REAL_HOOK_FORMAT, type HookFormat } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_HOOK_FORMAT;

export const KIRO_P12_SABOTAGES: Sabotage<HookFormat>[] = [
  {
    name: "(a) report PASS when only the tests passed",
    impl: { ...R, formatStopSummary: (tc, tests) => (tests.code === 0 ? "check: PASS" : R.formatStopSummary(tc, tests)) },
  },
  {
    name: "(b) show the head of the output instead of the tail",
    impl: {
      ...R,
      formatStopSummary: (tc, tests) => {
        if (tc.code === 0 && tests.code === 0) return "check: PASS";
        const sec = (label: string, s: { code: number; output: string }) =>
          s.code === 0 ? [] : [`${label} failed (exit ${s.code})`, ...s.output.split("\n").slice(0, 5).map((l) => `> ${l.slice(0, 198)}`)];
        return ["check: FAIL", ...sec("typecheck", tc), ...sec("tests", tests)].join("\n").slice(0, 4000);
      },
    },
  },
  {
    name: "(c) no length cap",
    impl: {
      ...R,
      formatStopSummary: (tc, tests) => {
        if (tc.code === 0 && tests.code === 0) return "check: PASS";
        const sec = (label: string, s: { code: number; output: string }) =>
          s.code === 0 ? [] : [`${label} failed (exit ${s.code})`, ...s.output.split("\n").map((l) => `> ${l}`)];
        return ["check: FAIL", ...sec("typecheck", tc), ...sec("tests", tests)].join("\n");
      },
    },
  },
  {
    name: "(d) a local-time date in the fired line",
    impl: {
      ...R,
      formatFiredLine: (now, id, outcome) => {
        const base = R.formatFiredLine(now, id, outcome);
        if (base === undefined) return undefined;
        const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}.${String(now.getMilliseconds()).padStart(3, "0")}`;
        return `${local} ${id} ${outcome}`;
      },
    },
  },
  {
    name: "(e) print a section for a passing step",
    impl: {
      ...R,
      formatStopSummary: (tc, tests) => {
        const text = R.formatStopSummary(tc, tests);
        if (text === "check: PASS") return text;
        return tc.code === 0 ? `${text}\ntypecheck failed (exit 0)` : tests.code === 0 ? `${text}\ntests failed (exit 0)` : text;
      },
    },
  },
];
