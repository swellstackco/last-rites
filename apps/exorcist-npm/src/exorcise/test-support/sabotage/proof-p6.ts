// Sabotage_List for Property 6 (usage surface). Each entry is the real usage surface with one defect added,
// either by filtering/rewriting what the SourceFs returns or by post-processing the result.
import type { CallSite, UsageSurfaceResult } from "@graveyard-kit/skeleton/proof";
import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import type { SourceFs } from "../../source-fs.js";
import type { UsageSurfaceFactory } from "../../usage-surface.p6.test.js";
import { createUsageSurface } from "../../usage-surface.js";

export const P6_REQUIRED = [
  "skips .js files that contain a type annotation",
  "counts a nested call once",
  "counts the expect(...) call as a call of the bound name",
  "ignores new expressions",
  "reads node_modules",
  "ignores optional chaining",
  "ignores string-literal element access",
  "treats == undefined as an undefined check",
  "classifies enclosing by directory only",
  "sorts with localeCompare",
  "returns files in listing order",
] as const;

const TEST_DIRS = new Set(["spec", "test", "tests", "__tests__", "__mocks__"]);

/** Real surface over a rewritten file system. */
const overFs = (wrap: (fs: SourceFs) => SourceFs): UsageSurfaceFactory => ({ fs }) => createUsageSurface({ fs: wrap(fs) });

/** Real surface whose result is rewritten. */
const overResult =
  (post: (r: UsageSurfaceResult, fs: SourceFs) => UsageSurfaceResult): UsageSurfaceFactory =>
  ({ fs }) => {
    const real = createUsageSurface({ fs });
    return async (input) => post(await real(input), fs);
  };

const filterCalls = (keep: (c: CallSite) => boolean): UsageSurfaceFactory =>
  overResult((r) => ({ ...r, callSites: r.callSites.filter(keep) }));

const rewriteText = (rewrite: (file: string, text: string) => string): UsageSurfaceFactory =>
  overFs((fs) => ({
    readDir: (d) => fs.readDir(d),
    async readText(file) {
      const t = await fs.readText(file);
      return t === undefined ? undefined : rewrite(file, t);
    },
  }));

const NM = "node_modules";
const NM_ALIAS = "node_modules_";

export const P6_SABOTAGES: Sabotage<UsageSurfaceFactory>[] = [
  {
    name: P6_REQUIRED[0],
    impl: rewriteText((file, t) => (file.endsWith(".js") && /:\s*Array</.test(t) ? "" : t)),
  },
  {
    name: P6_REQUIRED[1],
    impl: overResult((r) => ({
      ...r,
      // Drop the inner call of a nested pair: an earlier site on the same line has it as an argument.
      callSites: r.callSites.filter(
        (c) =>
          !r.callSites.some(
            (o) => o !== c && o.file === c.file && o.line === c.line && o.column < c.column && o.argTexts.some((a) => a.startsWith(`${c.callee}(`)),
          ),
      ),
    })),
  },
  {
    name: P6_REQUIRED[2],
    impl: overResult((r) => {
      const extra: CallSite[] = r.callSites
        .filter((c) => c.consumedAs !== undefined && c.callee === "x")
        .map((c) => ({ ...c, column: Math.max(1, c.column - 7), callee: "expect", argCount: 1, argTexts: [c.callee] }))
        .filter((c) => c.column >= 1);
      return { ...r, callSites: [...r.callSites, ...extra] };
    }),
  },
  { name: P6_REQUIRED[3], impl: filterCalls((c) => c.new !== true) },
  {
    name: P6_REQUIRED[4],
    impl: overFs((fs) => ({
      async readDir(d) {
        const list = await fs.readDir(d.split("/").map((s) => (s === NM_ALIAS ? NM : s)).join("/"));
        return list?.map((e) => (e.name === NM ? { ...e, name: NM_ALIAS } : e));
      },
      readText: (f) => fs.readText(f.split("/").map((s) => (s === NM_ALIAS ? NM : s)).join("/")),
    })),
  },
  { name: P6_REQUIRED[5], impl: filterCalls((c) => !c.callee.includes("?.")) },
  { name: P6_REQUIRED[6], impl: filterCalls((c) => !c.callee.includes('["')) },
  {
    name: P6_REQUIRED[7],
    impl: rewriteText((_f, t) => t.replace(/([^=!])== undefined/g, "$1=== undefined").replace(/undefined == /g, "undefined === ")),
  },
  {
    name: P6_REQUIRED[8],
    impl: overResult((r) => ({
      ...r,
      callSites: r.callSites.map((c) => ({
        ...c,
        enclosing: c.file.split("/").slice(0, -1).some((s) => TEST_DIRS.has(s)) ? ("test" as const) : ("src" as const),
      })),
    })),
  },
  {
    name: P6_REQUIRED[9],
    impl: overResult((r) => {
      const cmp = (a: { file: string; line: number; column: number }, b: { file: string; line: number; column: number }): number =>
        a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
      return { ...r, callSites: [...r.callSites].sort(cmp), importSites: [...r.importSites].sort(cmp) };
    }),
  },
];

/** Needs the order in which the file system listed the files, so it records every raw directory listing. */
const listingOrder: UsageSurfaceFactory = ({ fs }) => {
  const listings = new Map<string, { name: string; kind: string }[]>();
  const spy: SourceFs = {
    async readDir(d) {
      const list = await fs.readDir(d);
      if (list) listings.set(d.replace(/^\.\/?/, ""), list);
      return list;
    },
    readText: (f) => fs.readText(f),
  };
  const real = createUsageSurface({ fs: spy });
  return async (input) => {
    const r = await real(input);
    // Depth-first walk of the raw listings gives each file its position in "listing order".
    const rank = new Map<string, number>();
    const walk = (dir: string): void => {
      for (const e of listings.get(dir) ?? []) {
        const path = dir === "" ? e.name : `${dir}/${e.name}`;
        if (e.kind === "dir") walk(path);
        else rank.set(path, rank.size);
      }
    };
    walk("");
    const stable = <T extends { file: string }>(list: T[]): T[] =>
      list
        .map((v, i) => ({ v, i }))
        .sort((a, b) => (rank.get(a.v.file) ?? 0) - (rank.get(b.v.file) ?? 0) || a.i - b.i)
        .map((x) => x.v);
    return { ...r, callSites: stable(r.callSites), importSites: stable(r.importSites) };
  };
};
P6_SABOTAGES.push({ name: P6_REQUIRED[10], impl: listingOrder });
