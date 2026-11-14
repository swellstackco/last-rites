import type { SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";
import { parseUses } from "../../inventory/uses.js";
import type { TextInventory } from "../../inventory/inventory.js";
import type { ActionUse, InventoryResult } from "../../inventory/types.js";
import { realInventoryImpl, type InventoryImpl } from "../properties/actions-p1.js";
import type { Sabotage } from "../sabotage-runner.js";

const real = realInventoryImpl;

/** Applies a transformation of the uses to both entry points. */
function mapUses(f: (uses: ActionUse[], text?: string) => ActionUse[]): InventoryImpl {
  return {
    inventoryText(file, text) {
      const r = real.inventoryText(file, text);
      return { ...r, uses: f(r.uses, text) };
    },
    async inventoryWorkflows(fs, root) {
      const r = await real.inventoryWorkflows(fs, root);
      return { ...r, uses: f(r.uses) };
    },
  };
}

const dropLastStepOfEveryJob = mapUses((uses) => {
  const lastOf = new Map<string, number>();
  for (const u of uses) if (u.site === "step") lastOf.set(`${u.file}#${u.jobId}`, Math.max(lastOf.get(`${u.file}#${u.jobId}`) ?? -1, u.stepIndex ?? 0));
  return uses.filter((u) => !(u.site === "step" && lastOf.get(`${u.file}#${u.jobId}`) === u.stepIndex));
});

const zeroBased = mapUses((uses) => uses.map((u) => ({ ...u, line: u.line - 1, column: u.column - 1 })));

const ignoreJobUses = mapUses((uses) => uses.filter((u) => u.site !== "job"));

const dedupe = mapUses((uses) => {
  const seen = new Set<string>();
  return uses.filter((u) => {
    const k = JSON.stringify([u.owner, u.repo, u.path, u.ref, u.with]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
});

const quotedOffsetOneTooSmall = mapUses((uses, text) =>
  uses.map((u) => {
    const before = text !== undefined ? text.charAt(u.offset - 1) : "";
    return before === '"' || before === "'" ? { ...u, offset: u.offset - 1 } : u;
  }),
);

/** (e) also reports `uses:` lines found under `with:`, `env:` and in `run:` text. */
const collectEverywhere: InventoryImpl = {
  inventoryText(file, text): TextInventory {
    const r = real.inventoryText(file, text);
    const known = new Set(r.uses.map((u) => u.offset));
    const extra: ActionUse[] = [];
    for (const m of text.matchAll(/uses:\s*([A-Za-z0-9._\/-]+@[A-Za-z0-9._\/-]+)/g)) {
      const offset = m.index! + m[0].length - m[1]!.length;
      const p = parseUses(m[1]!);
      if (p.kind !== "action" || known.has(offset)) continue;
      extra.push({
        file, line: 1, column: 1, offset, length: m[1]!.length, owner: p.owner, repo: p.repo,
        ...(p.path !== undefined ? { path: p.path } : {}), ref: p.ref, refKind: p.refKind, with: {},
        withKeys: [], jobId: "?", site: "step", outputRefs: [],
      });
    }
    return { ...r, uses: [...r.uses, ...extra] };
  },
  inventoryWorkflows: async (fs, root) => {
    const r = await real.inventoryWorkflows(fs, root);
    const dir = `${root}/.github/workflows`;
    const entries = (await fs.readDir(dir)) ?? [];
    const extra: ActionUse[] = [];
    for (const e of entries) {
      if (e.kind !== "file" || !/\.ya?ml$/.test(e.name)) continue;
      const text = await fs.readText(`${dir}/${e.name}`);
      if (text === undefined) continue;
      const file = `.github/workflows/${e.name}`;
      const t = collectEverywhere.inventoryText(file, text);
      const have = new Set(r.uses.filter((u) => u.file === file).map((u) => u.offset));
      extra.push(...t.uses.filter((u) => !have.has(u.offset)));
    }
    return { ...r, uses: [...r.uses, ...extra] };
  },
};

/** (d) sorts by line and column only. */
const sortIgnoringFile: InventoryImpl = {
  ...real,
  async inventoryWorkflows(fs, root) {
    const r = await real.inventoryWorkflows(fs, root);
    return { ...r, uses: [...r.uses].sort((a, b) => a.line - b.line || a.column - b.column) };
  },
};

/** (f) keeps the directory listing order. */
const listingOrder: InventoryImpl = {
  ...real,
  async inventoryWorkflows(fs, root): Promise<InventoryResult> {
    const dir = `${root}/.github/workflows`;
    const entries = await fs.readDir(dir);
    if (entries === undefined) return real.inventoryWorkflows(fs, root);
    const out: InventoryResult = { uses: [], skipped: [], warnings: [], filesRead: 0 };
    for (const e of entries) {
      const one: SourceFs = { readDir: async () => [e], readText: (p) => fs.readText(p) };
      const r = await real.inventoryWorkflows(one, root);
      out.uses.push(...r.uses);
      out.skipped.push(...r.skipped);
      out.warnings.push(...r.warnings);
      out.filesRead += r.filesRead;
    }
    return out;
  },
};

/** (i) one invalid file makes the whole inventory throw. */
const throwOnInvalid: InventoryImpl = {
  ...real,
  async inventoryWorkflows(fs, root) {
    const r = await real.inventoryWorkflows(fs, root);
    if (r.warnings.some((w) => w.includes("invalid YAML"))) throw new Error("invalid file");
    return r;
  },
};

export const sabotages: Sabotage<InventoryImpl>[] = [
  { name: "(a) drop the last step of every job", impl: dropLastStepOfEveryJob },
  { name: "(b) report 0-based line and column", impl: zeroBased },
  { name: "(c) ignore jobs.<id>.uses", impl: ignoreJobUses },
  { name: "(d) sort by line and column only, ignoring the file", impl: sortIgnoringFile },
  { name: "(e) collect uses from with: mappings and run: text", impl: collectEverywhere },
  { name: "(f) keep the directory listing order", impl: listingOrder },
  { name: "(g) deduplicate equal uses", impl: dedupe },
  { name: "(h) offset one too small for quoted scalars", impl: quotedOffsetOneTooSmall },
  { name: "(i) let one invalid file throw for the whole inventory", impl: throwOnInvalid },
];
