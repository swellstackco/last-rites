// Feature: proof-harness, Property 11: Proof names, paths and CLI arguments
import { isProofName, parseProofReportPath, proofReportPath } from "@graveyard-kit/skeleton/proof";
import fc from "fast-check";
import { describe, it } from "vitest";
import { assertProperty } from "../evidence/test-support/fc-runner.js";
import { parseCliArgs, type CliParse } from "./cli-args.js";

/** The seam under test. */
export interface NamesCliImpl {
  isProofName(s: string): boolean;
  proofReportPath(repo: string, pkg: string): string | undefined;
  parseProofReportPath(path: string): { repo: string; package: string } | undefined;
  parseCliArgs(argv: readonly string[]): CliParse;
}

export const REAL_NAMES_CLI: NamesCliImpl = { isProofName, proofReportPath, parseProofReportPath, parseCliArgs };

// The pattern of the spec, written again here on purpose (not imported).
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

const fail = (msg: string): never => {
  throw new Error(msg);
};

const nameChars = fc.constantFrom(..."abcxyz019-".split(""), "A", "Z", ".", "_", "/", "%", " ", "é", "\\");
/** Mostly name-shaped strings, with length around the 64 limit and the odd bad character. */
const nameLike = fc.oneof(
  fc.stringOf(nameChars, { minLength: 0, maxLength: 8 }),
  fc.integer({ min: 62, max: 66 }).map((n) => "a".repeat(n)),
  fc.integer({ min: 62, max: 66 }).map((n) => "a" + "-".repeat(n - 1)),
  fc.stringOf(fc.constantFrom(..."abc-09".split("")), { minLength: 1, maxLength: 20 }),
  fc.constantFrom("", "-x", "x-", "..", ".", "a/b", "%2e", "A", "a.b", "ünï", "0", "-"),
  fc.string({ maxLength: 12 }),
);

// ---- the structured CLI model ------------------------------------------------------------------------------------

type State = "absent" | "valid" | "invalid" | "missing" | "dup";
interface Spec {
  flag: string;
  state: State;
  valid: string;
  invalid: string;
  /** Required flags make the parse fail when absent. */
  required: boolean;
  /** Does this flag's value make a parse fail when it is `invalid`? */
  checked: boolean;
}

const stateArb = (states: readonly State[]): fc.Arbitrary<State> => fc.constantFrom(...states);
const ANY: readonly State[] = ["absent", "valid", "valid", "valid", "invalid", "missing", "dup"];
const FREE: readonly State[] = ["absent", "valid", "valid", "missing", "dup"];

const runsValid = fc.oneof(
  fc.constantFrom(100, 101, 200, 99999, 100000),
  fc.integer({ min: 100, max: 100000 }),
).map(String);
const RUNS_BAD = ["99", "0", "1e3", "100001", "-1", "1.5", "abc", "2e2", "1000000", "0x64"];
const runsInvalid = fc.constantFrom(...RUNS_BAD);
const seedValid = fc.oneof(fc.constantFrom(0, 1, 20261113, 2147483647), fc.nat({ max: 2 ** 31 })).map(String);
const SEED_BAD = ["-1", "-0", "1.5", "1e3", "abc", "0x10", "99999999999999999999"];
const seedInvalid = fc.constantFrom(...SEED_BAD);
const pkgValid = fc.constantFrom("intersect", "deep-diff", "node-abort-controller", "a", "0", "a".repeat(64));
const PKG_BAD = ["Intersect", "a.b", "@babel/core", "a".repeat(65), "-x", "a_b", "a b"];
const pkgInvalid = fc.constantFrom(...PKG_BAD);
const outValid = fc
  .tuple(fc.constantFrom("", "demo/", "/tmp/x/", "../a/b/"), nameLike.filter((n) => NAME.test(n)), fc.constantFrom("a.json", "intersect.json", "x"))
  .map(([pre, dir, file]) => `${pre}proofs/${dir}/${file}`);
