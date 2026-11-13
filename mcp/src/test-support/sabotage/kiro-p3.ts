import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { REAL_TOOLS, type Tools } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_TOOLS;

const text0 = (r: CallToolResult): string => (r.content[0] as { text: string }).text;
const ok = (r: CallToolResult): boolean => r.isError !== true;
const withText = (r: CallToolResult, t: string): CallToolResult => ({ ...r, content: [{ type: "text", text: t }, ...r.content.slice(1)] });
/** Rewrites the first text item as JSON; error results pass through untouched. */
const editJson = (r: CallToolResult, edit: (j: Record<string, unknown>) => void): CallToolResult => {
  if (!ok(r)) return r;
  const j = JSON.parse(text0(r)) as Record<string, unknown>;
  edit(j);
  return withText(r, JSON.stringify(j));
};

export const KIRO_P3_SABOTAGES: Sabotage<Tools>[] = [
  {
    name: "(a) add a field the wrapped code does not return",
    impl: { ...R, findReplacement: async (d, a) => editJson(await R.findReplacement(d, a), (j) => void (j["source"] = "mcp")) },
  },
  {
    name: "(b) sort the dependencies differently",
    impl: {
      ...R,
      scanRepo: async (d, a) => editJson(await R.scanRepo(d, a), (j) => void (j["dependencies"] = [...(j["dependencies"] as unknown[])].reverse())),
    },
  },
  {
    name: "(c) call the pipeline twice",
    impl: {
      ...R,
      scanRepo: async (d, a) => {
        const first = await R.scanRepo(d, a);
        await R.scanRepo(d, a);
        return first;
      },
    },
  },
  {
    name: "(d) generate_pin_tests with a different default seed",
    impl: {
      ...R,
      generatePinTests: async (d, a) =>
        editJson(await R.generatePinTests(d, a), (j) => {
          for (const at of (j["attempts"] as Array<Record<string, unknown>>) ?? []) at["seed"] = 1;
        }),
    },
  },
  {
    name: "(e) ignore the ref",
    impl: { ...R, scanRepo: (d, a) => R.scanRepo(d, { repo: a.repo }) },
  },
  {
    name: "(f) usage_surface drops importSites",
    impl: { ...R, usageSurface: async (d, a) => editJson(await R.usageSurface(d, a), (j) => void (j["importSites"] = [])) },
  },
  {
    name: "(g) find_replacement calls the evidence stage instead of fetchE18e",
    impl: {
      ...R,
      findReplacement: (d, a) => R.findReplacement({ ...d, e18e: async () => ({ ok: true, value: { known: false, sourceUrl: "https://example.test/x" } }) } as typeof d, a),
    },
  },
];
