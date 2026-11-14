// Property 13: argument parsers, exit codes and write confinement (Requirements 9.2 to 9.6, 15.1 to 15.8).
import fc from "fast-check";
import { parseProofReport } from "@last-rites/skeleton/proof";
import type { ReportFs, SourceFs } from "@last-rites/exorcist-npm/programmatic";
import { parseExorciseArgs } from "../../exorcise/cli-args.js";
import type { ExorciseArgs } from "../../exorcise/cli-args.js";
import { runExorcise } from "../../exorcise/run.js";
import type { ExorciseDeps, ExorciseOutcome } from "../../exorcise/run.js";
import { parseScanArgs } from "../../scan/cli-args.js";
import { memorySourceFs } from "../memory-source-fs.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test. */
export interface ExorciseImpl {
  parseScanArgs: typeof parseScanArgs;
  parseExorciseArgs: typeof parseExorciseArgs;
  runExorcise(args: ExorciseArgs, deps: ExorciseDeps): Promise<ExorciseOutcome>;
}
export const realExorciseImpl: ExorciseImpl = { parseScanArgs, parseExorciseArgs, runExorcise };

// ------------------------------------------------------------------ parsers

type Group = string[];
const valueArb = fc.constantFrom("a", "repo", "./x", "../y/z", "demo/cache");

interface Rendered {
  groups: Group[];
  fault: "none" | "repeat" | "unknown" | "positional" | "novalue" | "missing" | "badfix";
}

const scanGroupsArb: fc.Arbitrary<Group[]> = fc
  .record({
    repo: valueArb,
    out: fc.option(valueArb, { nil: undefined }),
    label: fc.option(fc.constantFrom("acme/widgets", "a/b.c"), { nil: undefined }),
    ref: fc.option(fc.constantFrom("main", "v1.2", "144b4f9"), { nil: undefined }),
    cache: fc.option(valueArb, { nil: undefined }),
    order: fc.nat(),
  })
  .map((r) => {
    const groups: Group[] = [["--repo", r.repo]];
    if (r.out !== undefined) groups.push(["--out", r.out]);
    if (r.label !== undefined) groups.push(["--label", r.label]);
    if (r.ref !== undefined) groups.push(["--ref", r.ref]);
    if (r.cache !== undefined) groups.push(["--cache", r.cache]);
    return rotate(groups, r.order);
  });

const exorciseGroupsArb: fc.Arbitrary<Group[]> = fc
  .record({
    repo: valueArb,
    action: fc.constantFrom("actions/checkout", "actions-rs/toolchain", "Actions-RS/Cargo"),
    fix: fc.constantFrom("pin", "swap"),
    write: fc.boolean(),
    fresh: fc.boolean(),
    out: fc.option(fc.constantFrom("demo/proofs/x-actions/r.json", "/t/proofs/abc/r.json"), { nil: undefined }),
    label: fc.option(fc.constantFrom("acme/widgets", "a/b.c"), { nil: undefined }),
    commit: fc.option(fc.constantFrom("abc123", "144b4f9"), { nil: undefined }),
    cache: fc.option(valueArb, { nil: undefined }),
    order: fc.nat(),
  })
  .map((r) => {
    const groups: Group[] = [["--repo", r.repo], ["--action", r.action], ["--fix", r.fix]];
    if (r.write) groups.push(["--write"]);
    if (r.fresh) groups.push(["--fresh"]);
    if (r.out !== undefined) groups.push(["--out", r.out]);
    if (r.label !== undefined) groups.push(["--label", r.label]);
    if (r.commit !== undefined) groups.push(["--commit", r.commit]);
    if (r.cache !== undefined) groups.push(["--cache", r.cache]);
    return rotate(groups, r.order);
  });

function rotate<T>(xs: T[], n: number): T[] {
  const k = xs.length === 0 ? 0 : n % xs.length;
  return [...xs.slice(k), ...xs.slice(0, k)];
}

function withFault(groups: Group[], fault: Rendered["fault"], exorcise: boolean): Group[] {
  switch (fault) {
    case "none":
      return groups;
    case "repeat":
      return [...groups, groups[0]!];
    case "unknown":
      return [...groups, ["--bogus", "x"]];
    case "positional":
      return [...groups, ["stray"]];
    case "novalue":
      return [...groups, ["--cache"]];
    case "missing":
      return groups.filter((g) => g[0] !== "--repo");
    case "badfix":
      return exorcise ? groups.map((g) => (g[0] === "--fix" ? ["--fix", "both"] : g)) : [...groups, ["--fix", "both"]];
  }
}