const OUT_BAD = [
  "x.json", "proofs/x.json", "demo/other/parse-server/a.json", "demo/proofs/Parse/a.json", "demo/proofs/a.b/a.json",
  "demo/proofs/parse-server/", "demo/proofs//a.json", "proofs/" + "a".repeat(65) + "/a.json", "demo/proofs/-x/a.json",
];
const outInvalid = fc.constantFrom(...OUT_BAD);

interface Scenario {
  specs: Spec[];
  freshState: "absent" | "present" | "dup";
  unknown: string[];
  order: number[];
}

const scenarioArb: fc.Arbitrary<Scenario> = fc
  .tuple(
    stateArb(["absent", "valid", "valid", "valid", "valid", "missing", "dup"]), // repo
    stateArb(["absent", "valid", "valid", "valid", "valid", "invalid", "missing", "dup"]), // package
    stateArb(FREE), // candidate
    stateArb(ANY), // runs
    stateArb(ANY), // seed
    stateArb(ANY), // out
    stateArb(FREE), // label
    stateArb(FREE), // commit
    fc.constantFrom<"absent" | "present" | "dup">("absent", "present", "present", "dup"),
    fc.array(fc.constantFrom("--nope", "--Repo", "--runs=5", "--fresh=1"), { maxLength: 1 }),
    runsValid, runsInvalid, seedValid, seedInvalid, pkgValid, pkgInvalid, outValid, outInvalid,
    fc.array(fc.nat(), { minLength: 12, maxLength: 12 }),
  )
  .map(([repo, pkg, cand, runs, seed, out, label, commit, fresh, unknown, rv, ri, sv, si, pv, pi, ov, oi, order]) => ({
    specs: [
      { flag: "--repo", state: repo, valid: "../some repo", invalid: "", required: true, checked: false },
      { flag: "--package", state: pkg, valid: pv, invalid: pi, required: true, checked: true },
      { flag: "--candidate", state: cand, valid: "cand.js", invalid: "", required: false, checked: false },
      { flag: "--runs", state: runs, valid: rv, invalid: ri, required: false, checked: true },
      { flag: "--seed", state: seed, valid: sv, invalid: si, required: false, checked: true },
      { flag: "--out", state: out, valid: ov, invalid: oi, required: false, checked: true },
      { flag: "--label", state: label, valid: "o/Repo", invalid: "", required: false, checked: false },
      { flag: "--commit", state: commit, valid: "abc123", invalid: "", required: false, checked: false },
    ],
    freshState: fresh,
    unknown,
    order,
  }));

function argvOf(s: Scenario): string[] {
  const groups: string[][] = [];
  for (const sp of s.specs) {
    const v = sp.state === "invalid" ? sp.invalid : sp.valid;
    if (sp.state === "valid" || sp.state === "invalid") groups.push([sp.flag, v]);
    else if (sp.state === "missing") groups.push([sp.flag]);
    else if (sp.state === "dup") groups.push([sp.flag, sp.valid, sp.flag, sp.valid]);
  }
  if (s.freshState === "present") groups.push(["--fresh"]);
  if (s.freshState === "dup") groups.push(["--fresh", "--fresh"]);
  for (const u of s.unknown) groups.push([u]);
  const keyed = groups.map((g, i) => ({ g, k: s.order[i % s.order.length]! }));
  keyed.sort((a, b) => a.k - b.k);
  return keyed.flatMap((x) => x.g);
}

/** Every group starts with a `--flag`, so a flag in the `missing` state is always followed by a flag or the end. */
function expectedOk(s: Scenario): boolean {
  if (s.unknown.length > 0 || s.freshState === "dup") return false;
  for (const sp of s.specs) {
    if (sp.state === "dup" || sp.state === "missing") return false;
    if (sp.required && sp.state === "absent") return false;
    if (sp.state === "invalid") return false;
  }
  return true;
}

