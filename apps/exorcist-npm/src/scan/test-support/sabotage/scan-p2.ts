import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { inventory } from "../../inventory.js";
import { KIND_PRECEDENCE } from "../../types.js";
import type { DependencyKind, InventoryResult, InventoryStage } from "../../types.js";

/** Names with their kinds in the manifest's own (insertion) order, and ranges per kind. */
function readManifest(text: string): Map<string, Array<{ kind: DependencyKind; range: string }>> {
  const m = JSON.parse(text) as Record<string, Record<string, string> | undefined>;
  const out = new Map<string, Array<{ kind: DependencyKind; range: string }>>();
  for (const key of Object.keys(m)) {
    const kind = key as DependencyKind;
    if (!KIND_PRECEDENCE.includes(kind)) continue;
    const field = m[key];
    if (!field) continue;
    for (const name of Object.keys(field)) {
      const list = out.get(name) ?? [];
      list.push({ kind, range: field[name]! });
      out.set(name, list);
    }
  }
  return out;
}

/** Wrap the real stage; `edit` post-processes a successful result. */
function wrap(edit: (inv: InventoryResult, text: string) => InventoryResult): InventoryStage {
  return (text, lock) => {
    const out = inventory(text, lock);
    return out.ok ? { ok: true, inventory: edit(structuredClone(out.inventory), text) } : out;
  };
}

const bySlashless = (a: string, b: string) => a.localeCompare(b);

export const SCAN_P2_SABOTAGES: ReadonlyArray<Sabotage<InventoryStage>> = [
  {
    name: "drop a name that appears in two kinds",
    impl: wrap((inv, text) => {
      const multi = new Set([...readManifest(text)].filter(([, l]) => l.length > 1).map(([n]) => n));
      return {
        ...inv,
        dependencies: inv.dependencies.filter((d) => !multi.has(d.name)),
        skipped: inv.skipped.filter((s) => !multi.has(s.name)),
      };
    }),
  },
  {
    name: "range from the last kind",
    impl: wrap((inv, text) => {
      const m = readManifest(text);
      const last = (name: string) => {
        const l = m.get(name)!;
        return [...l].sort((a, b) => KIND_PRECEDENCE.indexOf(a.kind) - KIND_PRECEDENCE.indexOf(b.kind)).at(-1)!.range;
      };
      for (const d of inv.dependencies) d.declaredRange = last(d.name);
      for (const s of inv.skipped) s.specifier = last(s.name);
      return inv;
    }),
  },
  {
    name: "kinds in insertion order",
    impl: wrap((inv, text) => {
      const m = readManifest(text);
      for (const d of inv.dependencies) d.kinds = m.get(d.name)!.map((e) => e.kind);
      return inv;
    }),
  },
  {
    name: "lose prototype-property names",
    impl: wrap((inv) => ({
      ...inv,
      dependencies: inv.dependencies.filter((d) => d.name !== "__proto__" && d.name !== "constructor"),
      skipped: inv.skipped.filter((s) => s.name !== "__proto__" && s.name !== "constructor"),
    })),
  },
  {
    name: "skipped name also in dependencies",
    impl: wrap((inv) => ({
      ...inv,
      dependencies: [
        ...inv.dependencies,
        ...inv.skipped.map((s) => ({
          name: s.name,
          kinds: [s.kind],
          declaredRange: s.specifier,
          versionSource: "range" as const,
        })),
      ],
    })),
  },
  {
    name: "localeCompare sort",
    impl: wrap((inv) => ({
      ...inv,
      dependencies: [...inv.dependencies].sort((a, b) => bySlashless(a.name, b.name)),
      skipped: [...inv.skipped].sort((a, b) => bySlashless(a.name, b.name)),
    })),
  },
  {
    name: "no conflict warning",
    impl: wrap((inv) => ({ ...inv, warnings: inv.warnings.filter((w) => !w.startsWith("package ")) })),
  },
  {
    name: "conflict warning on identical ranges",
    impl: wrap((inv, text) => {
      const extra: string[] = [];
      for (const [name, list] of readManifest(text)) {
        if (list.length > 1 && list.every((e) => e.range === list[0]!.range)) {
          extra.push(`package "${name}" is declared with different ranges; using ${list[0]!.kind} "${list[0]!.range}"`);
        }
      }
      return { ...inv, warnings: [...inv.warnings, ...extra] };
    }),
  },
];
