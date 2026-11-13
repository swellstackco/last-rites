import { describe, expect, it } from "vitest";
import { parseCliArgs } from "./cli-args.js";

const base = ["--repo", "../parse-server", "--package", "intersect"];
const rejected = (argv: string[]): string => {
  const r = parseCliArgs(argv);
  if (r.ok) throw new Error(`accepted ${JSON.stringify(argv)}`);
  return r.message;
};

describe("parseCliArgs", () => {
  it("accepts a full valid command", () => {
    const r = parseCliArgs([
      ...base, "--candidate", "c.js", "--runs", "500", "--seed", "7", "--out", "demo/proofs/parse-server/intersect.json",
      "--label", "parse-community/parse-server", "--commit", "abc123", "--fresh",
    ]);
    expect(r).toEqual({
      ok: true,
      args: {
        repo: "../parse-server", package: "intersect", candidate: "c.js", runs: 500, seed: 7,
        out: "demo/proofs/parse-server/intersect.json", label: "parse-community/parse-server", commit: "abc123", fresh: true,
      },
    });
  });

  it("applies defaults 200 and 20261113", () => {
    expect(parseCliArgs(base)).toEqual({
      ok: true,
      args: { repo: "../parse-server", package: "intersect", runs: 200, seed: 20261113, fresh: false },
    });
  });

  it("rejects missing required flags", () => {
    expect(rejected(["--package", "intersect"])).toBe("--repo is required");
    expect(rejected(["--repo", "x"])).toBe("--package is required");
  });

  it("rejects unknown flags, stray arguments, repeated flags and missing values", () => {
    expect(rejected([...base, "--nope"])).toBe("unknown flag --nope");
    expect(rejected([...base, "stray"])).toContain("unexpected argument");
    expect(rejected([...base, "--runs", "100", "--runs", "200"])).toBe("--runs given more than once");
    expect(rejected([...base, "--fresh", "--fresh"])).toBe("--fresh given more than once");
    expect(rejected(["--repo"])).toBe("--repo needs a value");
    expect(rejected(["--repo", "--package", "x"])).toBe("--repo needs a value");
  });

  it("validates --runs", () => {
    for (const bad of ["99", "1e3", "100001", "-1", "1.5", "", "abc", " 200"]) {
      expect(rejected([...base, "--runs", bad])).toBeTruthy();
    }
    expect(parseCliArgs([...base, "--runs", "100"]).ok).toBe(true);
    expect(parseCliArgs([...base, "--runs", "100000"]).ok).toBe(true);
  });

  it("validates --seed", () => {
    expect(rejected([...base, "--seed", "-1"])).toBe("--seed must be a non-negative integer");
    expect(rejected([...base, "--seed", "1.5"])).toBeTruthy();
    expect(rejected([...base, "--seed", "99999999999999999999"])).toBeTruthy();
    expect(parseCliArgs([...base, "--seed", "0"]).ok).toBe(true);
  });

  it("validates --package as a Proof_Name", () => {
    expect(rejected(["--repo", "x", "--package", "@babel/core"])).toContain("--package must match");
    expect(rejected(["--repo", "x", "--package", "Intersect"])).toContain("--package must match");
  });

  it("validates --out", () => {
    expect(parseCliArgs([...base, "--out", "demo/proofs/parse-server/intersect.json"]).ok).toBe(true);
    expect(parseCliArgs([...base, "--out", "/tmp/x/proofs/declared-only/a.json"]).ok).toBe(true);
    expect(rejected([...base, "--out", "x.json"])).toContain("--out must end in");
    expect(rejected([...base, "--out", "demo/other/parse-server/a.json"])).toContain("--out must end in");
    expect(rejected([...base, "--out", "demo/proofs/Parse_Server/a.json"])).toContain("--out must end in");
    expect(rejected([...base, "--out", "demo/proofs/parse-server/"])).toContain("--out must end in");
  });

  it("never throws on odd input", () => {
    expect(parseCliArgs([undefined as unknown as string]).ok).toBe(false);
  });
});
