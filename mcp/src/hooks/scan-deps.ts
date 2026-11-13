import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { nodeEntryEnv, nodeToolDeps, runHook } from "./entry.js";
import { runScanDeps } from "./run-scan-deps.js";

const env = nodeEntryEnv();
await runHook(env, "scan-deps-on-save", async () =>
  runScanDeps({
    tools: await nodeToolDeps(env.root),
    root: env.root,
    readText: async (p) => {
      try {
        return await readFile(p, "utf8");
      } catch {
        return undefined;
      }
    },
    writeText: async (p, t) => {
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, t);
    },
  }),
);
