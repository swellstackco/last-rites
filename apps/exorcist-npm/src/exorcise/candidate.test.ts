import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCandidate } from "./candidate.js";

async function withDir<T>(f: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "candidate-"));
  try {
    return await f(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("loadCandidate", () => {
  it("uses the default export and records name and source", async () => {
    await withDir(async (dir) => {
      const text = "function f(x) { return x; }\nf.big = (x) => x;\nexport default f;\n";
      await writeFile(join(dir, "c.mjs"), text);
      const c = await loadCandidate(join(dir, "c.mjs"));
      expect(c.name).toBe("c.mjs");
      expect(c.source).toBe(text);
      const m = c.module as ((x: number) => number) & { big: unknown };
      expect(m(3)).toBe(3);
      expect(typeof m.big).toBe("function");
    });
  });

  it("falls back to the namespace without a default export", async () => {
    await withDir(async (dir) => {
      await writeFile(join(dir, "n.mjs"), "export const big = (x) => x;\n");
      const c = await loadCandidate(join(dir, "n.mjs"));
      expect(typeof (c.module as { big: unknown }).big).toBe("function");
    });
  });

  it("rejects a missing file with a clear message", async () => {
    await withDir(async (dir) => {
      await expect(loadCandidate(join(dir, "nope.mjs"))).rejects.toThrow(/cannot read candidate file/);
    });
  });

  it("rejects a file that throws on import", async () => {
    await withDir(async (dir) => {
      await writeFile(join(dir, "bad.mjs"), "throw new Error('boom');\n");
      await expect(loadCandidate(join(dir, "bad.mjs"))).rejects.toThrow(/cannot import candidate file.*boom/);
    });
  });
});