function checkScenario(impl: NamesCliImpl, s: Scenario): void {
  const argv = argvOf(s);
  const label = JSON.stringify(argv);
  let out: CliParse;
  try {
    out = impl.parseCliArgs(argv);
  } catch (e) {
    return fail(`parseCliArgs threw on ${label}: ${String(e)}`);
  }
  const want = expectedOk(s);
  if (out.ok !== want) fail(`parseCliArgs(${label}) ok=${out.ok}, expected ${want}${out.ok ? "" : ` (${out.message})`}`);
  if (!out.ok) return;
  const a = out.args;
  const val = (flag: string): string | undefined => s.specs.find((x) => x.flag === flag && x.state === "valid")?.valid;
  const expect = (what: string, got: unknown, exp: unknown): void => {
    if (got !== exp) fail(`${label}: ${what} is ${JSON.stringify(got)}, expected ${JSON.stringify(exp)}`);
  };
  expect("repo", a.repo, val("--repo"));
  expect("package", a.package, val("--package"));
  expect("candidate", a.candidate, val("--candidate"));
  expect("runs", a.runs, val("--runs") === undefined ? 200 : Number(val("--runs")));
  expect("seed", a.seed, val("--seed") === undefined ? 20261113 : Number(val("--seed")));
  expect("out", a.out, val("--out"));
  expect("label", a.label, val("--label"));
  expect("commit", a.commit, val("--commit"));
  expect("fresh", a.fresh, s.freshState === "present");
  for (const key of Object.keys(a)) {
    if (!["repo", "package", "candidate", "runs", "seed", "out", "label", "commit", "fresh"].includes(key)) fail(`${label}: extra key ${key}`);
  }
}

// ---- every single defect on a valid base: each one must be rejected, the base itself accepted -----------------------

const BAD_VALUES: Record<string, string[]> = { "--package": PKG_BAD, "--runs": RUNS_BAD, "--seed": SEED_BAD, "--out": OUT_BAD };

function checkSingleDefects(impl: NamesCliImpl, base: Scenario): void {
  const variants: Scenario[] = [{ ...base, specs: base.specs.map((x) => ({ ...x })) }];
  const copy = (): Scenario => ({ ...base, specs: base.specs.map((x) => ({ ...x })), unknown: [] });
  for (const [i, sp] of base.specs.entries()) {
    for (const state of ["missing", "dup"] as const) {
      const v = copy();
      v.specs[i]!.state = state;
      variants.push(v);
    }
    for (const bad of BAD_VALUES[sp.flag] ?? []) {
      const v = copy();
      v.specs[i]!.state = "invalid";
      v.specs[i]!.invalid = bad;
      variants.push(v);
    }
  }
  for (const u of ["--nope", "--Repo", "--runs=5", "--fresh=1", "stray"]) variants.push({ ...copy(), unknown: [u] });
  variants.push({ ...copy(), freshState: "dup" });
  for (const v of variants) checkScenario(impl, v);
}

/** A base that parses: required flags valid, optional ones absent or valid. */
const baseArb: fc.Arbitrary<Scenario> = fc
  .tuple(scenarioArb, fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), fc.constantFrom<"absent" | "present">("absent", "present"))
  .map(([s, on, fresh]) => ({
    ...s,
    freshState: fresh,
    unknown: [],
    specs: s.specs.map((x, i) => ({ ...x, state: x.required || on[i] ? ("valid" as const) : ("absent" as const) })),
  }));

// ---- raw token arrays: totality and the "only when" direction ---------------------------------------------------------

const rawToken = fc.oneof(
  fc.constantFrom("--repo", "--package", "--runs", "--seed", "--out", "--label", "--commit", "--candidate", "--fresh", "--x", "-1", "99", "1e3", "intersect", "x", "proofs/a/b.json", "", "--"),
  fc.string({ maxLength: 6 }),
);
const rawArgv = fc.array(rawToken, { maxLength: 10 });

