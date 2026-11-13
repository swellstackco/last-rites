// Sabotage_List for Property 9 (Proof_Report codec). Each entry is a deliberately wrong codec.
import type { ProofCodec } from "../../report.p9.test.js";
import { parseProofReport, parseProofReportWith, serializeProofReport } from "../../report.js";
import type { ParseProofReportOutcome } from "../../report.js";
import type { ProofReport } from "../../types.js";
import type { Sabotage } from "../../../graveyard/test-support/sabotage-runner.js";

export const P9_REQUIRED = [
  "four-space indent",
  "no trailing newline",
  "key order taken from the input",
  "absent optional field written as null",
  "lenient parse that skips the canonical comparison",
  "skips the consistency check",
  "parse throws on empty text",
  "parse fills a missing field",
  "accepts an unknown key",
] as const;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const real: ProofCodec = { serialize: serializeProofReport, parse: parseProofReport };

/** Real text re-rendered by a different JSON.stringify call. */
const restring = (r: ProofReport, indent: number, newline: boolean): string =>
  JSON.stringify(JSON.parse(serializeProofReport(r)), null, indent) + (newline ? "\n" : "");

/** Follow a path such as "attempts[0].sabotage.extra" and return [container, last key]. */
function locate(root: Json, path: string): [Json, string] | undefined {
  const parts = path.replace(/^report\./, "").replace(/\[(\d+)\]/g, ".$1").split(".");
  let cur: Json = root;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    if (typeof next !== "object" || next === null) return undefined;
    cur = next;
  }
  return [cur, parts[parts.length - 1]!];
}

const DEFAULT_BY_KEY: Record<string, unknown> = {
  repo: "", package: "", filesScanned: 0, callSites: [], importSites: [], attempts: [], file: "", line: 0,
  column: 0, callee: "", member: "", argCount: 0, argTexts: [], enclosing: "src", form: "require", attempt: 1,
  status: "error", weak: false, numRuns: 100, runs: 0, seed: 0, shapes: [], id: "", coverage: {},
  sabotage: { applied: 0, caught: 0, survivors: [] }, applied: 0, caught: 0, survivors: [],
};

/** Strict parse that repairs the JSON when the strict parser complains. */
function repairing(
  fix: (json: Json, message: string) => boolean,
  match: RegExp,
): ProofCodec["parse"] {
  const repaired = { consistency: true, canonical: false };
  return (text) => {
    // Strict first, so only the repaired path loses the canonical comparison.
    let out: ParseProofReportOutcome = parseProofReport(text);
    let json: Json | undefined;
    try {
      json = JSON.parse(text) as Json;
    } catch {
      return out;
    }
    for (let i = 0; i < 40 && !out.ok && match.test(out.error.message); i++) {
      if (!fix(json, out.error.message)) break;
      out = parseProofReportWith(JSON.stringify(json), repaired);
    }
    return out;
  };
}

export const P9_SABOTAGES: readonly Sabotage<ProofCodec>[] = [
  { name: "four-space indent", impl: { ...real, serialize: (r) => restring(r, 4, true) } },
  { name: "no trailing newline", impl: { ...real, serialize: (r) => restring(r, 2, false) } },
  {
    name: "key order taken from the input",
    impl: { ...real, serialize: (r) => JSON.stringify(r, null, 2) + "\n" },
  },
  {
    name: "absent optional field written as null",
    impl: {
      ...real,
      serialize: (r) => {
        const o = JSON.parse(serializeProofReport(r)) as Json;
        const out: Json = { repo: o["repo"], commit: o["commit"] ?? null, package: o["package"] };
        out["oracleVersion"] = o["oracleVersion"] ?? null;
        for (const k of ["filesScanned", "callSites", "importSites", "attempts"]) out[k] = o[k];
        return JSON.stringify(out, null, 2) + "\n";
      },
    },
  },
  {
    name: "lenient parse that skips the canonical comparison",
    impl: { ...real, parse: (text) => parseProofReportWith(text, { consistency: true, canonical: false }) },
  },
  {
    name: "skips the consistency check",
    impl: { ...real, parse: (text) => parseProofReportWith(text, { consistency: false, canonical: true }) },
  },
  {
    name: "parse throws on empty text",
    impl: {
      ...real,
      parse: (text) => {
        if (text.trim() === "") throw new Error("empty report");
        return parseProofReport(text);
      },
    },
  },
  {
    name: "parse fills a missing field",
    impl: {
      ...real,
      parse: repairing((json, message) => {
        const m = /^(.*) is missing$/.exec(message);
        const loc = m ? locate(json, m[1]!) : undefined;
        if (!loc || !(loc[1] in DEFAULT_BY_KEY)) return false;
        loc[0][loc[1]] = structuredClone(DEFAULT_BY_KEY[loc[1]]);
        return true;
      }, / is missing$/),
    },
  },
  {
    name: "accepts an unknown key",
    impl: {
      ...real,
      parse: repairing((json, message) => {
        const m = /^(.*) is not a known key$/.exec(message);
        const loc = m ? locate(json, m[1]!) : undefined;
        if (!loc) return false;
        delete loc[0][loc[1]];
        return true;
      }, / is not a known key$/),
    },
  },
];