const faultArb = fc.constantFrom<Rendered["fault"]>("repeat", "unknown", "positional", "novalue", "missing", "badfix");
const flat = (gs: Group[]): string[] => gs.flat();

/** Tokens that are strings, flags, values, positionals; and now and then not a string at all. */
const oddArgvArb: fc.Arbitrary<unknown[]> = fc.array(
  fc.oneof(
    fc.constantFrom("--repo", "--action", "--fix", "--write", "--fresh", "--out", "--label", "--ref", "--cache", "--commit", "pin", "swap", ""),
    fc.string({ maxLength: 12 }),
    fc.string({ minLength: 300, maxLength: 400 }),
    fc.anything(),
  ),
  { maxLength: 14 },
);

// ------------------------------------------------------------------ the run scenario

type Kind = "checkout" | "toolchain" | "toolchainWith" | "other";
type ManifestMode = "ok" | "required" | "fail";

interface Scenario {
  files: Kind[][];
  fix: "pin" | "swap";
  action: "actions/checkout" | "actions-rs/toolchain";
  write: boolean;
  out: boolean;
  resolveFails: boolean;
  manifest: ManifestMode;
  noMutants: boolean;
}

const SHAS: Record<string, string> = { v3: "1".repeat(40), v1: "2".repeat(40) };
const OUT = "/elsewhere/proofs/x-actions/r.json";
const ROOT = "/repo";
// `toolchainWith` is rare: it makes the swap refuse (unmapped_input), which would hide the other outcomes.
const kindArb: fc.Arbitrary<Kind> = fc.oneof(
  { arbitrary: fc.constant<Kind>("checkout"), weight: 3 },
  { arbitrary: fc.constant<Kind>("toolchain"), weight: 3 },
  { arbitrary: fc.constant<Kind>("toolchainWith"), weight: 1 },
  { arbitrary: fc.constant<Kind>("other"), weight: 2 },
);

const scenarioArb: fc.Arbitrary<Scenario> = fc.record({
  files: fc.array(fc.array(kindArb, { maxLength: 4 }), { minLength: 1, maxLength: 3 }),
  fix: fc.constantFrom("pin", "swap"),
  action: fc.constantFrom("actions/checkout", "actions-rs/toolchain"),
  write: fc.boolean(),
  out: fc.boolean(),
  resolveFails: fc.boolean(),
  manifest: fc.constantFrom<ManifestMode>("ok", "required", "fail"),
  noMutants: fc.boolean(),
});

const isTarget = (k: Kind, a: Scenario["action"]): boolean =>
  a === "actions/checkout" ? k === "checkout" : k === "toolchain" || k === "toolchainWith";

const HEAD = "name: ci\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n";
const step = (k: Kind, fix: Scenario["fix"], hit: boolean, pinChanges: boolean): string => {
  const base = k === "checkout" ? ["actions/checkout", "v3"] : ["actions-rs/toolchain", "v1"];
  if (k === "other") return "      - uses: actions/cache@v4\n";
  const withLines = k === "toolchainWith" ? "        with:\n          cache-key: x\n" : "";
  let name = `${base[0]}@${base[1]}`;
  if (hit && pinChanges) name = fix === "pin" ? `${base[0]}@${SHAS[base[1]!]} # ${base[1]}` : `dtolnay/rust-toolchain@master # was ${base[0]}@${base[1]}`;
  return `      - uses: ${name}\n${withLines}`;
};
const renderFile = (kinds: Kind[], s: Scenario, changed: boolean): string =>
  HEAD + (kinds.length === 0 ? "      - run: echo\n" : kinds.map((k) => step(k, s.fix, isTarget(k, s.action), changed)).join(""));

interface Expected {
  attempt: boolean;
  status?: "proved" | "counterexample" | "error";
  weak: boolean;
  exit: 0 | 1;
  workflowWrites: Map<string, string>;
  outWritten: boolean;
}

