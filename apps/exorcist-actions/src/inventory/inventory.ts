import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node, Scalar, YAMLMap } from "yaml";
import type { SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";
import type { ActionUse, InventoryResult, LineRange, SkippedUse, WithKey } from "./types.js";
import { parseUses } from "./uses.js";
import { outputRefsFor } from "./output-refs.js";

const MAX_BYTES = 1024 * 1024;
const SPECIFIER_MAX = 200;
const WORKFLOWS_DIR = ".github/workflows";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export interface TextInventory {
  uses: ActionUse[];
  skipped: SkippedUse[];
  warnings: string[];
}

/** Start, end (without the line ending) and eolEnd (with it) of the line that holds `offset`. */
function lineBounds(text: string, offset: number): LineRange {
  const start = text.lastIndexOf("\n", offset - 1) + 1;
  let end = text.indexOf("\n", offset);
  if (end < 0) return { start, end: text.length, eolEnd: text.length };
  const eolEnd = end + 1;
  if (end > start && text.charAt(end - 1) === "\r") end -= 1;
  return { start, end, eolEnd };
}

/** After the node, only whitespace or a comment may follow on its line. */
function tailIsClean(text: string, nodeEnd: number): boolean {
  const lb = lineBounds(text, nodeEnd);
  const rest = text.slice(nodeEnd, lb.end);
  return /^[ \t]*(#.*)?$/.test(rest);
}

const asString = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function plainValueOf(node: unknown, doc: import("yaml").Document): string {
  if (isScalar(node)) return typeof node.value === "string" ? node.value : asString(node.value);
  const n = node as { toJS?: (d: unknown) => unknown } | null;
  try {
    return JSON.stringify(n && typeof n.toJS === "function" ? n.toJS(doc) : null);
  } catch {
    return "";
  }
}

function keyName(k: unknown): string | undefined {
  return isScalar(k) && typeof k.value === "string" ? k.value : undefined;
}

function getPair(map: YAMLMap, key: string): { key: Node; value: Node | null } | undefined {
  for (const item of map.items) {
    if (keyName(item.key) === key) return { key: item.key as Node, value: (item.value as Node | null) ?? null };
  }
  return undefined;
}

/** Pure and total. `file` is the repository-relative path. */
export function inventoryText(file: string, text: string): TextInventory {
  try {
    return inventoryUnchecked(file, text);
  } catch {
    return { uses: [], skipped: [], warnings: [`${file}: invalid YAML (UNEXPECTED)`] };
  }
}

function inventoryUnchecked(file: string, text: string): TextInventory {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const first = doc.errors[0];
  if (first) return { uses: [], skipped: [], warnings: [`${file}: invalid YAML (${first.code})`] };

  const uses: ActionUse[] = [];
  const skipped: SkippedUse[] = [];
  const pos = (offset: number): { line: number; column: number } => {
    const p = lineCounter.linePos(offset);
    return { line: p.line, column: p.col };
  };
  const cut = (s: string): string => s.slice(0, SPECIFIER_MAX);

  /** The `with` data of a use's mapping. */
  function readWith(owner: YAMLMap): { map: Record<string, string>; keys: WithKey[]; withLine?: LineRange } {
    const map: Record<string, string> = {};
    const keys: WithKey[] = [];
    const pair = getPair(owner, "with");
    if (!pair || !isMap(pair.value)) return { map, keys };
    const withMap = pair.value;
    let withLine: LineRange | undefined;
    if (!withMap.flow && pair.key.range && withMap.range) {
      const kl = lineBounds(text, pair.key.range[0]);
      if (withMap.range[0] > kl.end && /^[ \t]*:[ \t]*(#.*)?$/.test(text.slice(pair.key.range[1], kl.end))) withLine = kl;
    }
    for (const item of withMap.items) {
      const k = item.key;
      if (!isScalar(k) || !k.range) continue;
      const name = asString(k.value);
      map[name] = plainValueOf(item.value, doc);
      const quoted = k.type === "QUOTE_SINGLE" || k.type === "QUOTE_DOUBLE";
      const at = k.range[0] + (quoted ? 1 : 0);
      const wk: WithKey = text.slice(at, at + name.length) === name
        ? { name, offset: at, length: name.length }
        : { name, offset: k.range[0], length: k.range[1] - k.range[0] };
      const v = item.value;
      if (!withMap.flow && (isScalar(v) || isAlias(v) || v === null) ) {
        const kl = lineBounds(text, k.range[0]);
        const onlyIndent = text.slice(kl.start, k.range[0]).trim() === "";
        const vEnd = v === null ? k.range[1] : (v.range?.[1] ?? k.range[1]);
        const block = isScalar(v) && (v.type === "BLOCK_LITERAL" || v.type === "BLOCK_FOLDED");
        const sameLine = vEnd <= kl.end && !text.slice(k.range[0], vEnd).includes("\n");
        if (onlyIndent && !block && sameLine && tailIsClean(text, Math.max(vEnd, k.range[1]))) wk.line = kl;
      }
      keys.push(wk);
    }
    return withLine ? { map, keys, withLine } : { map, keys };
  }

  /** Handles one `uses` value; `owner` is the mapping that holds it. */
  function handleUse(
    owner: YAMLMap,
    ctx: { jobId: string; site: "step" | "job"; stepIndex?: number; stepId?: string; later?: string },
  ): void {
    const pair = getPair(owner, "uses");
    if (!pair) return;
    const node = pair.value;
    if (!node || !node.range) return;
    const unsupported = (): void => {
      const p = pos(node.range![0]);
      skipped.push({
        file,
        line: p.line,
        column: p.column,
        specifier: cut(text.slice(node.range![0], node.range![1])),
        reason: "unsupported_value",
      });
    };
    if (isAlias(node) || !isScalar(node)) return unsupported();
    const sc = node as Scalar;
    if (typeof sc.value !== "string") return unsupported();
    const quoted = sc.type === "QUOTE_SINGLE" || sc.type === "QUOTE_DOUBLE";
    if (!quoted && sc.type !== "PLAIN") return unsupported();
    const value = sc.value;
    const offset = sc.range![0] + (quoted ? 1 : 0);
    if (text.slice(offset, offset + value.length) !== value) return unsupported();
    const end = offset + value.length;
    if (quoted ? text.charAt(end) !== (sc.type === "QUOTE_SINGLE" ? "'" : '"') : sc.range![1] !== end) return unsupported();
    const p = pos(offset);
    const parsed = parseUses(value);
    if (parsed.kind === "skip") {
      skipped.push({ file, line: p.line, column: p.column, specifier: cut(value), reason: parsed.reason });
      return;
    }
    const w = readWith(owner);
    uses.push({
      file,
      line: p.line,
      column: p.column,
      offset,
      length: value.length,
      owner: parsed.owner,
      repo: parsed.repo,
      ...(parsed.path !== undefined ? { path: parsed.path } : {}),
      ref: parsed.ref,
      refKind: parsed.refKind,
      with: w.map,
      withKeys: w.keys,
      ...(w.withLine ? { withLine: w.withLine } : {}),
      jobId: ctx.jobId,
      site: ctx.site,
      ...(ctx.stepIndex !== undefined ? { stepIndex: ctx.stepIndex } : {}),
      ...(ctx.stepId !== undefined ? { stepId: ctx.stepId } : {}),
      outputRefs: ctx.site === "step" ? outputRefsFor(ctx.stepId, ctx.later ?? "") : [],
    });
  }

  const root = doc.contents;
  if (isMap(root)) {
    const jobs = getPair(root, "jobs")?.value;
    if (isMap(jobs)) {
      for (const jobItem of jobs.items) {
        const jobId = keyName(jobItem.key);
        const job = jobItem.value;
        if (jobId === undefined || !isMap(job)) continue;
        handleUse(job, { jobId, site: "job" });
        const steps = getPair(job, "steps")?.value;
        if (!isSeq(steps)) continue;
        const jobEnd = job.range ? job.range[1] : text.length;
        steps.items.forEach((step, stepIndex) => {
          if (!isMap(step) || !step.range) return;
          const idNode = getPair(step, "id")?.value;
          const stepId = isScalar(idNode) && typeof idNode.value === "string" ? idNode.value : undefined;
          const later = text.slice(step.range[1], Math.max(step.range[1], jobEnd));
          handleUse(step, { jobId, site: "step", stepIndex, ...(stepId !== undefined ? { stepId } : {}), later });
        });
      }
    }
  }

  const byPos = (a: { line: number; column: number }, b: { line: number; column: number }): number =>
    a.line - b.line || a.column - b.column;
  uses.sort(byPos);
  skipped.sort(byPos);
  return { uses, skipped, warnings: [] };
}

/** Lists `<root>/.github/workflows` through the seam and inventories every `.yml` / `.yaml` file. */
export async function inventoryWorkflows(fs: SourceFs, root: string): Promise<InventoryResult> {
  const base = root.endsWith("/") && root.length > 1 ? root.slice(0, -1) : root;
  const dir = `${base}/${WORKFLOWS_DIR}`;
  const entries = await fs.readDir(dir);
  if (entries === undefined) return { uses: [], skipped: [], warnings: ["no .github/workflows directory"], filesRead: 0 };

  const names = entries
    .filter((e) => e.kind === "file" && (e.name.endsWith(".yml") || e.name.endsWith(".yaml")))
    .map((e) => ({ name: e.name, size: e.size }))
    .sort((a, b) => cmp(a.name, b.name));

  const uses: ActionUse[] = [];
  const skipped: SkippedUse[] = [];
  const warnings: string[] = [];
  let filesRead = 0;
  for (const { name, size } of names) {
    const file = `${WORKFLOWS_DIR}/${name}`;
    if (size !== undefined && size > MAX_BYTES) {
      warnings.push(`${file}: file too large`);
      continue;
    }
    let text: string | undefined;
    try {
      text = await fs.readText(`${dir}/${name}`);
    } catch {
      text = undefined;
    }
    if (text === undefined) {
      warnings.push(`${file}: unreadable`);
      continue;
    }
    if (text.length > MAX_BYTES || new TextEncoder().encode(text).length > MAX_BYTES) {
      warnings.push(`${file}: file too large`);
      continue;
    }
    filesRead += 1;
    const r = inventoryText(file, text);
    uses.push(...r.uses);
    skipped.push(...r.skipped);
    warnings.push(...r.warnings);
  }
  const order = (a: { file: string; line: number; column: number }, b: { file: string; line: number; column: number }): number =>
    cmp(a.file, b.file) || a.line - b.line || a.column - b.column;
  uses.sort(order);
  skipped.sort(order);
  return { uses, skipped, warnings, filesRead };
}
