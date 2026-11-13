import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { REAL_CODEC } from "../../report.js";
import type { ReportCodec } from "../../report.js";
import type { ScanReport } from "../../types.js";

type Json = Record<string, unknown>;

/** Real codec with `serialize` post-processed on the parsed JSON of its own output. */
function viaJson(edit: (o: Json) => Json, tail = "\n", indent = 2): ReportCodec {
  return {
    ...REAL_CODEC,
    serialize: (r) => JSON.stringify(edit(JSON.parse(REAL_CODEC.serialize(r)) as Json), null, indent) + tail,
  };
}

const mapDeps = (o: Json, f: (d: Json) => Json): Json => ({ ...o, dependencies: (o["dependencies"] as Json[]).map(f) });

export const SCAN_P6_SABOTAGES: ReadonlyArray<Sabotage<ReportCodec>> = [
  { name: "four-space indent", impl: viaJson((o) => o, "\n", 4) },
  { name: "no trailing newline", impl: viaJson((o) => o, "") },
  {
    name: "input key order",
    impl: { ...REAL_CODEC, serialize: (r: ScanReport) => JSON.stringify(r, null, 2) + "\n" },
  },
  {
    name: "drop resolvedVersion",
    impl: viaJson((o) =>
      mapDeps(o, (d) => {
        const { resolvedVersion: _drop, ...rest } = d;
        return rest;
      }),
    ),
  },
  {
    name: "sort dependencies on serialize",
    impl: viaJson((o) => ({
      ...o,
      dependencies: [...(o["dependencies"] as Json[])].sort((a, b) =>
        (a["name"] as string) < (b["name"] as string) ? -1 : (a["name"] as string) > (b["name"] as string) ? 1 : 0,
      ),
    })),
  },
  {
    name: "absent optional as null",
    impl: viaJson((o) =>
      mapDeps(o, (d) => ({ ...d, resolvedVersion: d["resolvedVersion"] ?? null, replacement: d["replacement"] ?? null })),
    ),
  },
  {
    name: "lenient parse without canonical comparison",
    impl: {
      ...REAL_CODEC,
      parse: (text) => {
        const r = REAL_CODEC.parse(text);
        if (r.ok || r.error.category !== "not_canonical") return r;
        return { ok: true, report: JSON.parse(text) as ScanReport };
      },
    },
  },
  {
    name: "parse throws on empty text",
    impl: {
      ...REAL_CODEC,
      parse: (text) => {
        if (text.trim() === "") throw new Error("empty");
        return REAL_CODEC.parse(text);
      },
    },
  },
  {
    name: "parse fills a missing field",
    impl: {
      ...REAL_CODEC,
      parse: (text) => {
        const r = REAL_CODEC.parse(text);
        if (r.ok || r.error.category !== "missing_field") return r;
        try {
          const o = JSON.parse(text) as Json;
          const filled = { repo: "", ref: "", scannedAt: "", dependencies: [], skipped: [], warnings: [], ...o, summary: o["summary"] ?? { total: 0, skipped: 0, alive: 0, ailing: 0, dying: 0, dead: 0 } };
          return REAL_CODEC.parse(JSON.stringify(filled, null, 2) + "\n");
        } catch {
          return r;
        }
      },
    },
  },
  {
    name: "omit an empty sourceUrls",
    impl: viaJson((o) =>
      mapDeps(o, (d) => {
        const signals = d["signals"] as Json;
        const urls = signals["sourceUrls"] as Json | undefined;
        if (urls && Object.keys(urls).length === 0) {
          const { sourceUrls: _drop, ...rest } = signals;
          return { ...d, signals: rest };
        }
        return d;
      }),
    ),
  },
];
