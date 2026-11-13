import { describe, it, expect } from "vitest";
import {
  checkCandidate,
  checkOut,
  checkPackage,
  checkPath,
  checkProofPackage,
  checkRuns,
  classifyRepoArgument,
  isNpmName,
} from "./guards.js";
import { memoryProbe } from "./test-support/fakes.js";

const kind = (s: string) => classifyRepoArgument(s).kind;

describe("classifyRepoArgument", () => {
  it("classifies local prefixes", () => {
    expect(classifyRepoArgument("/a/b")).toEqual({ kind: "local", path: "/a/b" });
    expect(kind("./x")).toBe("local");
    expect(kind("../x")).toBe("local");
  });

  it("keeps a leading ./ owner/name local, and a ./ demo name local", () => {
    expect(kind("./owner/name")).toBe("local");
    expect(kind("./pump")).toBe("local");
  });

  it("classifies owner/name as github", () => {
    expect(classifyRepoArgument("owner/name")).toEqual({ kind: "github", owner: "owner", repo: "name" });
  });

  it("classifies demo names, case sensitive", () => {
    expect(classifyRepoArgument("pump")).toEqual({ kind: "demo", name: "pump" });
    expect(kind("parse-server")).toBe("demo");
    expect(kind("Parse-Server")).toBe("invalid");
  });

  it("rejects the rest with invalid_repo", () => {
    for (const s of ["owner/name/extra", "", "\0", "a\0/b", "/", "./", "../", ".", "./\0x", "own er/name"]) {
      const c = classifyRepoArgument(s);
      expect(c.kind, JSON.stringify(s)).toBe("invalid");
      if (c.kind === "invalid") expect(c.code).toBe("invalid_repo");
    }
  });

  it("rejects an owner that parseRepoTarget rejects", () => {
    expect(kind("a_b/name")).toBe("invalid");
    expect(kind("../name")).toBe("local");
  });

  it("limits a local path to 4096 code units", () => {
    expect(kind("/" + "a".repeat(4095))).toBe("local");
    expect(kind("/" + "a".repeat(4096))).toBe("invalid");
  });

  it("is total on non-strings", () => {
    expect(kind(undefined as never)).toBe("invalid");
    expect(kind(null as never)).toBe("invalid");
    expect(kind(5 as never)).toBe("invalid");
  });
});

describe("isNpmName / checkPackage", () => {
  it("accepts and rejects", () => {
    for (const ok of ["a", "@scope/pkg", "deep-diff", "a.b_c~d", "a".repeat(214)]) expect(isNpmName(ok), ok).toBe(true);
    for (const bad of ["Pkg", "", "@scope", "@/x", "a".repeat(215), "-a", "a b", "a/b", "_a", "@scope/pkg/x"]) {
      expect(isNpmName(bad), bad).toBe(false);
    }
  });

  it("returns invalid_package", () => {
    expect(checkPackage("Pkg")).toMatchObject({ ok: false, code: "invalid_package" });
    expect(checkPackage(3)).toMatchObject({ ok: false, code: "invalid_package" });
    expect(checkPackage("pkg")).toEqual({ ok: true, name: "pkg" });
  });

  it("proof package: scoped names are rejected with a clear message", () => {
    const r = checkProofPackage("@scope/pkg");
    expect(r).toMatchObject({ ok: false, code: "invalid_package" });
    if (!r.ok) expect(r.message).toContain("scoped");
    expect(checkProofPackage("intersect")).toEqual({ ok: true, name: "intersect" });
    expect(checkProofPackage("a.b")).toMatchObject({ ok: false, code: "invalid_package" });
    expect(checkProofPackage("a".repeat(65))).toMatchObject({ ok: false, code: "invalid_package" });
  });
});

describe("checkRuns", () => {
  it("defaults and bounds", () => {
    expect(checkRuns(undefined)).toEqual({ ok: true, runs: 200 });
    expect(checkRuns(100)).toEqual({ ok: true, runs: 100 });
    expect(checkRuns(100000)).toEqual({ ok: true, runs: 100000 });
    for (const bad of [99, 100001, 200.5, "1e3", "200", NaN, Infinity, null, -1]) {
      expect(checkRuns(bad), String(bad)).toMatchObject({ ok: false, code: "invalid_runs" });
    }
    expect(checkRuns(1e3)).toEqual({ ok: true, runs: 1000 });
  });
});

describe("checkOut", () => {
  it("agrees with the proof out-path rule", () => {
    expect(checkOut("demo/proofs/parse-server/intersect.json")).toEqual({
      ok: true,
      out: "demo/proofs/parse-server/intersect.json",
    });
    for (const bad of ["intersect.json", "demo/proofs/Parse/x.json", "demo/other/parse-server/x.json", "demo/proofs/p/", "", 4, undefined]) {
      expect(checkOut(bad), String(bad)).toMatchObject({ ok: false, code: "invalid_out" });
    }
  });
});

describe("checkPath", () => {
  const probe = memoryProbe({ "/work/repo/package.json": "{}", "/work/file.txt": "x" });

  it("resolves against cwd and accepts a directory", async () => {
    expect(await checkPath(probe, "/work", "repo")).toEqual({ ok: true, abs: "/work/repo" });
    expect(await checkPath(probe, "/work", "./repo/../repo")).toEqual({ ok: true, abs: "/work/repo" });
    expect(await checkPath(probe, "/other", "/work/repo")).toEqual({ ok: true, abs: "/work/repo" });
  });

  it("rejects shapes, absence and files", async () => {
    expect(await checkPath(probe, "/work", "")).toMatchObject({ ok: false, code: "invalid_path" });
    expect(await checkPath(probe, "/work", 5)).toMatchObject({ ok: false, code: "invalid_path" });
    expect(await checkPath(probe, "/work", "a\0b")).toMatchObject({ ok: false, code: "invalid_path" });
    expect(await checkPath(probe, "/work", "x".repeat(4097))).toMatchObject({ ok: false, code: "invalid_path" });
    expect(await checkPath(probe, "/work", "nope")).toMatchObject({ ok: false, code: "path_not_found" });
    expect(await checkPath(probe, "/work", "file.txt")).toMatchObject({ ok: false, code: "not_a_directory" });
  });
});

describe("checkCandidate", () => {
  const probe = memoryProbe({ "/w/c.js": "x", "/w/c.mjs": "x", "/w/c.cjs": "x", "/w/c.ts": "x", "/w/dir/a.js": "x" });

  it("accepts a regular js/mjs/cjs file", async () => {
    for (const f of ["c.js", "c.mjs", "c.cjs"]) expect(await checkCandidate(probe, "/w", f)).toEqual({ ok: true, abs: `/w/${f}` });
  });

  it("rejects a directory, a missing file, .ts and bad shapes", async () => {
    for (const bad of ["dir", "missing.js", "c.ts", "", 4, null]) {
      expect(await checkCandidate(probe, "/w", bad), String(bad)).toMatchObject({ ok: false, code: "invalid_candidate" });
    }
  });
});
