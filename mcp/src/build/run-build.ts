import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLE_REL, POWER_SERVER_REL, buildServer, copyDemos } from "./build.js";

// Script entry of `npm run build -w @graveyard-kit/exorcist-mcp`: the bundle, then a copy into /power/server (ignored by git).
const root = fileURLToPath(new URL("../../../", import.meta.url));
const outFile = join(root, BUNDLE_REL);
const demoOut = join(dirname(outFile), "demo");
await buildServer({ outFile, demoOut, root });

const powerFile = join(root, "power", POWER_SERVER_REL);
await mkdir(dirname(powerFile), { recursive: true });
await copyFile(outFile, powerFile);
await copyDemos(join(root, "demo"), join(dirname(powerFile), "demo"));
console.log(`built ${BUNDLE_REL} (${((await stat(outFile)).size / 1024 / 1024).toFixed(1)} MB) and power/${POWER_SERVER_REL}`);
