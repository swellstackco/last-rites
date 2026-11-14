// Arbitraries that build a workflow file text together with the model of the uses it holds
// (the shapes are listed in the design's "Correctness Properties" introduction).
import fc from "fast-check";
import type { ActionUse, LineRange, SkippedUse, SkipReasonActions, WithKey } from "../../inventory/types.js";

// ---------------------------------------------------------------- specs (plain data, shrinkable)

export type Style = "plain" | "single" | "double";

export interface ActionParts {
  owner: string;
  repo: string;
  path?: string;
  ref: string;
}

export type UseSpec =
  | { kind: "action"; parts: ActionParts; style: Style }
  | { kind: "skip"; text: string; reason: SkipReasonActions; style: Style }
  | { kind: "unsupported"; variant: "alias" | "escaped" | "number" };

export type ValueSpec =
  | { kind: "word"; text: string }
  | { kind: "single"; text: string }
  | { kind: "double"; text: string }
  | { kind: "int"; text: string }
  | { kind: "bool"; text: string }
  | { kind: "block"; lines: string[] };

export interface WithSpec {
  flow: boolean;
  entries: Array<{ key: string; value: ValueSpec }>;
}

export interface StepSpec {
  /** `run`-only step when `use` is absent. */
  use?: UseSpec;
  hasId: boolean;
  hasName: boolean;
  with?: WithSpec;
  flow: boolean;
  tailComment: boolean;
  commentBefore: boolean;
  blankBefore: number;
  decoy?: "env" | "run-quoted" | "run-block" | undefined;
  /** Mentions of `steps.<id>.outputs.<name>`; `target` is reduced modulo the number of steps. */
  mentions: Array<{ target: number; name: string; where: "run" | "if" }>;
  /** Entry order (sort keys). */
  order: number[];
}

export interface JobSpec {
  base: string;
  reusable?: { use: UseSpec; with?: WithSpec };
  steps: StepSpec[];
  jobDecoy: boolean;
  blankBefore: number;
}

export interface FileSpec {
  eol: "\n" | "\r\n";
  finalEol: boolean;
  seqIndent: 4 | 6;
  headerComment: boolean;
  jobs: JobSpec[];
}

// ---------------------------------------------------------------- arbitraries

const OWNERS = ["actions", "dtolnay", "actions-rs", "softprops", "a1", "Some-Org"];
const REPOS = ["checkout", "toolchain", "cargo", "rust-toolchain", "x.y", "setup_node"];
const PATHS = ["sub", "a/b", "dir-1/x.y"];
const SHA_L = "0123456789abcdef0123456789abcdef01234567";
const SHA_U = SHA_L.toUpperCase();
const REFS = ["v1", "v4.1.2", "main", "master", "release/v1", "stable", SHA_L, SHA_U];

const styleArb = fc.constantFrom<Style>("plain", "single", "double");

export const actionPartsArb: fc.Arbitrary<ActionParts> = fc
  .tuple(
    fc.constantFrom(...OWNERS),
    fc.constantFrom(...REPOS),
    fc.option(fc.constantFrom(...PATHS), { nil: undefined }),
    fc.constantFrom(...REFS),
  )
  .map(([owner, repo, path, ref]) => (path === undefined ? { owner, repo, ref } : { owner, repo, path, ref }));

const SKIPS: ReadonlyArray<readonly [string, SkipReasonActions]> = [
  ["docker://alpine:3.18", "docker"],
  ["docker://ghcr.io/o/i@sha256:abc", "docker"],
  ["./.github/actions/local", "local"],
  ["../shared/action", "local"],
  ["actions/checkout", "no_ref"],
  ["a/b@${{ matrix.version }}", "malformed"],
  ["a/b/../c@v1", "malformed"],
  ["a/b@v 1", "malformed"],
  ["@v1", "malformed"],
  ["x@v1", "malformed"],
  ["a/b@" + "x".repeat(300), "malformed"],
  ["-x/y@v1", "malformed"],
];

