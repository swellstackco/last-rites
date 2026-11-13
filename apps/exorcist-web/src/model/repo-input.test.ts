import { describe, expect, it } from "vitest";
import { parseRepoInput } from "./repo-input.js";

const ok = (repo: string, ref?: string) => ({ ok: true, repo, owner: repo.split("/")[0], name: repo.split("/")[1], ...(ref ? { ref } : {}) });

describe("parseRepoInput", () => {
  it.each([
    "owner/repo",
    "github.com/owner/repo",
    "https://github.com/owner/repo",
    "http://github.com/owner/repo",
    "https://github.com/owner/repo/",
    "https://github.com/owner/repo.git",
    "github.com/owner/repo.git/",
    "  owner/repo \n",
  ])("accepts %j", (input) => {
    expect(parseRepoInput(input)).toEqual(ok("owner/repo"));
  });

  it("preserves case and accepts _ and . in repo names", () => {
    expect(parseRepoInput("Foo-Bar/my_repo.js")).toEqual(ok("Foo-Bar/my_repo.js"));
  });

  it.each([
    "www.github.com/owner/repo",
    "https://www.github.com/owner/repo",
    "https://gitlab.com/owner/repo",
    "https://example.com/owner/repo",
    "gitlab.com/owner/repo",
    "owner/repo/tree/main",
    "owner",
    "",
    "   ",
    "owner/..",
    "owner/.",
    `${"a".repeat(40)}/repo`,
    "owner/re po",
    "owner//repo",
    "a".repeat(301),
  ])("rejects %j on the repo field", (input) => {
    const r = parseRepoInput(input);
    expect(r).toMatchObject({ ok: false, field: "repo" });
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });

  it("accepts a 39 character owner", () => {
    expect(parseRepoInput(`${"a".repeat(39)}/r`).ok).toBe(true);
  });

  it("accepts a ref and trims it", () => {
    expect(parseRepoInput("o/r", " release/1.2-x ")).toEqual(ok("o/r", "release/1.2-x"));
  });

  it("treats an empty ref as none", () => {
    expect(parseRepoInput("o/r", "")).toEqual(ok("o/r"));
    expect(parseRepoInput("o/r", "  ")).toEqual(ok("o/r"));
  });

  it.each(["a..b", "a b", "a".repeat(201), "a?b", "a#b", "a%20b"])("rejects ref %j with field ref", (ref) => {
    expect(parseRepoInput("o/r", ref)).toMatchObject({ ok: false, field: "ref" });
  });

  it("reports the repo field first when both are bad", () => {
    expect(parseRepoInput("bad", "a..b")).toMatchObject({ ok: false, field: "repo" });
  });

  it("never throws on non-strings", () => {
    expect(parseRepoInput(undefined as never).ok).toBe(false);
  });
});
