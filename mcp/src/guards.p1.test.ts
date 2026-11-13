import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { DEMO_REPOS, REPO_PATTERN, isProofOutPath } from "@graveyard-kit/exorcist-npm/programmatic";
import { assertPropertyAsync } from "./test-support/fc-runner.js";
import { assertAllSabotagesCaughtAsync, type NamedAsyncProperty } from "./test-support/sabotage-runner.js";
import { REAL_GUARDS, type Guards } from "./test-support/validators.js";
import { KIRO_P1_SABOTAGES } from "./test-support/sabotage/kiro-p1.js";
import { counting, memoryProbe } from "./test-support/fakes.js";

const CWD = "/work";
const PROBE_FILES = { "/work/a/package.json": "{}", "/work/file.txt": "x" };
const DEMOS = DEMO_REPOS.map((d) => d.name);

const NAME_CHARS = [..."abcXYZ019._-"];
const nameChars = (max: number) => fc.stringOf(fc.constantFrom(...NAME_CHARS), { minLength: 0, maxLength: max });

const repoString: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.tuple(nameChars(41), nameChars(102)).map(([o, n]) => `${o}/${n}`) },
  { weight: 2, arbitrary: fc.tuple(fc.constantFrom("/", "./", "../"), fc.oneof(fc.constantFrom("a", "missing", "file.txt", "a/../a", "pump", "owner/name", ""), fc.string({ maxLength: 12 }))).map(([p, r]) => p + r) },
  { weight: 2, arbitrary: fc.constantFrom(...DEMOS, "Pump", "parse-server/", "jest/jest") },
  { weight: 1, arbitrary: fc.constantFrom("/work/a", "/work/file.txt", "/work/none", "/a\0b", "./a\0", "a/b/c", "") },
  { weight: 1, arbitrary: fc.fullUnicodeString({ maxLength: 20 }) },
  { weight: 1, arbitrary: fc.constantFrom("/", "./", "../").map((p) => p + "a".repeat(4096)) },
  { weight: 1, arbitrary: fc.constantFrom("/", "./").map((p) => p + "a".repeat(4096 - p.length)) },
);

const refValue: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 3, arbitrary: fc.constant(undefined) },
  { weight: 2, arbitrary: fc.constantFrom("main", "v1.0", "feature/x", "a..b", "", "bad ref", "x?y", "é", "a".repeat(201), "a".repeat(200)) },
  { weight: 1, arbitrary: fc.string({ maxLength: 10 }) },
);

const npmNameInput: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom("pkg", "@scope/pkg", "Pkg", "a", "@/x", "@s/", "a b", "a_b", "x~y", "-a", ".a", "@S/p", "", "é"),
  fc.tuple(fc.constantFrom("", "@s/"), fc.integer({ min: 205, max: 220 })).map(([p, n]) => p + "a".repeat(n - p.length)),
  fc.stringOf(fc.constantFrom(..."abcAB09._~-@/"), { maxLength: 20 }),
  fc.constantFrom(undefined, null, 5, {}),
);

const runsInput: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom(undefined, 99, 100, 101, 200, 99999, 100000, 100001, 200.5, "200", null, NaN, Infinity, -0, 1e3),
  fc.integer({ min: -10, max: 100100 }),
  fc.double({ min: 0, max: 200000 }),
);

const outInput: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom("proofs/x/a.json", "demo/proofs/parse-server/intersect.json", "proofs/X/a.json", "proofs//a.json", "proofs/x/", "x/a.json", "a/proofs/x/..", "../proofs/x/a.json", 5, undefined),
  fc.stringOf(fc.constantFrom(..."proofs/xA-.a"), { maxLength: 24 }),
);

const NPM = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/;
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

/** The specification of Requirement 3.1, written independently of the implementation. */
function expectedKind(s: string): "local" | "github" | "demo" | "invalid" {
  const prefixed = s.startsWith("/") || s.startsWith("./") || s.startsWith("../");
  if (prefixed) {
    const prefix = s.startsWith("../") ? 3 : s.startsWith("./") ? 2 : 1;
    if (s.length > prefix && s.length <= 4096 && !s.includes("\0")) return "local";
  }
  if (REPO_PATTERN.test(s)) {
    const i = s.indexOf("/");
    const owner = s.slice(0, i);
    const repo = s.slice(i + 1);
    if (OWNER_RE.test(owner) && REPO_RE.test(repo) && repo !== "." && repo !== "..") return "github";
  }
  if (DEMOS.includes(s)) return "demo";
  return "invalid";
}

export const name = "Property 1: Argument guards and routing";

export function build(impl: Guards) {
  return fc.asyncProperty(repoString, refValue, npmNameInput, runsInput, outInput, async (s, ref, npm, runs, out) => {
    // classification
    const kind = expectedKind(s);
    const got = impl.classifyRepoArgument(s);
    if (got.kind !== kind) throw new Error(`classify ${JSON.stringify(s.slice(0, 40))}: expected ${kind}, got ${got.kind}`);
    if (got.kind === "invalid" && got.code !== "invalid_repo") throw new Error("invalid without invalid_repo");

    // package names
    const npmExpected = typeof npm === "string" && npm.length <= 214 && NPM.test(npm);
    if (impl.isNpmName(npm) !== npmExpected) throw new Error(`isNpmName(${JSON.stringify(npm)}) expected ${npmExpected}`);

    // runs
    const runsOk = runs === undefined || (typeof runs === "number" && Number.isInteger(runs) && runs >= 100 && runs <= 100000);
    if (impl.checkRuns(runs).ok !== runsOk) throw new Error(`checkRuns(${String(runs)}) expected ${runsOk}`);

    // out agrees with the Proof_Cli
    const outOk = typeof out === "string" && isProofOutPath(out);
    if (impl.checkOut(out).ok !== outOk) throw new Error(`checkOut(${JSON.stringify(out)}) expected ${outOk}`);

    // scan guard sequence: Dep calls only for accepted input
    const probe = memoryProbe(PROBE_FILES);
    const call = counting(async () => "called");
    const input = ref === undefined ? { repo: s } : { repo: s, ref };
    const result = await impl.guardedScan(probe, CWD, input, call);

    let accepted = kind !== "invalid";
    if (accepted && ref !== undefined) accepted = kind === "github" && REF_RE.test(ref) && !ref.includes("..");
    // the probe has the directories "/", "/work" and "/work/a"; "/work/file.txt" is a file; the rest is absent
    if (accepted && kind === "local") {
      const abs = resolve(CWD, s);
      accepted = abs === "/work" || abs === "/work/a" || abs === "/";
    }
    if (accepted !== result.ok) throw new Error(`scan guard for ${JSON.stringify([s.slice(0, 40), ref])}: expected ${accepted ? "accept" : "reject"}`);
    if (call.calls.length !== (accepted ? 1 : 0)) {
      throw new Error(`pipeline called ${call.calls.length} time(s) for ${accepted ? "accepted" : "rejected"} input`);
    }
    if (!accepted && result.ok === false && result.message === "") throw new Error("empty rejection message");
    return true;
  });
}

export const property1: NamedAsyncProperty<Guards> = { name, build };

describe("Property 1: Argument guards and routing", () => {
  it("holds for the real guards", async () => {
    await assertPropertyAsync(name, build(REAL_GUARDS));
  });

  it("every sabotage is caught", async () => {
    expect(KIRO_P1_SABOTAGES.length).toBeGreaterThan(0);
    await assertAllSabotagesCaughtAsync(name, [property1], KIRO_P1_SABOTAGES);
  });
});