export const useSpecArb: fc.Arbitrary<UseSpec> = fc.oneof(
  { weight: 8, arbitrary: fc.record({ kind: fc.constant("action" as const), parts: actionPartsArb, style: styleArb }) },
  {
    weight: 3,
    arbitrary: fc.tuple(fc.constantFrom(...SKIPS), styleArb).map(([[text, reason], style]) => ({
      kind: "skip" as const,
      text,
      reason,
      style,
    })),
  },
  { weight: 1, arbitrary: fc.constantFrom("alias" as const, "escaped" as const, "number" as const).map((variant) => ({ kind: "unsupported" as const, variant })) },
);

const WORDS = ["stable", "nightly", "beta", "x86_64-unknown-linux-gnu", "1.75.0", "clippy, rustfmt", "a/b@v1"];
const valueArb: fc.Arbitrary<ValueSpec> = fc.oneof(
  fc.constantFrom(...WORDS).map((text): ValueSpec => ({ kind: "word", text })),
  fc.constantFrom("it's", "a b", "", "x: y", "é日本🙂", "${{ github.token }}").map((text): ValueSpec => ({ kind: "single", text })),
  fc.constantFrom("a b", "", "héllo 日本 🙂", "#hash", "${{ steps.zz.outputs.q }}").map((text): ValueSpec => ({ kind: "double", text })),
  fc.constantFrom("42", "0", "-7").map((text): ValueSpec => ({ kind: "int", text })),
  fc.constantFrom("true", "false").map((text): ValueSpec => ({ kind: "bool", text })),
  fc
    .array(fc.constantFrom("echo one", "echo two", "cargo build"), { minLength: 1, maxLength: 3 })
    .map((lines): ValueSpec => ({ kind: "block", lines })),
);

const KEYS = ["toolchain", "target", "override", "components", "profile", "k1", "Key-2", "ünï", "a.b", "token", "uses", "default"];

export const withSpecArb: fc.Arbitrary<WithSpec> = fc
  .tuple(
    fc.boolean(),
    fc.uniqueArray(fc.constantFrom(...KEYS), { minLength: 1, maxLength: 5 }),
    fc.array(valueArb, { minLength: 5, maxLength: 5 }),
  )
  .map(([flow, keys, values]) => ({
    flow,
    entries: keys.map((key, i) => ({
      key,
      // A block scalar is not allowed inside a flow mapping; a word with a comma neither.
      value: flow && (values[i]!.kind === "block" || (values[i]!.kind === "word" && values[i]!.text.includes(",")))
        ? ({ kind: "int", text: "1" } as ValueSpec)
        : values[i]!,
    })),
  }));

const MENTION_NAMES = ["version", "path", "cache-hit", "sha_1", "Out"];

export const stepSpecArb: fc.Arbitrary<StepSpec> = fc.record({
  use: fc.option(useSpecArb, { nil: undefined, freq: 4 }),
  hasId: fc.boolean(),
  hasName: fc.boolean(),
  with: fc.option(withSpecArb, { nil: undefined, freq: 2 }),
  flow: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
  tailComment: fc.boolean(),
  commentBefore: fc.boolean(),
  blankBefore: fc.integer({ min: 0, max: 2 }),
  decoy: fc.constantFrom(undefined, undefined, "env" as const, "run-quoted" as const, "run-block" as const),
  mentions: fc.array(
    fc.record({
      target: fc.nat({ max: 6 }),
      name: fc.constantFrom(...MENTION_NAMES),
      where: fc.constantFrom("run" as const, "if" as const),
    }),
    { maxLength: 2 },
  ),
  order: fc.array(fc.nat({ max: 99 }), { minLength: 8, maxLength: 8 }),
});

const JOB_BASES = ["build", "test", "deploy", "Lint_2", "release-x", "ünï"];

