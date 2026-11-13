import { realpathSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createExorcistServer } from "./create-server.js";
import { wireRealDeps } from "./wire.js";

/**
 * The only reader of the environment, the working directory and `import.meta.url` (Requirement 2.4).
 * stdout carries protocol messages only, so every console method that writes to it is sent to stderr (Requirement 2.3).
 */
export async function main(): Promise<void> {
  console.log = console.error;
  console.info = console.error;
  console.debug = console.error;
  const bundleDir = dirname(fileURLToPath(import.meta.url));
  const deps = wireRealDeps(process.env, bundleDir, { cwd: process.cwd() });
  const server = createExorcistServer(deps);
  const transport = new StdioServerTransport();
  // The client closing stdin is the normal way to stop a stdio server.
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("close", () => process.exit(0));
  await server.connect(transport);
}

// Entry guard: run only when this file is the process entry (the bundle, or `node server.ts`), never when imported by a test.
function isEntry(): boolean {
  try {
    const entry = process.argv[1];
    return entry !== undefined && realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}
if (!process.env["VITEST"] && isEntry()) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : "server failed to start");
    process.exit(1);
  });
}