function checkRaw(impl: NamesCliImpl, argv: string[]): void {
  const label = JSON.stringify(argv);
  let out: CliParse;
  try {
    out = impl.parseCliArgs(argv);
  } catch (e) {
    return fail(`parseCliArgs threw on ${label}: ${String(e)}`);
  }
  if (!out.ok) return;
  const a = out.args;
  const known = new Set(["--repo", "--package", "--runs", "--seed", "--out", "--label", "--commit", "--candidate", "--fresh"]);
  for (const t of argv) if (t.startsWith("--") && !known.has(t)) fail(`${label}: accepted unknown flag ${t}`);
  const flags = argv.filter((t) => known.has(t));
  if (new Set(flags).size !== flags.length) fail(`${label}: accepted a repeated flag`);
  if (!NAME.test(a.package)) fail(`${label}: accepted package ${JSON.stringify(a.package)}`);
  if (!Number.isInteger(a.runs) || a.runs < 100 || a.runs > 100000) fail(`${label}: accepted runs ${a.runs}`);
  if (!Number.isInteger(a.seed) || a.seed < 0) fail(`${label}: accepted seed ${a.seed}`);
  if (a.repo === "" || !argv.includes(a.repo)) fail(`${label}: repo ${JSON.stringify(a.repo)} was not given`);
  if (a.out !== undefined) {
    const segs = a.out.split("/");
    if (segs.length < 3 || !NAME.test(segs[segs.length - 2]!) || segs[segs.length - 3] !== "proofs") fail(`${label}: accepted out ${a.out}`);
  }
}

// ---- names and paths ------------------------------------------------------------------------------------------------

function checkNames(impl: NamesCliImpl, a: string, b: string, whole: string): void {
  for (const s of [a, b]) {
    if (impl.isProofName(s) !== NAME.test(s)) fail(`isProofName(${JSON.stringify(s)}) is ${impl.isProofName(s)}, pattern says ${NAME.test(s)}`);
  }
  const path = impl.proofReportPath(a, b);
  const both = NAME.test(a) && NAME.test(b);
  if ((path !== undefined) !== both) fail(`proofReportPath(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${String(path)}, defined should be ${both}`);
  if (path !== undefined) {
    if (path !== `demo/proofs/${a}/${b}.json`) fail(`path form: ${path}`);
    const segs = path.split("/");
    if (segs.some((s) => s === "" || s === "..") || /[\\%]/.test(path) || path.includes("..")) fail(`unsafe path ${path}`);
    const back = impl.parseProofReportPath(path);
    if (back === undefined || back.repo !== a || back.package !== b) fail(`parseProofReportPath(${path}) = ${JSON.stringify(back)}`);
  }
  const parsed = impl.parseProofReportPath(whole);
  if (parsed !== undefined) {
    if (!NAME.test(parsed.repo) || !NAME.test(parsed.package)) fail(`parseProofReportPath accepted ${JSON.stringify(whole)}`);
    if (`demo/proofs/${parsed.repo}/${parsed.package}.json` !== whole) fail(`parseProofReportPath(${JSON.stringify(whole)}) is not an inverse`);
  }
  if (/^demo\/proofs\/[^/]+\/[^/]+\.json$/.test(whole)) {
    const m = /^demo\/proofs\/([^/]+)\/([^/]+)\.json$/.exec(whole)!;
    const should = NAME.test(m[1]!) && NAME.test(m[2]!);
    if ((parsed !== undefined) !== should) fail(`parseProofReportPath(${JSON.stringify(whole)}) defined=${parsed !== undefined}, should be ${should}`);
  }
}

const wholePath = fc.oneof(
  fc.tuple(nameLike, nameLike).map(([x, y]) => `demo/proofs/${x}/${y}.json`),
  fc.string({ maxLength: 20 }),
  fc.constantFrom("demo/proofs/a/b.json", "demo/proofs/a/b/c.json", "demo/proofs/../b.json", "demo/proofs/a/.json", "proofs/a/b.json", "demo/proofs/a/b.json\n"),
);

export function build(impl: NamesCliImpl = REAL_NAMES_CLI) {
  return fc.property(nameLike, nameLike, wholePath, scenarioArb, baseArb, rawArgv, (a, b, whole, scenario, base, raw) => {
    checkNames(impl, a, b, whole);
    checkScenario(impl, scenario);
    checkSingleDefects(impl, base);
    checkRaw(impl, raw);
  });
}

describe("Property 11: Proof names, paths and CLI arguments", () => {
  it("names, report paths and CLI arguments follow the stated conditions", () => {
    assertProperty("Property 11: Proof names, paths and CLI arguments", build(REAL_NAMES_CLI));
  });
});
