import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { build } from "esbuild";

export const BUNDLE_REL = "mcp/dist/server.mjs";
/** Inside /power. */
export const POWER_SERVER_REL = "server/exorcist-mcp.mjs";

/** CommonJS-only dependencies (`typescript`, `intersect`, `deep-diff`) need `require` and the file globals inside an ES module bundle. */
export const SHIM = [
  'import { createRequire as __createRequire } from "node:module";',
  'import { fileURLToPath as __fileURLToPath } from "node:url";',
  'import { dirname as __dirname_of } from "node:path";',
  "const require = __createRequire(import.meta.url);",
  "const __filename = __fileURLToPath(import.meta.url);",
  "const __dirname = __dirname_of(__filename);",
].join("\n");

/** Copies the top-level `demo/*.json` files only (not `demo/proofs/`). */
export async function copyDemos(demoDir: string, demoOut: string): Promise<string[]> {
  await mkdir(demoOut, { recursive: true });
  const copied: string[] = [];
  for (const entry of await readdir(demoDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    await copyFile(join(demoDir, entry.name), join(demoOut, entry.name));
    copied.push(entry.name);
  }
  return copied.sort();
}

/** One self-contained ES module for the server, plus the demo snapshots beside it. */
export async function buildServer(opts: { outFile: string; demoOut: string; root: string }): Promise<void> {
  await mkdir(dirname(opts.outFile), { recursive: true });
  await build({
    entryPoints: [join(opts.root, "mcp/src/server.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: opts.outFile,
    banner: { js: SHIM },
    legalComments: "none",
    logLevel: "silent",
  });
  await copyDemos(join(opts.root, "demo"), opts.demoOut);
}
