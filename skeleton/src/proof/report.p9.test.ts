// Feature: proof-harness, Property 9: Proof_Report codec
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assertProperty } from "../death-score/fc-runner.js";
import { parseProofReport, serializeProofReport, type ParseProofReportOutcome } from "./report.js";
import { proofReportArb } from "./test-support/arbitraries/report.js";
import type { CallSite, ProofAttempt, ProofReport } from "./types.js";

export interface ProofCodec {
  serialize(report: ProofReport): string;
  parse(text: string): ParseProofReportOutcome;
}

export const REAL_PROOF_CODEC: ProofCodec = { serialize: serializeProofReport, parse: parseProofReport };

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fail(msg: string): never {
  throw new Error(msg);
}

function expectRejected(codec: ProofCodec, text: string, label: string, category?: string): ParseProofReportOutcome {
  let out: ParseProofReportOutcome;
  try {
    out = codec.parse(text);
  } catch (e) {
    return fail(`${label}: parse threw ${String(e)}`);
  }
  if (out.ok) fail(`${label}: edited text was accepted`);
  if (category !== undefined && out.error.category !== category) {
    fail(`${label}: expected ${category}, got ${out.error.category} (${out.error.message})`);
  }
  return out;
}

const pretty = (o: unknown): string => JSON.stringify(o, null, 2) + "\n";

/** Required-field paths present in this report: [container path, key, getter of container]. */
function requiredFields(obj: Json): { prefix: string; key: string; at: (root: Json) => Json }[] {
  const out: { prefix: string; key: string; at: (root: Json) => Json }[] = [];
  const add = (prefix: string, keys: string[], at: (root: Json) => Json) => {
    for (const key of keys) out.push({ prefix, key, at });
  };
  add("report.", ["repo", "package", "filesScanned", "callSites", "importSites", "attempts"], (r) => r);
  add("attempts[0].", ["attempt", "status", "weak", "numRuns", "runs", "seed", "shapes", "sabotage"], (r) => r["attempts"][0]);
  add("attempts[0].sabotage.", ["applied", "caught", "survivors"], (r) => r["attempts"][0]["sabotage"]);
  if (obj["callSites"].length > 0) {
    add("callSites[0].", ["file", "line", "column", "callee", "member", "argCount", "argTexts", "enclosing"], (r) => r["callSites"][0]);
  }
  if (obj["importSites"].length > 0) {
    add("importSites[0].", ["file", "line", "column", "form"], (r) => r["importSites"][0]);
  }
  if (obj["attempts"][0]["shapes"].length > 0) {
    add("attempts[0].shapes[0].", ["id", "status", "runs", "coverage"], (r) => r["attempts"][0]["shapes"][0]);
  }
  return out;
}

const WRONG: { prefix: string; key: string; value: unknown; at: (r: Json) => Json }[] = [
  { prefix: "report.", key: "repo", value: 5, at: (r) => r },
  { prefix: "report.", key: "filesScanned", value: "x", at: (r) => r },
  { prefix: "report.", key: "callSites", value: {}, at: (r) => r },
  { prefix: "report.", key: "attempts", value: null, at: (r) => r },
  { prefix: "attempts[0].", key: "weak", value: 1, at: (r) => r["attempts"][0] },
  { prefix: "attempts[0].", key: "seed", value: 1.5, at: (r) => r["attempts"][0] },
  { prefix: "attempts[0].", key: "runs", value: -0, at: (r) => r["attempts"][0] },
  { prefix: "attempts[0].", key: "status", value: "nope", at: (r) => r["attempts"][0] },
];

/** Break exactly one Requirement 9.7 rule, starting from a clean one-attempt report. */
function inconsistentVariants(r: ProofReport): { name: string; report: ProofReport }[] {
  const site: CallSite = {
    file: "a.js", line: 1, column: 1, callee: "x", member: "", argCount: 0, argTexts: [], enclosing: "src",
  };
  const cleanAttempt = (): ProofAttempt => ({
    attempt: 1,
    status: "error",
    weak: false,
    numRuns: 100,
    runs: 0,
    seed: 1,
    shapes: [],
    error: { code: "recipe_failure", message: "m" },
    sabotage: { applied: 0, caught: 0, survivors: [] },
  });
  const make = (callSites: CallSite[], edit: (a: ProofAttempt) => void) => {
    const a = cleanAttempt();
    edit(a);
    return { ...r, callSites, attempts: [a] };
  };
  const ce = { shape: "s", input: "i", shrinks: 0, path: "p", oldOutput: "o", newOutput: "n", oldProjected: "o", newProjected: "n" };
  const sites = r.callSites.length > 0 ? r.callSites : [site];
  const otherRec = r.importSites.length === 0 ? "review-imports" : "remove-dependency";
  return [
    { name: "attempt number", report: make(sites, (a) => { a.attempt = 2; }) },
    { name: "counterexample status without record", report: make(sites, (a) => { a.status = "counterexample"; delete a.error; }) },
    { name: "record without counterexample status", report: make(sites, (a) => { a.counterexample = ce; }) },
    { name: "error status without error", report: make(sites, (a) => { delete a.error; }) },
    { name: "error present on non-error status", report: make(sites, (a) => { a.status = "counterexample"; a.counterexample = ce; }) },
    { name: "proved with zero call sites", report: make([], (a) => { a.status = "proved"; a.weak = true; delete a.error; }) },
    { name: "no-call-sites with call sites", report: make(sites, (a) => { a.status = "no-call-sites"; a.recommendation = "review-imports"; delete a.error; }) },
    { name: "no-call-sites without recommendation", report: make([], (a) => { a.status = "no-call-sites"; delete a.error; }) },
    { name: "wrong recommendation", report: make([], (a) => { a.status = "no-call-sites"; a.recommendation = otherRec; delete a.error; }) },
    { name: "weak mismatch", report: make(sites, (a) => { a.status = "proved"; a.weak = true; a.sabotage = { applied: 3, caught: 3, survivors: [] }; delete a.error; }) },
    { name: "applied mismatch", report: make(sites, (a) => { a.status = "proved"; a.weak = false; a.sabotage = { applied: 4, caught: 2, survivors: ["x"] }; delete a.error; }) },
    { name: "sabotage on non-proved", report: make(sites, (a) => { a.sabotage = { applied: 1, caught: 1, survivors: [] }; }) },
  ];
}