export const jobSpecArb: fc.Arbitrary<JobSpec> = fc.oneof(
  {
    weight: 6,
    arbitrary: fc.record({
      base: fc.constantFrom(...JOB_BASES),
      steps: fc.array(stepSpecArb, { maxLength: 5 }),
      jobDecoy: fc.boolean(),
      blankBefore: fc.integer({ min: 0, max: 2 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      base: fc.constantFrom(...JOB_BASES),
      reusable: fc.record({ use: useSpecArb, with: fc.option(withSpecArb.map((w) => ({ ...w, flow: false, entries: w.entries.map((e) => (e.value.kind === "block" ? { ...e, value: { kind: "int", text: "1" } as ValueSpec } : e)) })), { nil: undefined }) }),
      steps: fc.constant([] as StepSpec[]),
      jobDecoy: fc.boolean(),
      blankBefore: fc.integer({ min: 0, max: 2 }),
    }),
  },
);

export const fileSpecArb: fc.Arbitrary<FileSpec> = fc.record({
  eol: fc.constantFrom("\n" as const, "\r\n" as const),
  finalEol: fc.boolean(),
  seqIndent: fc.constantFrom(4 as const, 6 as const),
  headerComment: fc.boolean(),
  jobs: fc.array(jobSpecArb, { minLength: 1, maxLength: 3 }),
});

// ---------------------------------------------------------------- rendering

interface PLine {
  text: string;
  marks: Record<string, number>;
}

const line = (text: string, marks: Record<string, number> = {}): PLine => ({ text, marks });

const shift = (l: PLine, by: number, prefix: string): PLine => ({
  text: prefix + l.text,
  marks: Object.fromEntries(Object.entries(l.marks).map(([k, v]) => [k, v + by])),
});

function quote(style: Style, text: string): string {
  if (style === "single") return `'${text.replace(/'/g, "''")}'`;
  if (style === "double") return `"${text}"`;
  return text;
}

/** A plain scalar must not start with a YAML indicator. */
const plainSafe = (text: string): boolean => text.length > 0 && !/^[@`%&*!|>'"#{}[\],?:-]/.test(text) && !/[:#]\s/.test(text);

function renderValue(v: ValueSpec, flow: boolean): { text: string; value: string; blockLines?: string[] } {
  switch (v.kind) {
    case "word":
      return { text: v.text, value: v.text };
    case "single":
      return { text: `'${v.text.replace(/'/g, "''")}'`, value: v.text };
    case "double":
      return { text: `"${v.text}"`, value: v.text };
    case "int":
    case "bool":
      return { text: v.text, value: v.text };
    case "block":
      return flow
        ? { text: "1", value: "1" }
        : { text: "|", value: v.lines.join("\n") + "\n", blockLines: v.lines };
  }
}

interface WithRender {
  lines: PLine[];
  map: Record<string, string>;
  /** Per entry (source order): index into `lines`, key mark, single-line flag. */
  keys: Array<{ name: string; lineIdx: number; mark: string; single: boolean }>;
  withLineIdx?: number;
}

function renderWith(w: WithSpec, indent: number): WithRender {
  const map: Record<string, string> = {};
  const keys: WithRender["keys"] = [];
  if (w.flow) {
    const parts: string[] = [];
    const marks: Record<string, number> = {};
    let text = "with: { ";
    w.entries.forEach((e, i) => {
      const r = renderValue(e.value, true);
      map[e.key] = r.value;
      marks[`k${i}`] = text.length;
      keys.push({ name: e.key, lineIdx: 0, mark: `k${i}`, single: false });
      text += `${e.key}: ${r.text}${i < w.entries.length - 1 ? ", " : ""}`;
      parts.push(e.key);
    });
    text += " }";
    return { lines: [line(text, marks)], map, keys };
  }
  const lines: PLine[] = [line("with:")];
  w.entries.forEach((e, i) => {
    const r = renderValue(e.value, false);
    map[e.key] = r.value;
    const pad = " ".repeat(indent);
    lines.push(line(`${pad}${e.key}: ${r.text}`, { [`k${i}`]: indent }));
    keys.push({ name: e.key, lineIdx: lines.length - 1, mark: `k${i}`, single: r.blockLines === undefined });
    for (const bl of r.blockLines ?? []) lines.push(line(`${pad}  ${bl}`));
  });
  return { lines, map, keys, withLineIdx: 0 };
}

