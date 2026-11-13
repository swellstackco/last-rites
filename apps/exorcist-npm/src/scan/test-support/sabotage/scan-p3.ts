import type { Sabotage } from "../../../evidence/test-support/sabotage-runner.js";
import { inventory } from "../../inventory.js";
import { REAL_PARTS } from "../../pipeline.js";
import type { PipelineParts } from "../../pipeline.js";
import type { DependencyEntry, InventoryResult, InventoryStage } from "../../types.js";

/** Names required by Requirement 14.10 for this list. */
export const SCAN_P3_REQUIRED: readonly string[] = ["prefer the declared range"];

type Json = Record<string, unknown>;

/** Rewrite the lockfile text before the real inventory sees it. */
function rewriteLock(edit: (lock: Json) => void): InventoryStage {
  return (manifest, lockText) => {
    if (lockText === undefined) return inventory(manifest);
    try {
      const lock = JSON.parse(lockText) as Json;
      edit(lock);
      return inventory(manifest, JSON.stringify(lock));
    } catch {
      return inventory(manifest, lockText);
    }
  };
}

const packagesOf = (lock: Json): Json => (lock["packages"] ?? {}) as Json;

function withInventory(stage: InventoryStage): PipelineParts {
  return { ...REAL_PARTS, inventory: stage };
}

/** Post-process a successful inventory result. */
function afterInventory(edit: (inv: InventoryResult, manifest: string, lock?: string) => void): InventoryStage {
  return (manifest, lockText) => {
    const out = inventory(manifest, lockText);
    if (!out.ok) return out;
    const copy = cloneOk(out.inventory);
    edit(copy, manifest, lockText);
    return { ok: true, inventory: copy };
  };
}
function cloneOk<T>(v: T): T {
  return structuredClone(v);
}

export const SCAN_P3_SABOTAGES: ReadonlyArray<Sabotage<PipelineParts>> = [
  {
    name: "prefer the declared range",
    impl: withInventory(
      afterInventory((inv) => {
        for (const d of inv.dependencies) {
          delete d.resolvedVersion;
          d.versionSource = "range";
        }
      }),
    ),
  },
  {
    name: "evidence gets the declared range",
    impl: {
      ...REAL_PARTS,
      scanOne: async (entry, ctx) => {
        const { resolvedVersion: _drop, ...rest } = entry;
        const r = await REAL_PARTS.scanOne(rest as DependencyEntry, ctx);
        return { ...r, dep: { ...r.dep, ...entry } };
      },
    },
  },
  {
    name: "honor link: true",
    impl: withInventory(
      rewriteLock((lock) => {
        for (const e of Object.values(packagesOf(lock))) delete (e as Json)["link"];
      }),
    ),
  },
  {
    name: "ignore a mismatched name field",
    impl: withInventory(
      rewriteLock((lock) => {
        for (const e of Object.values(packagesOf(lock))) delete (e as Json)["name"];
      }),
    ),
  },
  {
    name: "include transitive packages",
    impl: withInventory(
      afterInventory((inv, _m, lockText) => {
        if (lockText === undefined) return;
        let packages: Json;
        try {
          packages = packagesOf(JSON.parse(lockText) as Json);
        } catch {
          return;
        }
        const known = new Set([...inv.dependencies, ...inv.skipped].map((d) => d.name));
        for (const key of Object.keys(packages)) {
          if (!key.startsWith("node_modules/")) continue;
          const name = key.slice("node_modules/".length);
          if (known.has(name) || name.includes("node_modules/")) continue;
          known.add(name);
          inv.dependencies.push({ name, kinds: ["dependencies"], declaredRange: "*", versionSource: "range" });
        }
        inv.dependencies.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      }),
    ),
  },
  {
    name: "accept lockfileVersion 1 or 4",
    impl: withInventory(
      rewriteLock((lock) => {
        lock["lockfileVersion"] = 3;
      }),
    ),
  },
  {
    name: "evidence call for skipped names",
    impl: withInventory(
      afterInventory((inv) => {
        for (const s of inv.skipped) {
          inv.dependencies.push({ name: s.name, kinds: [s.kind], declaredRange: s.specifier, versionSource: "range" });
        }
        inv.dependencies.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      }),
    ),
  },
  {
    name: "mismatch warning twice",
    impl: withInventory(
      afterInventory((inv) => {
        inv.warnings = inv.warnings.flatMap((w) => (/^lockfile version \d/.test(w) ? [w, w] : [w]));
      }),
    ),
  },
];
