// Requirement 10.7: reading and atomically writing a Proof_Report file (pattern of scan/demo-snapshot.ts).
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export interface ReportFs {
  /** The text of the file, or `undefined` when it does not exist. */
  readText(path: string): Promise<string | undefined>;
  /** Temp file in the same directory, then rename; the temp file is removed on failure. */
  writeAtomic(path: string, text: string): Promise<void>;
}

/** The node operations, replaceable so tests can inject a failure. */
export interface NodeReportOps {
  rename(from: string, to: string): Promise<void>;
}

export function createNodeReportFs(ops: NodeReportOps = { rename }): ReportFs {
  let counter = 0;
  return {
    async readText(path) {
      try {
        return await readFile(path, "utf8");
      } catch (e) {
        if ((e as { code?: unknown }).code === "ENOENT") return undefined;
        throw e;
      }
    },
    async writeAtomic(path, text) {
      const dir = dirname(path);
      counter += 1;
      const tmp = join(dir, `.${basename(path)}.${counter}.tmp`);
      await mkdir(dir, { recursive: true });
      try {
        await writeFile(tmp, text, "utf8");
        await ops.rename(tmp, path);
      } catch (e) {
        await rm(tmp, { force: true }).catch(() => undefined);
        throw e;
      }
    },
  };
}
