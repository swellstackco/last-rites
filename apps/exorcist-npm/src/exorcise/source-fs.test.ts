import { mkdtemp, mkdir, rm, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeSourceFs } from "./source-fs.js";

async function withTree(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "source-fs-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("createNodeSourceFs", () => {
  it("reports file and directory kinds with sizes", async () => {
    await withTree(async (dir) => {
      await mkdir(join(dir, "sub"));
      await writeFile(join(dir, "a.js"), "abc");
      const entries = (await createNodeSourceFs().readDir(dir))!.sort((x, y) => x.name.localeCompare(y.name));
      expect(entries).toEqual([
        { name: "a.js", kind: "file", size: 3 },
        { name: "sub", kind: "dir" },
      ]);
    });
  });

  it("reports a symbolic link as other and never reads through it", async () => {
    await withTree(async (dir) => {
      await writeFile(join(dir, "real.js"), "x");
      await symlink(join(dir, "real.js"), join(dir, "link.js"));
      const fs = createNodeSourceFs();
      const entries = await fs.readDir(dir);
      expect(entries!.find((e) => e.name === "link.js")).toEqual({ name: "link.js", kind: "other" });
      expect(await fs.readText(join(dir, "link.js"))).toBeUndefined();
      expect(await fs.readText(join(dir, "real.js"))).toBe("x");
    });
  });

  it("gives undefined for a missing directory, a file used as a directory and a directory read as text", async () => {
    await withTree(async (dir) => {
      await writeFile(join(dir, "a.js"), "x");
      const fs = createNodeSourceFs();
      expect(await fs.readDir(join(dir, "missing"))).toBeUndefined();
      expect(await fs.readDir(join(dir, "a.js"))).toBeUndefined();
      expect(await fs.readText(dir)).toBeUndefined();
      expect(await fs.readText(join(dir, "missing.js"))).toBeUndefined();
    });
  });

  it("gives undefined for an unreadable file", async () => {
    await withTree(async (dir) => {
      const file = join(dir, "secret.js");
      await writeFile(file, "x");
      await chmod(file, 0o000);
      const proc = globalThis as { process?: { getuid?: () => number } };
      const isRoot = proc.process?.getuid?.() === 0;
      const text = await createNodeSourceFs().readText(file);
      if (!isRoot) expect(text).toBeUndefined();
    });
  });
});
