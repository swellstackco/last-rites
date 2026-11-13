import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { proofReportPath } from "@graveyard-kit/skeleton/proof";
import { assertProperty } from "../test-support/fc-runner.js";
import { assertAllSabotagesCaught, type NamedProperty } from "../test-support/sabotage-runner.js";
import { REAL_CANDIDATE_MAP, type CandidateMap } from "../test-support/validators.js";
import { KIRO_P11_SABOTAGES } from "../test-support/sabotage/kiro-p11.js";

const proofName = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,63}$/);
// Not Proof_Names: upper case, a dot, 65 characters, empty, a leading dash.
const badName = fc.oneof(
  proofName.map((n) => n.toUpperCase()).filter((n) => n !== n.toLowerCase()),
  proofName.map((n) => `${n}.x`),
  proofName.map((n) => `${n}a`.padEnd(65, "a")),
  fc.constantFrom("", "-a", "A", "a_b", "a b"),
);
const tag = fc.stringMatching(/^[A-Za-z0-9._-]{1,12}$/);
const prefix = fc.constantFrom("", "./", "/", "/abs/dir/", "/Users/x/proj/", "some/relative/dir/", "/a b/c/");
const MARK = "demo/proofs/candidates/";

export const name = "Property 11: Candidate path mapping";

export function build(impl: CandidateMap) {
  return fc.property(prefix, proofName, proofName, tag, badName, fc.constantFrom("..", "", "."), (pre, repo, pkg, t, bad, seg) => {
    const file = `${pkg}.${t}.js`;
    const path = `${pre}${MARK}${repo}/${file}`;
    const ct = impl.candidateTarget;

    // A valid path maps, and the result is usable for proofReportPath.
    const got = ct(path);
    if (got === undefined || got.repo !== repo || got.package !== pkg) throw new Error(`valid path ${JSON.stringify(path)} gave ${JSON.stringify(got)}`);
    if (proofReportPath(got.repo, got.package) === undefined) throw new Error("proofReportPath undefined for a mapped target");
    for (const n of [got.repo, got.package]) if (n.includes("/") || n.includes(".")) throw new Error(`name ${n} contains / or .`);

    const reject = (label: string, p: string) => {
      const r = ct(p);
      if (r !== undefined) throw new Error(`${label}: ${JSON.stringify(p)} gave ${JSON.stringify(r)}`);
    };
    // `..` / empty / `.` segment anywhere
    reject("dotdot in prefix", `${pre}${seg === "" ? "x/" : `${seg}/`}../${MARK}${repo}/${file}`);
    reject("dotdot as repo", `${pre}${MARK}../${file}`);
    if (seg === "..") reject("dotdot between", `${pre}demo/${seg}/proofs/candidates/${repo}/${file}`);
    if (seg === "") reject("empty segment", `${pre}demo/proofs//candidates/${repo}/${file}`);
    reject("empty segment before file", `${pre}${MARK}${repo}//${file}`);
    // extra depth
    reject("extra depth", `${pre}${MARK}${repo}/sub/${file}`);
    // wrong extension
    reject(".ts", `${pre}${MARK}${repo}/${pkg}.${t}.ts`);
    reject("no extension", `${pre}${MARK}${repo}/${pkg}.${t}`);
    reject("bare .js", `${pre}${MARK}${repo}/${pkg}.js`);
    // names that are not Proof_Names
    reject("bad repo", `${pre}${MARK}${bad}/${file}`);
    // a dotted bad name is a valid package followed by a tag, so only dot-free bad names apply here
    if (!bad.includes(".")) reject("bad package", `${pre}${MARK}${repo}/${bad}.${t}.js`);
    // missing candidates segment, or a different one
    reject("no candidates", `${pre}demo/proofs/${repo}/${file}`);
    reject("wrong marker", `${pre}demo/proofs/candidate/${repo}/${file}`);
    // backslash anywhere
    reject("backslash", path.replace("/candidates/", "\\candidates\\"));
    reject("backslash prefix", `C:\\proj\\${MARK}${repo}/${file}`);
    reject("nul", `${path}\0`);
    return true;
  });
}

export const property11: NamedProperty<CandidateMap> = { name, build };

describe("Property 11: Candidate path mapping", () => {
  it("holds for the real mapping", () => {
    assertProperty(name, build(REAL_CANDIDATE_MAP));
  });

  it("every sabotage is caught", () => {
    expect(KIRO_P11_SABOTAGES.length).toBeGreaterThan(0);
    assertAllSabotagesCaught(name, [property11], KIRO_P11_SABOTAGES);
  });
});

describe("candidate path mapping: examples", () => {
  const ct = REAL_CANDIDATE_MAP.candidateTarget;
  it("maps the documented shapes", () => {
    expect(ct("demo/proofs/candidates/parse-server/intersect.agent.js")).toEqual({ repo: "parse-server", package: "intersect" });
    expect(ct("/Users/ben/p/demo/proofs/candidates/pump/once.v2.js")).toEqual({ repo: "pump", package: "once" });
  });
  it("rejects the rest", () => {
    expect(ct("demo/proofs/candidates/x.js")).toBeUndefined();
    expect(ct("demo/proofs/candidates/parse-server/README.md")).toBeUndefined();
    expect(ct("demo/proofs/candidates/../x/y.a.js")).toBeUndefined();
  });
});
