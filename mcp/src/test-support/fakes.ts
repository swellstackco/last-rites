import type { DemoStore, ReportFs } from "@graveyard-kit/exorcist-npm/programmatic";
import type { FsProbe } from "../guards.js";

// Fakes for the tool tests: no disk, no network.

/** An in-memory FsProbe over `{ absolutePath: text }`. Every ancestor directory of a file exists. */
export function memoryProbe(files: Readonly<Record<string, string>>): FsProbe & { reads: string[]; stats: string[] } {
  const dirs = new Set<string>(["/"]);
  for (const f of Object.keys(files)) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/") || "/");
  }
  const reads: string[] = [];
  const stats: string[] = [];
  return {
    reads,
    stats,
    async stat(path) {
      stats.push(path);
      if (Object.prototype.hasOwnProperty.call(files, path)) return { kind: "file" };
      if (dirs.has(path)) return { kind: "dir" };
      return undefined;
    },
    async readText(path) {
      reads.push(path);
      return Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined;
    },
  };
}

/** A recording ReportFs: keeps every write; `files` is the current content. */
export function recordingReportFs(initial: Record<string, string> = {}): ReportFs & {
  files: Map<string, string>;
  writes: Array<{ path: string; text: string }>;
  reads: string[];
} {
  const files = new Map(Object.entries(initial));
  const writes: Array<{ path: string; text: string }> = [];
  const reads: string[] = [];
  return {
    files,
    writes,
    reads,
    async readText(path) {
      reads.push(path);
      return files.get(path);
    },
    async writeAtomic(path, text) {
      writes.push({ path, text });
      files.set(path, text);
    },
  };
}

/** A DemoStore over `{ name: text }` that records the names asked for. */
export function fakeDemoStore(snapshots: Readonly<Record<string, string>> = {}): DemoStore & { asked: string[] } {
  const asked: string[] = [];
  const store = (async (name: string) => {
    asked.push(name);
    const text = Object.prototype.hasOwnProperty.call(snapshots, name) ? snapshots[name] : undefined;
    return text === undefined ? undefined : new TextEncoder().encode(text);
  }) as DemoStore & { asked: string[] };
  store.asked = asked;
  return store;
}

export interface Counted<A extends unknown[], R> {
  (...args: A): R;
  calls: A[];
}

/** Wraps a function with a call counter and an argument log. */
export function counting<A extends unknown[], R>(fn: (...args: A) => R): Counted<A, R> {
  const wrapped = ((...args: A) => {
    wrapped.calls.push(args);
    return fn(...args);
  }) as Counted<A, R>;
  wrapped.calls = [];
  return wrapped;
}
