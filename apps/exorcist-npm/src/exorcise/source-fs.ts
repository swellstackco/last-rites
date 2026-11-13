// Read-only file system seam of the npm usage surface (Requirements 2.8, 2.9). No write, no spawn, no env.
import { lstat, readdir, readFile } from "node:fs/promises";

export interface DirEntry {
  name: string;
  kind: "file" | "dir" | "other";
  /** Bytes, when known (regular files). */
  size?: number;
}

export interface SourceFs {
  /** `undefined`: not a readable directory. */
  readDir(dir: string): Promise<DirEntry[] | undefined>;
  /** `undefined`: unreadable (missing, a directory, a symbolic link, permission denied). */
  readText(file: string): Promise<string | undefined>;
}

/** Symbolic links, sockets and the like are `other`: they are never followed. */
export function createNodeSourceFs(): SourceFs {
  return {
    async readDir(dir) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        const out: DirEntry[] = [];
        for (const e of entries) {
          if (e.isSymbolicLink()) out.push({ name: e.name, kind: "other" });
          else if (e.isDirectory()) out.push({ name: e.name, kind: "dir" });
          else if (e.isFile()) {
            let size: number | undefined;
            try {
              size = (await lstat(`${dir}/${e.name}`)).size;
            } catch {
              size = undefined;
            }
            out.push(size === undefined ? { name: e.name, kind: "file" } : { name: e.name, kind: "file", size });
          } else out.push({ name: e.name, kind: "other" });
        }
        return out;
      } catch {
        return undefined;
      }
    },
    async readText(file) {
      try {
        if (!(await lstat(file)).isFile()) return undefined;
        return await readFile(file, "utf8");
      } catch {
        return undefined;
      }
    },
  };
}
