import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/** The pinned Oracles (devDependencies of this package). Nothing else is loadable. */
const PINNED: ReadonlySet<string> = new Set(["intersect", "deep-diff"]);

const require = createRequire(import.meta.url);

export interface LoadedOracle {
  module: unknown;
  version: string;
}

/** Load a pinned Oracle and its installed version; `undefined` for any other name. No network. */
export function loadOracle(pkg: string): LoadedOracle | undefined {
  if (!PINNED.has(pkg)) return undefined;
  const module: unknown = require(pkg);
  const manifest = JSON.parse(readFileSync(require.resolve(`${pkg}/package.json`), "utf8")) as {
    version?: unknown;
  };
  if (typeof manifest.version !== "string") return undefined;
  return { module, version: manifest.version };
}
