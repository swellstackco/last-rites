import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createNodeSourceFs } from "@last-rites/exorcist-npm/programmatic";
import { inventoryText, inventoryWorkflows } from "./inventory.js";

const fixture = (name: string): Promise<string> =>
  readFile(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const names = (r: { uses: { owner: string; repo: string }[] }): string[] => r.uses.map((u) => `${u.owner}/${u.repo}`);

/** The text the Source_Offset points at. */
const slice = (text: string, u: { offset: number; length: number }): string => text.slice(u.offset, u.offset + u.length);

async function withTempRoot(run: (root: string, workflows: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "exorcist-actions-inv-"));
  const workflows = join(root, ".github", "workflows");
  try {
    await mkdir(workflows, { recursive: true });
    await run(root, workflows);
  } finally {
    await chmod(workflows, 0o755).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}

describe("inventoryText on hand-written files", () => {
  it("reads single and double quoted values; the offset points at the content", async () => {
    const text = await fixture("quoted.yml");
    const r = inventoryText("quoted.yml", text);
    expect(r.warnings).toEqual([]);
    expect(r.uses.map((u) => slice(text, u))).toEqual(["actions/checkout@v4", "actions/cache@v3"]);
    expect(r.uses[0]).toMatchObject({ line: 5, column: 16, ref: "v4", refKind: "mutable" });
    expect(r.uses[1]?.with).toEqual({ path: "x" });
  });

  it("handles CRLF line endings", async () => {
    const text = await fixture("crlf.yml");
    const r = inventoryText("crlf.yml", text);
    expect(r.warnings).toEqual([]);
    expect(r.uses).toHaveLength(1);
    const u = r.uses[0]!;
    expect(slice(text, u)).toBe("actions/checkout@v4");
    expect(u.with).toEqual({ "fetch-depth": "0" });
    const line = u.withKeys[0]?.line;
    expect(line && text.slice(line.start, line.end)).toBe("          fetch-depth: 0");
    expect(line && text.slice(line.end, line.eolEnd)).toBe("\r\n");
  });

  it("handles a file with no final newline", async () => {
    const text = await fixture("no-final-newline.yml");
    expect(text.endsWith("\n")).toBe(false);
    const r = inventoryText("f.yml", text);
    expect(r.uses).toHaveLength(1);
    expect(slice(text, r.uses[0]!)).toBe("actions/checkout@v4");
  });

  it("reads a flow-style step, with no whole-line range for its with keys", async () => {
    const r = inventoryText("f.yml", await fixture("flow-step.yml"));
    expect(names(r)).toEqual(["actions/checkout"]);
    expect(r.uses[0]?.with).toEqual({ ref: "main" });
    expect(r.uses[0]?.withKeys[0]?.line).toBeUndefined();
  });

  it("skips an alias use as unsupported_value and keeps the anchored one", async () => {
    const text = await fixture("anchor-alias.yml");
    const r = inventoryText("f.yml", text);
    expect(names(r)).toEqual(["actions/checkout"]);
    expect(slice(text, r.uses[0]!)).toBe("actions/checkout@v4");
    // The alias step is a mapping that is an alias node, not a mapping: nothing is collected from it.
    expect(r.uses).toHaveLength(1);
  });

  it("skips a block scalar as unsupported_value", async () => {
    const r = inventoryText("f.yml", await fixture("block-scalar.yml"));
    expect(r.uses).toEqual([]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ reason: "unsupported_value", file: "f.yml" });
  });

  it("skips a quoted scalar with an escape as unsupported_value", async () => {
    const r = inventoryText("f.yml", await fixture("escaped-quoted.yml"));
    expect(r.uses).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["unsupported_value"]);
  });

  it("skips docker://, ./, no @ref and ${{ }} with the right reasons, and keeps a reusable workflow call", async () => {
    const r = inventoryText("f.yml", await fixture("special.yml"));
    expect(r.skipped.map((s) => s.reason)).toEqual(["docker", "local", "no_ref", "malformed"]);
    expect(r.skipped.map((s) => s.line)).toEqual([4, 5, 6, 7]);
    expect(r.uses).toHaveLength(1);
    expect(r.uses[0]).toMatchObject({
      owner: "octo",
      repo: "repo",
      path: ".github/workflows/w.yml",
      ref: "v1",
      site: "job",
      jobId: "b",
      with: { x: "y" },
    });
    expect(r.uses[0]?.stepIndex).toBeUndefined();
  });

  it("rejects a file with two documents", async () => {
    const r = inventoryText("w.yml", await fixture("two-documents.yml"));
    expect(r.uses).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/^w\.yml: invalid YAML \(\w+\)$/);
  });

  it("ignores a uses key under with:", async () => {
    const r = inventoryText("f.yml", await fixture("with-uses.yml"));
    expect(names(r)).toEqual(["actions/github-script"]);
    expect(r.uses[0]?.with.uses).toBe("actions/not-a-use@v1");
    expect(r.skipped).toEqual([]);
  });
});

describe("inventoryWorkflows on a real folder", () => {
  it("ignores a symlink entry and a subfolder, and keeps real files", async () => {
    await withTempRoot(async (root, workflows) => {
      await writeFile(join(workflows, "real.yml"), await fixture("quoted.yml"));
      await writeFile(join(root, "outside.yml"), await fixture("with-uses.yml"));
      await symlink(join(root, "outside.yml"), join(workflows, "link.yml"));
      await mkdir(join(workflows, "sub.yml"));
      await writeFile(join(workflows, "sub.yml", "inner.yml"), await fixture("with-uses.yml"));
      await writeFile(join(workflows, "notes.txt"), "uses: a/b@c");
      const r = await inventoryWorkflows(createNodeSourceFs(), root);
      expect(r.filesRead).toBe(1);
      expect(r.uses.every((u) => u.file === ".github/workflows/real.yml")).toBe(true);
      expect(r.uses).toHaveLength(2);
      expect(r.warnings).toEqual([]);
    });
  });

  it("returns the no-directory warning for an unreadable directory", async () => {
    await withTempRoot(async (root, workflows) => {
      await writeFile(join(workflows, "a.yml"), await fixture("quoted.yml"));
      await chmod(workflows, 0o000);
      const r = await inventoryWorkflows(createNodeSourceFs(), root);
      if (r.filesRead === 1) return; // running as a user that ignores permissions (root): nothing to assert
      expect(r).toEqual({ uses: [], skipped: [], warnings: ["no .github/workflows directory"], filesRead: 0 });
    });
  });

  it("returns the no-directory warning when the folder is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "exorcist-actions-inv-"));
    try {
      const r = await inventoryWorkflows(createNodeSourceFs(), root);
      expect(r.warnings).toEqual(["no .github/workflows directory"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("skips a 2 MiB file with a warning and still processes the others", async () => {
    await withTempRoot(async (root, workflows) => {
      const big = `# ${"x".repeat(2 * 1024 * 1024)}\n${await fixture("quoted.yml")}`;
      await writeFile(join(workflows, "big.yml"), big);
      await writeFile(join(workflows, "small.yaml"), await fixture("with-uses.yml"));
      const r = await inventoryWorkflows(createNodeSourceFs(), root);
      expect(r.warnings).toEqual([".github/workflows/big.yml: file too large"]);
      expect(r.filesRead).toBe(1);
      expect(names(r)).toEqual(["actions/github-script"]);
    });
  });
});