interface UseRender {
  line: PLine;
  /** The model entry (without positions), or the skipped record. */
  action?: ActionParts;
  skip?: { specifier: string; reason: SkipReasonActions };
  /** Column of the content (or of the node start for an unsupported value). */
  col: number;
  needsAnchor: boolean;
}

function renderUse(spec: UseSpec, tail: boolean): UseRender {
  const comment = tail ? " # note" : "";
  if (spec.kind === "unsupported") {
    const raw = spec.variant === "alias" ? "*u" : spec.variant === "escaped" ? '"actions/checkout@v\\x34"' : "123";
    return {
      line: line(`uses: ${raw}${comment}`, { use: 6 }),
      skip: { specifier: raw, reason: "unsupported_value" },
      col: 6,
      needsAnchor: spec.variant === "alias",
    };
  }
  const text = spec.kind === "action" ? `${spec.parts.owner}/${spec.parts.repo}${spec.parts.path !== undefined ? `/${spec.parts.path}` : ""}@${spec.parts.ref}` : spec.text;
  const style: Style = spec.style === "plain" && !plainSafe(text) ? "double" : spec.style;
  const rendered = quote(style, text);
  const col = 6 + (style === "plain" ? 0 : 1);
  const base = { line: line(`uses: ${rendered}${comment}`, { use: col }), col, needsAnchor: false };
  return spec.kind === "action" ? { ...base, action: spec.parts } : { ...base, skip: { specifier: text.slice(0, 200), reason: spec.reason } };
}

export interface FileModel {
  text: string;
  uses: ActionUse[];
  skipped: SkippedUse[];
}

const isShaRef = (ref: string): boolean => /^[0-9a-fA-F]{40}$/.test(ref);

/** Names after every `steps.<id>.outputs.` in the given texts (independent of the implementation's regex). */
export function expectedOutputRefs(laterTexts: readonly string[], stepId: string | undefined): string[] {
  if (stepId === undefined) return [];
  const needle = `steps.${stepId}.outputs.`;
  const found = new Set<string>();
  for (const text of laterTexts) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) break;
      let end = at + needle.length;
      while (end < text.length && /[A-Za-z0-9_-]/.test(text.charAt(end))) end++;
      if (end > at + needle.length) found.add(text.slice(at + needle.length, end));
      from = at + needle.length;
    }
  }
  return [...found].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface PendingUse {
  render: UseRender;
  lineIdx: number; // global line index
  jobId: string;
  site: "step" | "job";
  stepIndex?: number;
  stepId?: string;
  withRender?: WithRender;
  withBase?: number; // global index of the first line of the with block
  laterTexts: string[];
}

