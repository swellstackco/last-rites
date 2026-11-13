import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { REAL_TOOLS, type Tools } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_TOOLS;

const text0 = (r: CallToolResult): string => (r.content[0] as { text: string }).text;
const withText = (r: CallToolResult, t: string): CallToolResult => ({ ...r, content: [{ type: "text", text: t }, ...r.content.slice(1)] });
const ok = (r: CallToolResult): boolean => r.isError !== true;

export const KIRO_P2_SABOTAGES: Sabotage<Tools>[] = [
  {
    name: "(a) a tool that returns non-canonical JSON",
    impl: {
      ...R,
      scanRepo: async (d, a) => {
        const r = await R.scanRepo(d, a);
        return ok(r) ? withText(r, JSON.stringify(JSON.parse(text0(r)), null, 4)) : r;
      },
    },
  },
  {
    name: "(b) death_report returns the dependency object instead of a report",
    impl: {
      ...R,
      deathReport: async (d, a) => {
        const r = await R.deathReport(d, a);
        return ok(r) ? withText(r, JSON.stringify((JSON.parse(text0(r)) as { dependencies: unknown[] }).dependencies[0])) : r;
      },
    },
  },
  {
    name: "(c) usage_surface leaves attempts out",
    impl: {
      ...R,
      usageSurface: async (d, a) => {
        const r = await R.usageSurface(d, a);
        if (!ok(r)) return r;
        const j = JSON.parse(text0(r)) as Record<string, unknown>;
        delete j["attempts"];
        return withText(r, JSON.stringify(j));
      },
    },
  },
  {
    name: "(d) find_replacement reports replacement null",
    impl: {
      ...R,
      findReplacement: async (d, a) => {
        const r = await R.findReplacement(d, a);
        if (!ok(r)) return r;
        const j = JSON.parse(text0(r)) as { replacement: unknown };
        return withText(r, JSON.stringify({ ...j, replacement: j.replacement === "none" ? null : j.replacement }));
      },
    },
  },
  {
    name: "(e) an error result without isError",
    impl: {
      ...R,
      scanRepo: async (d, a) => {
        const r = await R.scanRepo(d, a);
        if (ok(r)) return r;
        const { isError: _drop, ...rest } = r;
        return rest;
      },
    },
  },
  {
    name: "(f) death_report keeps the whole summary of the original report",
    impl: {
      ...R,
      deathReport: async (d, a) => {
        const r = await R.deathReport(d, a);
        if (!ok(r)) return r;
        const full = await R.scanRepo(d, { repo: a.repo });
        if (!ok(full)) return r;
        const j = JSON.parse(text0(r)) as Record<string, unknown>;
        j["summary"] = (JSON.parse(text0(full)) as { summary: unknown }).summary;
        return withText(r, JSON.stringify(j));
      },
    },
  },
];
