import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TREES = fileURLToPath(new URL("../__fixtures__/trees/", import.meta.url));

/** The files of one fixture tree as `{ "relative/path": text }`. */
export function loadTree(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(TREES, name, rel))) {
      const r = rel === "" ? entry : `${rel}/${entry}`;
      if (statSync(join(TREES, name, r)).isDirectory()) walk(r);
      else out[r] = readFileSync(join(TREES, name, r), "utf8");
    }
  };
  walk("");
  return out;
}
