import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { REAL_TOOLS, type Tools } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_TOOLS;

const ok = (r: CallToolResult): boolean => r.isError !== true;
const text = (r: CallToolResult, i: number): string => (r.content[i] as { text: string }).text;
const editFirst = (r: CallToolResult, edit: (j: Record<string, unknown>) => void): CallToolResult => {
  if (!ok(r)) return r;
  const j = JSON.parse(text(r, 0)) as Record<string, unknown>;
  edit(j);
  return { ...r, content: [{ type: "text", text: JSON.stringify(j) }, ...r.content.slice(1)] };
};
const shuffle = <T>(xs: T[]): T[] => [...xs].sort(() => Math.random() - 0.5);

export const KIRO_P6_SABOTAGES: Sabotage<Tools>[] = [
  {
    name: "(a) put Date.now() in the usage_surface report",
    impl: { ...R, usageSurface: async (d, a) => editFirst(await R.usageSurface(d, a), (j) => void (j["generatedAt"] = Date.now())) },
  },
  {
    name: "(b) put the resolved absolute path in the repo label",
    impl: { ...R, usageSurface: async (d, a) => editFirst(await R.usageSurface(d, a), (j) => void (j["repo"] = resolve(d.cwd, String(a.path)))) },
  },
  {
    name: "(c) use a random seed for generate_pin_tests",
    impl: {
      ...R,
      generatePinTests: async (d, a) =>
        editFirst(await R.generatePinTests(d, a), (j) => {
          for (const at of (j["attempts"] as Array<Record<string, unknown>>) ?? []) at["seed"] = Math.floor(Math.random() * 1e9);
        }),
    },
  },
  {
    name: "(d) list warnings in the order of a shuffled input",
    impl: {
      ...R,
      usageSurface: async (d, a) => {
        const r = await R.usageSurface(d, a);
        if (!ok(r) || r.content.length < 2) return r;
        const w = JSON.parse(text(r, 1)) as { warnings: string[] };
        return { ...r, content: [r.content[0]!, { type: "text", text: JSON.stringify({ warnings: shuffle(w.warnings) }) }] };
      },
    },
  },
  {
    name: "(e) add a random request id to the output",
    impl: { ...R, findReplacement: async (d, a) => editFirst(await R.findReplacement(d, a), (j) => void (j["requestId"] = Math.random().toString(36))) },
  },
];
