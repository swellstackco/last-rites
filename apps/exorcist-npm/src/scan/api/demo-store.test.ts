import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFsDemoStore, DEMO_NAME_PATTERN } from "./demo-store.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "exorcist-demo-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createFsDemoStore", () => {
  it("returns the file bytes unmodified", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 123, 10, 0, 255, 125, 13, 10]);
    writeFileSync(join(dir, "pump.json"), bytes);
    const got = await createFsDemoStore(dir)("pump");
    expect(got).toEqual(bytes);
  });

  it("returns undefined for a missing file", async () => {
    expect(await createFsDemoStore(dir)("nope")).toBeUndefined();
  });

  it("returns undefined when a directory is in place of the file", async () => {
    mkdirSync(join(dir, "adir.json"));
    expect(await createFsDemoStore(dir)("adir")).toBeUndefined();
  });

  it("returns undefined when the demo directory itself is a file (ENOTDIR)", async () => {
    writeFileSync(join(dir, "plain"), "x");
    expect(await createFsDemoStore(join(dir, "plain"))("x")).toBeUndefined();
  });

  it("propagates other errors", async () => {
    // A NUL byte in the path makes readFile fail with a non-ENOENT error.
    await expect(createFsDemoStore(`${dir}\0bad`)("x")).rejects.toThrow();
  });

  it.each([
    ["a/b"],
    ["../x"],
    ["..%2f"],
    ["A"],
    [""],
    ["a".repeat(65)],
    ["-a"],
    ["a.b"],
    ["a\\b"],
  ])("rejects the name %j with the guard and reads nothing", async (name) => {
    writeFileSync(join(dir, "secret.json"), "{}");
    expect(DEMO_NAME_PATTERN.test(name)).toBe(false);
    await expect(createFsDemoStore(dir)(name)).rejects.toThrow(/invalid demo name/);
  });

  it("accepts a 64 character name", () => {
    expect(DEMO_NAME_PATTERN.test("a".repeat(64))).toBe(true);
  });
});
