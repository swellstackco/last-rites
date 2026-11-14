import { describe, expect, it } from "vitest";
import { parseScanArgs } from "./cli-args.js";

const fail = (argv: string[], message: RegExp): void => {
  const r = parseScanArgs(argv);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.message).toMatch(message);
};

describe("parseScanArgs", () => {
  it("applies the defaults", () => {
    expect(parseScanArgs(["--repo", "/work/my repo"])).toEqual({
      ok: true,
      args: { repo: "/work/my repo", label: "local/my-repo", ref: "local", cache: ".cache/actions" },
    });
  });

  it("takes the default label from the working directory for `.`", () => {
    const r = parseScanArgs(["--repo", "."], "/home/u/nixpacks");
    expect(r).toMatchObject({ ok: true, args: { label: "local/nixpacks" } });
  });

  it("accepts every flag", () => {
    expect(parseScanArgs(["--ref", "144b4f9", "--repo", "r", "--out", "o.json", "--label", "railwayapp/nixpacks", "--cache", "c"])).toEqual({
      ok: true,
      args: { repo: "r", out: "o.json", label: "railwayapp/nixpacks", ref: "144b4f9", cache: "c" },
    });
  });

  it("rejects a missing --repo", () => fail(["--ref", "x"], /--repo is required/));
  it("rejects an empty argument list", () => fail([], /--repo is required/));
  it("rejects an unknown flag", () => fail(["--repo", "r", "--bogus", "1"], /unknown flag --bogus/));
  it("rejects a repeated flag", () => fail(["--repo", "r", "--repo", "s"], /more than once/));
  it("rejects a flag without a value", () => fail(["--repo"], /needs a value/));
  it("rejects a flag followed by another flag", () => fail(["--repo", "--out", "x"], /needs a value/));
  it("rejects a positional argument", () => fail(["--repo", "r", "extra"], /unexpected argument/));
  it("rejects a bad label", () => fail(["--repo", "r", "--label", "no-slash"], /--label/));
  it("rejects a bad ref", () => fail(["--repo", "r", "--ref", "a b"], /--ref/));
  it("never throws on non-string input", () => {
    expect(parseScanArgs([1 as unknown as string]).ok).toBe(false);
    expect(parseScanArgs(undefined as unknown as string[]).ok).toBe(false);
  });
});