function expectedOf(s: Scenario): Expected {
  const none: Expected = { attempt: false, weak: false, exit: 1, workflowWrites: new Map(), outWritten: false };
  const selected = s.files.some((f) => f.some((k) => isTarget(k, s.action)));
  if (!selected) return none;
  let status: "proved" | "counterexample" | "error";
  if (s.fix === "pin") {
    status = s.resolveFails ? "error" : "proved";
  } else {
    if (s.action !== "actions-rs/toolchain") return none;
    // the manifest is fetched first (Requirement 15.3); only then can the rewrite refuse (unmapped_input)
    if (s.manifest !== "fail" && s.files.some((f) => f.includes("toolchainWith"))) return none;
    status = s.manifest === "fail" ? "error" : s.manifest === "required" ? "counterexample" : "proved";
  }
  const weak = status === "proved" && s.noMutants;
  const solid = status === "proved" && !weak;
  const workflowWrites = new Map<string, string>();
  if (s.write && solid) {
    s.files.forEach((f, i) => {
      if (f.some((k) => isTarget(k, s.action))) workflowWrites.set(`${ROOT}/.github/workflows/f${i}.yml`, renderFile(f, s, true));
    });
  }
  return { attempt: true, status, weak, exit: s.write && !solid ? 1 : 0, workflowWrites, outWritten: s.out };
}

export interface RunHarness {
  writes: { path: string; text: string }[];
  printed: string[];
  deps: ExorciseDeps;
  args: ExorciseArgs;
  originals: Record<string, string>;
}

export function harnessOf(s: Scenario): RunHarness {
  const originals: Record<string, string> = {};
  s.files.forEach((f, i) => {
    originals[`.github/workflows/f${i}.yml`] = renderFile(f, s, false);
  });
  const fs: SourceFs = memorySourceFs(
    originals,
    Object.keys(originals).map((p) => ({ name: p.split("/").pop()!, kind: "file" as const, size: originals[p]!.length })),
    ROOT,
  );
  const writes: { path: string; text: string }[] = [];
  const reports: ReportFs = {
    async readText() {
      return undefined;
    },
    async writeAtomic(path, text) {
      writes.push({ path, text });
    },
  };
  const printed: string[] = [];
  const deps: ExorciseDeps = {
    fs,
    reports,
    evidence: {
      async resolveCommit(_o, _r, ref) {
        return s.resolveFails ? { ok: false, reason: { source: "github", category: "not_found" } } : { ok: true, value: SHAS[ref] ?? "3".repeat(40) };
      },
      async fetchManifest() {
        if (s.manifest === "fail") return { ok: false, reason: { source: "github", category: "not_found" } };
        const inputs = s.manifest === "required" ? [["toolchain", { required: true, hasDefault: false }] as const] : [];
        return { ok: true, value: { inputs: new Map(inputs), outputs: new Set<string>() } };
      },
    },
    print: (line) => printed.push(line),
    ...(s.noMutants ? { mutants: { pin: [], contract: [] } } : {}),
  };
  const args: ExorciseArgs = {
    repo: ROOT,
    action: s.action,
    fix: s.fix,
    write: s.write,
    ...(s.out ? { out: OUT } : {}),
    label: "acme/widgets",
    cache: ".cache/actions",
    fresh: false,
  };
  return { writes, printed, deps, args, originals };
}

const showOf = (x: unknown): string => {
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
};