/** Builds the text and the model of one file. `file` is the repository-relative path. */
export function renderFile(spec: FileSpec, file: string): FileModel {
  const out: PLine[] = [];
  const pending: PendingUse[] = [];
  const needsAnchor = JSON.stringify(spec).includes('"alias"');

  if (spec.headerComment) out.push(line("# generated workflow ünï"));
  out.push(line("name: CI"));
  out.push(line("on: [push]"));
  if (needsAnchor) {
    out.push(line("env:"));
    out.push(line("  U: &u a/b@v1"));
  }
  out.push(line("jobs:"));

  spec.jobs.forEach((job, ji) => {
    const jobId = `${job.base}${ji}`;
    for (let b = 0; b < job.blankBefore; b++) out.push(line(""));
    out.push(line(`  ${jobId}:`));
    out.push(line("    runs-on: ubuntu-latest"));
    if (job.jobDecoy) {
      out.push(line("    env:"));
      out.push(line("      uses: a/b@v1"));
    }
    if (job.reusable) {
      const r = renderUse(job.reusable.use, false);
      out.push(shift(r.line, 4, "    "));
      const useIdx = out.length - 1;
      let withRender: WithRender | undefined;
      let withBase: number | undefined;
      if (job.reusable.with) {
        withRender = renderWith(job.reusable.with, 2);
        withBase = out.length;
        for (const l of withRender.lines) out.push(shift(l, 4, "    "));
      }
      out.push(line("    secrets: inherit"));
      pending.push({ render: r, lineIdx: useIdx, jobId, site: "job", ...(withRender ? { withRender, withBase: withBase! } : {}), laterTexts: [] });
      return;
    }
    if (job.steps.length === 0) {
      out.push(line("    steps: []"));
      return;
    }
    out.push(line("    steps:"));
    const stepTexts: string[] = [];
    const stepPending: Array<{ p: PendingUse; index: number }> = [];
    job.steps.forEach((step, si) => {
      for (let b = 0; b < step.blankBefore; b++) out.push(line(""));
      if (step.commentBefore) out.push(line(" ".repeat(spec.seqIndent) + "# step comment"));
      const stepId = step.hasId ? `s${si}` : undefined;
      const entries: PLine[][] = [];
      let useRender: UseRender | undefined;
      let withRender: WithRender | undefined;
      if (step.flow && step.use && step.use.kind !== "unsupported") {
        // `- { id: s0, uses: a/b@v1 }` on one line
        const r = renderUse(step.use, false);
        const useText = r.line.text.slice("uses: ".length);
        const idPart = stepId !== undefined ? `id: ${stepId}, ` : "";
        const head = `{ ${idPart}uses: `;
        const l = line(`${head}${useText} }`, { use: head.length + (r.col - 6) });
        const prefixed = shift(l, spec.seqIndent + 2, " ".repeat(spec.seqIndent) + "- ");
        const idx = out.length;
        out.push(prefixed);
        stepTexts.push(prefixed.text);
        const p: PendingUse = { render: { ...r, line: l }, lineIdx: idx, jobId, site: "step", stepIndex: si, ...(stepId !== undefined ? { stepId } : {}), laterTexts: [] };
        pending.push(p);
        stepPending.push({ p, index: si });
        return;
      }
      if (step.hasName) entries.push([line("name: step")]);
      if (stepId !== undefined) entries.push([line(`id: ${stepId}`)]);
      if (step.use) {
        useRender = renderUse(step.use, step.tailComment);
        // the `with` block stays right after its `uses` line (one entry)
        const group: PLine[] = [useRender.line];
        if (step.with && step.use.kind !== "unsupported") {
          withRender = renderWith(step.with, 2);
          group.push(...withRender.lines);
        }
        entries.push(group);
      }
      const runRefs: string[] = [];
      const ifRefs: string[] = [];
      for (const m of step.mentions) {
        const target = m.target % job.steps.length;
        const tid = job.steps[target]!.hasId ? `s${target}` : "ghost";
        (m.where === "run" ? runRefs : ifRefs).push(`steps.${tid}.outputs.${m.name}`);
      }
      // one `run` and one `if` key per step (a duplicate key is invalid YAML)
      if (step.decoy === "run-block") {
        entries.push([line("run: |"), line("  uses: a/b@v1"), line("  echo done"), ...runRefs.map((r) => line(`  echo \${{ ${r} }}`))]);
      } else if (step.decoy === "run-quoted" || runRefs.length > 0) {
        const decoyText = step.decoy === "run-quoted" ? "uses: a/b@v1 " : "";
        entries.push([line(`run: "echo ${decoyText}${runRefs.map((r) => `\${{ ${r} }}`).join(" ")}"`)]);
      }
      if (ifRefs.length > 0) entries.push([line(`if: "${ifRefs.map((r) => `\${{ ${r} == 'x' }}`).join(" ")}"`)]);
      if (step.decoy === "env") entries.push([line("env:"), line("  uses: a/b@v1")]);
      if (entries.length === 0) entries.push([line("run: echo hi")]);
      // order: stable sort by the generated keys, so the `uses` / `with` / `id` position varies
      const idxs = entries.map((_, i) => i);
      idxs.sort((x, y) => (step.order[x % 8]! - step.order[y % 8]!) || x - y);
      const flat: PLine[] = idxs.flatMap((i) => entries[i]!);
      const usesGlobal = useRender ? flat.indexOf(useRender.line) : -1;
      const base = out.length;
      const withBaseInFlat = withRender ? flat.indexOf(withRender.lines[0]!) : -1;
      flat.forEach((l, k) => {
        const prefix = k === 0 ? " ".repeat(spec.seqIndent) + "- " : " ".repeat(spec.seqIndent + 2);
        out.push(shift(l, spec.seqIndent + 2, prefix));
      });
      stepTexts.push(flat.map((l) => " ".repeat(spec.seqIndent + 2) + l.text).join(spec.eol));
      if (useRender) {
        const p: PendingUse = {
          render: useRender,
          lineIdx: base + usesGlobal,
          jobId,
          site: "step",
          stepIndex: si,
          ...(stepId !== undefined ? { stepId } : {}),
          ...(withRender ? { withRender, withBase: base + withBaseInFlat } : {}),
          laterTexts: [],
        };
        pending.push(p);
        stepPending.push({ p, index: si });
      }
    });
    for (const { p, index } of stepPending) p.laterTexts = stepTexts.slice(index + 1);
  });

  // ---- assemble the text and compute positions
  const starts: number[] = [];
  let pos = 0;
  out.forEach((l) => {
    starts.push(pos);
    pos += l.text.length + spec.eol.length;
  });
  const lastIdx = out.length - 1;
  const eolLen = (i: number): number => (i === lastIdx && !spec.finalEol ? 0 : spec.eol.length);
  const text = out.map((l) => l.text).join(spec.eol) + (spec.finalEol ? spec.eol : "");
  const rangeOf = (i: number): LineRange => ({
    start: starts[i]!,
    end: starts[i]! + out[i]!.text.length,
    eolEnd: starts[i]! + out[i]!.text.length + eolLen(i),
  });

  const uses: ActionUse[] = [];
  const skipped: SkippedUse[] = [];
  for (const p of pending) {
    const l = out[p.lineIdx]!;
    const col0 = l.marks.use!;
    if (p.render.skip) {
      skipped.push({ file, line: p.lineIdx + 1, column: col0 + 1, specifier: p.render.skip.specifier, reason: p.render.skip.reason });
      continue;
    }
    const a = p.render.action!;
    const content = `${a.owner}/${a.repo}${a.path !== undefined ? `/${a.path}` : ""}@${a.ref}`;
    const withKeys: WithKey[] = [];
    let withLine: LineRange | undefined;
    if (p.withRender && p.withBase !== undefined) {
      for (const k of p.withRender.keys) {
        const gi = p.withBase + k.lineIdx;
        const kc = out[gi]!.marks[k.mark]!;
        const wk: WithKey = { name: k.name, offset: starts[gi]! + kc, length: k.name.length };
        if (k.single) wk.line = rangeOf(gi);
        withKeys.push(wk);
      }
      if (p.withRender.withLineIdx !== undefined) withLine = rangeOf(p.withBase + p.withRender.withLineIdx);
    }
    const use: ActionUse = {
      file,
      line: p.lineIdx + 1,
      column: col0 + 1,
      offset: starts[p.lineIdx]! + col0,
      length: content.length,
      owner: a.owner,
      repo: a.repo,
      ...(a.path !== undefined ? { path: a.path } : {}),
      ref: a.ref,
      refKind: isShaRef(a.ref) ? "sha" : "mutable",
      with: p.withRender ? p.withRender.map : {},
      withKeys,
      ...(withLine ? { withLine } : {}),
      jobId: p.jobId,
      site: p.site,
      ...(p.stepIndex !== undefined ? { stepIndex: p.stepIndex } : {}),
      ...(p.stepId !== undefined ? { stepId: p.stepId } : {}),
      outputRefs: p.site === "step" ? expectedOutputRefs(p.laterTexts, p.stepId) : [],
    };
    uses.push(use);
  }
  return { text, uses, skipped };
}