export function build(codec: ProofCodec = REAL_PROOF_CODEC) {
  return fc.property(
    proofReportArb,
    fc.nat(),
    fc.string({ maxLength: 40 }),
    (report, k, junk) => {
      const text = codec.serialize(report);

      // Round trip and canonical re-serialization.
      const back = codec.parse(text);
      if (!back.ok) fail(`own output rejected: ${back.error.category}: ${back.error.message}`);
      expect(back.report).toEqual(report); // deep equality, key order irrelevant
      if (codec.serialize(back.report) !== text) fail("re-serialization differs from the text");

      // Single edits that keep valid JSON.
      const obj = JSON.parse(text) as Json;
      expectRejected(codec, JSON.stringify(obj), "compact whitespace", "not_canonical");
      expectRejected(codec, text.slice(0, -1), "no trailing newline", "not_canonical");
      expectRejected(codec, text + "\n", "extra trailing newline", "not_canonical");
      expectRejected(codec, text.replace(/\n {2}"filesScanned": (\d+)/, "\n  \"filesScanned\": $1.0"), "1.0 integer", "not_canonical");
      const reversed: Json = {};
      for (const key of Object.keys(obj).reverse()) reversed[key] = obj[key];
      expectRejected(codec, pretty(reversed), "key order", "not_canonical");
      expectRejected(codec, pretty({ ...obj, extra: 1 }), "extra key", "wrong_type");
      const nested = JSON.parse(text) as Json;
      nested["attempts"][0]["sabotage"]["extra"] = 1;
      expectRejected(codec, pretty(nested), "extra nested key", "wrong_type");

      // Missing field names its path.
      const fields = requiredFields(obj);
      const f = fields[k % fields.length]!;
      const cut = JSON.parse(text) as Json;
      delete f.at(cut)[f.key];
      const miss = expectRejected(codec, pretty(cut), `missing ${f.prefix}${f.key}`, "missing_field");
      if (!miss.ok && !miss.error.message.includes(`${f.prefix}${f.key}`)) {
        fail(`missing_field message "${miss.error.message}" does not name ${f.prefix}${f.key}`);
      }

      // Wrong type names its path.
      const w = WRONG[k % WRONG.length]!;
      const wrong = JSON.parse(text) as Json;
      w.at(wrong)[w.key] = w.value;
      const wt = Object.is(w.value, -0) ? text.replace(/\n {6}"runs": (\d+)/, "\n      \"runs\": -0") : pretty(wrong);
      const wr = expectRejected(codec, wt, `wrong type ${w.prefix}${w.key}`, "wrong_type");
      if (!wr.ok && !wr.error.message.includes(`${w.prefix === "report." ? "" : w.prefix}${w.key}`)) {
        fail(`wrong_type message "${wr.error.message}" does not name ${w.prefix}${w.key}`);
      }

      // Each consistency rule broken alone.
      for (const v of inconsistentVariants(report)) {
        expectRejected(codec, codec.serialize(v.report), `inconsistent: ${v.name}`, "inconsistent");
      }

      // Never throws, never accepts garbage.
      const hostile = [
        junk,
        "",
        "   ",
        "null",
        "[]",
        "{}",
        '{"__proto__":{"a":1}}',
        '{"repo":"x","__proto__":{}}',
        "[".repeat(5000),
        "1e999",
        '{"filesScanned":1e999}',
        text.slice(0, k % (text.length + 1)),
        text.slice(0, k % (text.length + 1)) + junk,
      ];
      for (const h of hostile) {
        let out: ParseProofReportOutcome;
        try {
          out = codec.parse(h);
        } catch (e) {
          return fail(`parse threw on ${JSON.stringify(h.slice(0, 40))}: ${String(e)}`);
        }
        if (out.ok && h !== text) fail(`accepted hostile text ${JSON.stringify(h.slice(0, 40))}`);
      }
      const empty = codec.parse("");
      if (empty.ok || empty.error.category !== "empty") fail("empty text must give category empty");
      const bad = codec.parse("{nope");
      if (bad.ok || bad.error.category !== "invalid_json") fail("bad JSON must give invalid_json");
    },
  );
}

describe("Property 9: Proof_Report codec", () => {
  it("round trips, stays canonical and rejects every single edit", () => {
    assertProperty("proof report codec", build(REAL_PROOF_CODEC));
  });
});