export const exorciseProperties: ReadonlyArray<NamedProperty<ExorciseImpl>> = [
  {
    name: "parsers never throw, on any argv",
    build: (impl) =>
      fc.property(oddArgvArb, (argv) => {
        const a = impl.parseScanArgs(argv as string[]);
        const b = impl.parseExorciseArgs(argv as string[]);
        for (const r of [a, b]) {
          if (typeof r.ok !== "boolean") throw new Error(`no verdict for ${showOf(argv)}`);
          if (!r.ok && (typeof r.message !== "string" || r.message === "")) throw new Error("rejection without a message");
        }
      }),
  },
  {
    name: "scan parser accepts exactly the grammar of Requirement 9.2",
    build: (impl) =>
      fc.property(scanGroupsArb, fc.option(faultArb, { nil: undefined }), (groups, fault) => {
        const argv = flat(withFault(groups, fault === undefined || fault === "badfix" ? "none" : fault, false));
        const r = impl.parseScanArgs(argv, "/w");
        const faulty = fault !== undefined && fault !== "badfix";
        if (r.ok === faulty) throw new Error(`${faulty ? "accepted" : "rejected"} ${showOf(argv)}`);
        if (r.ok) {
          const want = (flag: string): string | undefined => groups.find((g) => g[0] === flag)?.[1];
          if (r.args.repo !== want("--repo") || r.args.out !== want("--out")) throw new Error(`wrong fields for ${showOf(argv)}`);
          if (want("--ref") !== undefined && r.args.ref !== want("--ref")) throw new Error("wrong ref");
        }
      }),
  },
  {
    name: "exorcise parser accepts exactly the grammar of Requirement 15.1",
    build: (impl) =>
      fc.property(exorciseGroupsArb, fc.option(faultArb, { nil: undefined }), (groups, fault) => {
        const argv = flat(withFault(groups, fault ?? "none", true));
        const r = impl.parseExorciseArgs(argv, "/w");
        if (r.ok === (fault !== undefined)) throw new Error(`${fault !== undefined ? "accepted" : "rejected"} ${showOf(argv)}`);
        if (r.ok) {
          const want = (flag: string): string | undefined => groups.find((g) => g[0] === flag)?.[1];
          const has = (flag: string): boolean => groups.some((g) => g[0] === flag);
          const a = r.args;
          if (a.repo !== want("--repo") || a.action !== want("--action") || a.fix !== want("--fix")) throw new Error("wrong fields");
          if (a.write !== has("--write") || a.fresh !== has("--fresh") || a.out !== want("--out") || a.commit !== want("--commit")) {
            throw new Error(`wrong switches or options for ${showOf(argv)}`);
          }
        }
      }),
  },
  {
    name: "exorcise writes only proved changed workflow files, only with --write, and exactly the proved text",
    build: (impl) =>
      fc.asyncProperty(scenarioArb, async (s) => {
        const h = harnessOf(s);
        const want = expectedOf(s);
        const outcome = await impl.runExorcise(h.args, h.deps);
        const where = `scenario ${showOf(s)}`;

        if (outcome.exit !== want.exit) throw new Error(`exit ${outcome.exit}, expected ${want.exit} for ${where}`);
        if ((outcome.attempt !== undefined) !== want.attempt) throw new Error(`attempt presence for ${where}`);
        if (want.attempt && outcome.attempt!.status !== want.status) throw new Error(`status ${outcome.attempt!.status} for ${where}`);
        if (want.attempt && outcome.attempt!.weak !== want.weak) throw new Error(`weak flag for ${where}`);

        // confinement: every write is a changed Workflow_File or the --out file
        const workflowPrefix = `${ROOT}/.github/workflows/`;
        for (const w of h.writes) {
          if (w.path === OUT) {
            if (!s.out) throw new Error(`wrote the report without --out for ${where}`);
            if (!parseProofReport(w.text).ok) throw new Error(`the report written is not valid for ${where}`);
            continue;
          }
          const expectedText = want.workflowWrites.get(w.path);
          if (!w.path.startsWith(workflowPrefix) || expectedText === undefined) throw new Error(`unexpected write to ${w.path} for ${where}`);
          if (w.text !== expectedText) throw new Error(`wrote a text other than the proved one to ${w.path} for ${where}`);
          if (w.text === h.originals[w.path.slice(ROOT.length + 1)]) throw new Error(`wrote an unchanged file ${w.path}`);
        }
        const wroteWorkflows = new Set(h.writes.filter((w) => w.path !== OUT).map((w) => w.path));
        if (wroteWorkflows.size !== want.workflowWrites.size || [...want.workflowWrites.keys()].some((p) => !wroteWorkflows.has(p))) {
          throw new Error(`the set of workflow files written differs for ${where}`);
        }
        if (h.writes.some((w) => w.path === OUT) !== want.outWritten) throw new Error(`report write for ${where}`);
        if (outcome.written.length !== h.writes.length) throw new Error(`written list differs from the writes for ${where}`);
        if (s.write && want.attempt && want.exit === 1 && !h.printed.some((l) => l.startsWith("not written:"))) {
          throw new Error(`no "not written" line for ${where}`);
        }
        if (Object.keys(h.deps).some((k) => !["fs", "reports", "evidence", "print", "mutants"].includes(k))) {
          throw new Error("the dependencies hold something unexpected");
        }
      }),
  },
];
