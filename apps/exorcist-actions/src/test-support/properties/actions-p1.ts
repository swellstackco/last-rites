import { deepStrictEqual } from "node:assert";
import fc from "fast-check";
import type { SourceFs } from "@graveyard-kit/exorcist-npm/programmatic";
import { inventoryText, inventoryWorkflows } from "../../inventory/inventory.js";
import type { TextInventory } from "../../inventory/inventory.js";
import type { InventoryResult } from "../../inventory/types.js";
import { formatUses } from "../../inventory/uses.js";
import { treeArb, workflowArb } from "../arbitraries/workflow.js";
import { memorySourceFs } from "../memory-source-fs.js";
import type { NamedProperty } from "../sabotage-runner.js";

/** The seam under test (Property 1). */
export interface InventoryImpl {
  inventoryText(file: string, text: string): TextInventory;
  inventoryWorkflows(fs: SourceFs, root: string): Promise<InventoryResult>;
}

export const realInventoryImpl: InventoryImpl = { inventoryText, inventoryWorkflows };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const inventoryProperties: NamedProperty<InventoryImpl>[] = [
  {
    name: "P1 text: every generated use appears once with every field, sorted, deterministic",
    build: (impl) =>
      fc.property(workflowArb, (m) => {
        const file = ".github/workflows/ci.yml";
        const got = impl.inventoryText(file, m.text);
        deepStrictEqual(got.warnings, []);
        deepStrictEqual(got.uses, m.uses);
        deepStrictEqual(got.skipped, m.skipped);
        for (const u of got.uses) {
          if (m.text.slice(u.offset, u.offset + u.length) !== formatUses(u)) {
            throw new Error(`offset does not point at the Uses_String: ${JSON.stringify(u)}`);
          }
        }
        const sorted = [...got.uses].sort((a, b) => a.line - b.line || a.column - b.column);
        deepStrictEqual(got.uses, sorted);
        deepStrictEqual(impl.inventoryText(file, m.text), got);
      }),
  },
  {
    name: "P1 tree: any listing order, ignored entries and invalid files",
    build: (impl) =>
      fc.asyncProperty(treeArb, async (t) => {
        const fs = memorySourceFs(t.files, t.listing);
        const got = await impl.inventoryWorkflows(fs, "/repo");
        deepStrictEqual(got.uses, t.uses);
        deepStrictEqual(got.skipped, t.skipped);
        deepStrictEqual(got.filesRead, t.workflowFiles);
        const sortedUses = [...got.uses].sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column);
        deepStrictEqual(got.uses, sortedUses);
        // one warning per invalid file, none else
        deepStrictEqual(got.warnings.length, t.invalid.length);
        for (const f of t.invalid) {
          if (!got.warnings.some((w) => new RegExp(`^${f.replace(/[.]/g, "\\.")}: invalid YAML \\([A-Z_]+\\)$`).test(w))) {
            throw new Error(`no invalid-YAML warning for ${f}: ${JSON.stringify(got.warnings)}`);
          }
        }
        // the reversed listing gives the same result
        const rev = await impl.inventoryWorkflows(memorySourceFs(t.files, [...t.listing].reverse()), "/repo");
        deepStrictEqual(rev, got);
      }),
  },
];
