import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createNodeReportFs } from "./report-store.js";

async function withTemp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "report-store-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("createNodeReportFs", () => {
  it("writes then reads the same bytes and creates the directory", async () => {
    await withTemp(async (dir) => {
      const fs = createNodeReportFs();
      const path = join(dir, "proofs", "repo-a", "pkg.json");
      const text = '{"a":"é\\n"}\n';
      await fs.writeAtomic(path, text);
      expect(await fs.readText(path)).toBe(text);
      expect(await readFile(path, "utf8")).toBe(text);
      expect(await readdir(join(dir, "proofs", "repo-a"))).toEqual(["pkg.json"]);
    });
  });

  it("reads a missing file as undefined", async () => {
    await withTemp(async (dir) => {
      expect(await createNodeReportFs().readText(join(dir, "nope", "x.json"))).toBeUndefined();
    });
  });

  it("removes the temp file and keeps the old file when the rename fails", async () => {
    await withTemp(async (dir) => {
      const path = join(dir, "x.json");
      await writeFile(path, "old\n", "utf8");
      const fs = createNodeReportFs({ rename: async () => Promise.reject(new Error("boom")) });
      await expect(fs.writeAtomic(path, "new\n")).rejects.toThrow("boom");
      expect(await readdir(dir)).toEqual(["x.json"]);
      expect(await readFile(path, "utf8")).toBe("old\n");
    });
  });
});
