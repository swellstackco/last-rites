import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { safely } from "../../result.js";
import { REAL_TOTAL, type TotalTools } from "../validators.js";
import type { Sabotage } from "../sabotage-runner.js";

const R = REAL_TOTAL;

const raw = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error: { code: "internal_error", message } }) }],
});

/** A `safely` that handles a throw as `onThrow` says, and otherwise behaves like the real one. */
const safelyWith =
  (onThrow: (e: unknown) => CallToolResult): TotalTools["safely"] =>
  async (handler) => {
    try {
      return await safely(async () => {
        const r = await handler();
        return r;
      }).then(async (r) => {
        // The real `safely` has already turned a throw into the fixed error; run again to see the raw throw.
        if (r.isError === true && (r.content[0] as { text: string }).text.includes("unexpected error")) {
          try {
            await handler();
          } catch (e) {
            return onThrow(e);
          }
        }
        return r;
      });
    } catch (e) {
      return onThrow(e);
    }
  };

const emptyUsage = (pkg: string) => ({ package: pkg, filesScanned: 0, callSites: [], importSites: [], warnings: [] });

export const KIRO_P4_SABOTAGES: Sabotage<TotalTools>[] = [
  {
    name: "(a) forward err.message into the error",
    impl: { ...R, safely: safelyWith((e) => raw(String((e as Error)?.message))) },
  },
  {
    name: "(b) rethrow from the handler",
    impl: {
      ...R,
      safely: async (handler) => {
        const r = await safely(handler);
        if (r.isError === true && (r.content[0] as { text: string }).text.includes("unexpected error")) await handler();
        return r;
      },
    },
  },
  {
    name: "(c) include the stack in the message",
    impl: { ...R, safely: safelyWith((e) => raw(String((e as Error)?.stack))) },
  },
  {
    name: "(d) treat undefined from a Dep as success",
    impl: {
      ...R,
      tools: {
        ...R.tools,
        usageSurface: (d, a) =>
          R.tools.usageSurface({ ...d, usageSurface: async (i) => (await d.usageSurface(i)) ?? emptyUsage(i.package) } as typeof d, a),
        findReplacement: (d, a) =>
          R.tools.findReplacement({ ...d, e18e: async (n) => (await d.e18e(n)) ?? { ok: true, value: { known: false, sourceUrl: "https://example.test/x" } } } as typeof d, a),
      },
    },
  },
  {
    name: "(e) no timeout on a hung pipeline",
    impl: {
      ...R,
      tools: {
        ...R.tools,
        scanRepo: (d, a) => R.tools.scanRepo({ ...d, scan: { ...d.scan, watchdog: () => ({ fired: new Promise<void>(() => {}), dispose() {} }) } } as typeof d, a),
        deathReport: (d, a) => R.tools.deathReport({ ...d, scan: { ...d.scan, watchdog: () => ({ fired: new Promise<void>(() => {}), dispose() {} }) } } as typeof d, a),
      },
    },
  },
  {
    name: "(f) an empty message for internal_error",
    impl: { ...R, safely: safelyWith(() => raw("")) },
  },
];
