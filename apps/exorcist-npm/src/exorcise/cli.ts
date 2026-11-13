// Requirements 10.1, 10.9, 10.10: the process entry point of `npm run exorcise`. The only reader of process.argv.
import { fileURLToPath } from "node:url";
import { loadCandidate } from "./candidate.js";
import { parseCliArgs, USAGE } from "./cli-args.js";
import { loadOracle } from "./oracles.js";
import { RECIPES } from "./recipes/index.js";
import { createNodeReportFs } from "./report-store.js";
import { exorcise } from "./run.js";
import { createNodeSourceFs } from "./source-fs.js";
import { createUsageSurface } from "./usage-surface.js";

/** Runs one proof from the command line; returns the exit code. */
export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseCliArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(USAGE);
    return 2;
  }
  const outcome = await exorcise(
    {
      usageSurface: createUsageSurface({ fs: createNodeSourceFs() }),
      fs: createNodeReportFs(),
      recipes: new Map(Object.entries(RECIPES)),
      loadOracle,
      loadCandidate,
      // The demo directory sits at the repository root: apps/exorcist-npm/src/exorcise -> four levels up.
      repoRoot: fileURLToPath(new URL("../../../../", import.meta.url)),
      print: (line) => console.log(line),
    },
    parsed.args,
  );
  if (outcome.exit !== 0) console.error(outcome.message);
  return outcome.exit;
}

if (!process.env["VITEST"] && /(cli\.[cm]?[jt]s|vite-node)$/.test(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    },
  );
}
