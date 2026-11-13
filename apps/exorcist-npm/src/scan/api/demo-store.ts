import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Lower-case letters, digits and `-` only: no `/`, `\`, `.` or `%`, so traversal is impossible by construction. */
export const DEMO_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** `undefined` means not found. */
export type DemoStore = (name: string) => Promise<Uint8Array | undefined>;

const NOT_FOUND_CODES = new Set(["ENOENT", "EISDIR", "ENOTDIR"]);

export function createFsDemoStore(demoDir: string): DemoStore {
  return async (name) => {
    // Guard against misuse: the handler validates first, but this must never build a path from an unchecked name.
    if (!DEMO_NAME_PATTERN.test(name)) throw new Error(`invalid demo name: ${JSON.stringify(name)}`);
    try {
      return new Uint8Array(await readFile(join(demoDir, `${name}.json`)));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      if (code !== undefined && NOT_FOUND_CODES.has(code)) return undefined;
      throw err;
    }
  };
}
