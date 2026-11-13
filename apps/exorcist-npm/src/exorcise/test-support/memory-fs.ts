// An in-memory SourceFs over a map of path to text (paths relative to the root `.` joined with "/").
import type { DirEntry, SourceFs } from "../source-fs.js";

export interface MemoryFsOptions {
  /** Shuffle the listing order of every directory with this seed (same seed, same order). */
  shuffle?: number;
  /** Files that exist in listings but whose text cannot be read. */
  unreadable?: readonly string[];
  /** Files reported with this size in bytes instead of their text length. */
  oversized?: Readonly<Record<string, number>>;
  /** Paths listed as `other` (a symbolic link, say). */
  links?: readonly string[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function norm(p: string): string {
  return p.replace(/^\.?\/+/, "").replace(/\/+$/, "");
}

/** `root` is the directory the walk starts from; keys of `files` are paths below it. */
export function createMemoryFs(files: Readonly<Record<string, string>>, root = ".", options: MemoryFsOptions = {}): SourceFs {
  const base = norm(root) === "." ? "" : norm(root);
  const full = (rel: string): string => (base === "" ? norm(rel) : `${base}/${norm(rel)}`);
  const entries = new Map<string, string>(Object.keys(files).map((k) => [full(k), files[k]!]));
  const links = new Set((options.links ?? []).map(full));
  const unreadable = new Set((options.unreadable ?? []).map(full));
  const oversized = new Map(Object.entries(options.oversized ?? {}).map(([k, v]) => [full(k), v]));

  return {
    async readDir(dir) {
      const d = norm(dir) === "." ? "" : norm(dir);
      const prefix = d === "" ? "" : `${d}/`;
      const found = new Map<string, DirEntry>();
      let exists = d === "" && (entries.size > 0 || base === "");
      for (const path of [...entries.keys(), ...links]) {
        if (!path.startsWith(prefix) || path === d) continue;
        exists = true;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash >= 0) {
          const name = rest.slice(0, slash);
          if (!found.has(name)) found.set(name, { name, kind: "dir" });
        } else if (links.has(path)) found.set(rest, { name: rest, kind: "other" });
        else {
          const text = entries.get(path)!;
          found.set(rest, { name: rest, kind: "file", size: oversized.get(path) ?? text.length });
        }
      }
      if (!exists) return undefined;
      const list = [...found.values()];
      if (options.shuffle !== undefined) {
        const rnd = mulberry32(options.shuffle);
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [list[i], list[j]] = [list[j]!, list[i]!];
        }
      }
      return list;
    },
    async readText(file) {
      const p = norm(file);
      if (unreadable.has(p) || links.has(p)) return undefined;
      return entries.get(p);
    },
  };
}