/** One workflow file text with its model (path `.github/workflows/ci.yml`). */
export const workflowArb: fc.Arbitrary<FileModel & { spec: FileSpec }> = fileSpecArb.map((spec) => ({
  ...renderFile(spec, ".github/workflows/ci.yml"),
  spec,
}));

// ---------------------------------------------------------------- trees

export interface TreeEntry {
  name: string;
  kind: "file" | "dir" | "other";
  size?: number;
}

export interface TreeModel {
  /** Repository-relative path -> text, for every file the in-memory file system can read. */
  files: Record<string, string>;
  /** Listing of `.github/workflows`, in the (generated, arbitrary) order a file system would give. */
  listing: TreeEntry[];
  uses: ActionUse[];
  skipped: SkippedUse[];
  /** Repository-relative paths of files that are invalid YAML (one warning each). */
  invalid: string[];
  /** Number of workflow files that are read (valid or invalid). */
  workflowFiles: number;
}

const WORKFLOW_NAMES = ["ci.yml", "release.yaml", "Build.yml", "a-b.yml", "z.yaml", "ünï.yml"];
const IGNORED: TreeEntry[] = [
  { name: "README.md", kind: "file" },
  { name: "CI.YML", kind: "file" },
  { name: "notes.yml.bak", kind: "file" },
  { name: "link.yml", kind: "other" },
  { name: "sub.yml", kind: "dir" },
];

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A workflows folder with several files, ignored entries, a possible invalid file and a shuffled listing. */
export const treeArb: fc.Arbitrary<TreeModel> = fc
  .tuple(
    fc.uniqueArray(fc.constantFrom(...WORKFLOW_NAMES), { minLength: 0, maxLength: 4 }),
    fc.array(fileSpecArb, { minLength: 4, maxLength: 4 }),
    fc.boolean(),
    fc.subarray(IGNORED),
    fc.infiniteStream(fc.nat()),
  )
  .map(([names, specs, withInvalid, ignored, rnd]) => {
    const files: Record<string, string> = {};
    const uses: ActionUse[] = [];
    const skipped: SkippedUse[] = [];
    const invalid: string[] = [];
    const listing: TreeEntry[] = [];
    names.forEach((name, i) => {
      const file = `.github/workflows/${name}`;
      if (withInvalid && i === 0) {
        files[file] = "jobs:\n  a: [\n    - uses: a/b@v1\n";
        invalid.push(file);
      } else {
        const m = renderFile(specs[i]!, file);
        files[file] = m.text;
        uses.push(...m.uses);
        skipped.push(...m.skipped);
      }
      listing.push({ name, kind: "file", size: files[file]!.length });
    });
    listing.push(...ignored);
    const it = rnd[Symbol.iterator]();
    const keyed = listing.map((e) => ({ e, k: it.next().value as number }));
    keyed.sort((a, b) => a.k - b.k);
    uses.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column);
    skipped.sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column);
    return {
      files,
      listing: keyed.map((x) => x.e),
      uses,
      skipped,
      invalid,
      workflowFiles: names.length,
    };
  });
