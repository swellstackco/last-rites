import fc from "fast-check";
import type { NamedProperty } from "../../../evidence/test-support/sabotage-runner.js";
import { KIND_PRECEDENCE } from "../../types.js";
import type { InventoryStage } from "../../types.js";
import { manifestArb } from "../arbitraries/manifest.js";

/** The seam under test for Property 2. */
export type InventoryFn = InventoryStage;

const codeUnitSorted = (xs: readonly string[]) => [...xs].sort();

/** Property 2: inventory completeness and partition. */
export const property2: NamedProperty<InventoryFn> = {
  name: "Property 2: Inventory completeness and partition",
  build: (impl) =>
    fc.property(manifestArb, (m) => {
      const out = impl(m.text);
      if (!out.ok) throw new Error(`inventory failed: ${out.error.code} ${out.error.message}`);
      const inv = out.inventory;
      const again = impl(m.text);
      if (JSON.stringify(again) !== JSON.stringify(out)) throw new Error("not deterministic");

      const depNames = inv.dependencies.map((d) => d.name);
      const skipNames = inv.skipped.map((s) => s.name);
      const all = [...depNames, ...skipNames];
      if (new Set(all).size !== all.length) throw new Error("a name appears twice across dependencies and skipped");
      if (all.length !== m.declared.size) throw new Error(`${all.length} entries for ${m.declared.size} distinct names`);
      for (const n of m.declared.keys()) if (!all.includes(n)) throw new Error(`name ${n} lost`);

      if (JSON.stringify(depNames) !== JSON.stringify(codeUnitSorted(depNames))) throw new Error("dependencies not sorted");
      if (JSON.stringify(skipNames) !== JSON.stringify(codeUnitSorted(skipNames))) throw new Error("skipped not sorted");

      for (const [name, perKind] of m.declared) {
        const kinds = KIND_PRECEDENCE.filter((k) => perKind.has(k));
        const first = perKind.get(kinds[0]!)!;
        const dep = inv.dependencies.find((d) => d.name === name);
        const skip = inv.skipped.find((s) => s.name === name);
        if (first.cls === "registry") {
          if (!dep || skip) throw new Error(`registry name ${name} misplaced`);
          if (JSON.stringify(dep.kinds) !== JSON.stringify(kinds)) throw new Error(`kinds of ${name}: ${dep.kinds.join()}`);
          if (dep.declaredRange !== first.range) throw new Error(`range of ${name}: ${dep.declaredRange}`);
        } else {
          if (!skip || dep) throw new Error(`unscannable name ${name} misplaced`);
          if (skip.kind !== kinds[0]) throw new Error(`skipped kind of ${name}: ${skip.kind}`);
          if (skip.specifier !== first.range) throw new Error(`specifier of ${name}: ${skip.specifier}`);
          if (skip.reason !== first.cls) throw new Error(`reason of ${name}: ${skip.reason}, expected ${first.cls}`);
        }
        // Conflict warnings.
        const differing = kinds.slice(1).filter((k) => perKind.get(k)!.range !== first.range);
        const conflicts = inv.warnings.filter((w) => w.startsWith(`package "${name}" is declared with different ranges`));
        if (differing.length === 0) {
          if (conflicts.length !== 0) throw new Error(`unexpected conflict warning for ${name}`);
        } else {
          if (conflicts.length !== 1) throw new Error(`${conflicts.length} conflict warnings for ${name}`);
          const w = conflicts[0]!;
          if (!w.includes(`using ${kinds[0]} "${first.range}"`)) throw new Error(`warning lacks used kind: ${w}`);
          for (const k of differing) {
            if (!w.includes(`${k} "${perKind.get(k)!.range}"`)) throw new Error(`warning lacks ignored kind ${k}: ${w}`);
          }
        }
      }

      const workspaceWarnings = inv.warnings.filter((w) => w.includes("workspaces"));
      if (workspaceWarnings.length !== (m.hasWorkspaces ? 1 : 0)) {
        throw new Error(`${workspaceWarnings.length} workspaces warnings, hasWorkspaces=${m.hasWorkspaces}`);
      }
    }),
};
