// runScan (Requirements 8.1 to 8.7): one Clock reading, the inventory, one Evidence_Stage call per
// Action_Name, scoring and the pure buildScanReport. Never rejects.
import type { Clock, ScanReport, SourceFs } from "@last-rites/exorcist-npm/programmatic";
import type { ActionEvidenceStage } from "../evidence/stage.js";
import { allUnknownEvidence } from "../evidence/stage.js";
import type { EvidenceResult } from "../evidence/assemble.js";
import { inventoryWorkflows } from "../inventory/inventory.js";
import type { InventoryResult } from "../inventory/types.js";
import { buildScanReport, groupByAction } from "./report.js";

export interface ScanDeps {
  fs: SourceFs;
  evidence: ActionEvidenceStage;
  clock: Clock;
}

export interface ScanInput {
  root: string;
  label: string;
  ref: string;
}

export async function runScan(input: ScanInput, deps: ScanDeps): Promise<ScanReport> {
  let scannedAt: string;
  try {
    scannedAt = deps.clock().toISOString();
  } catch {
    scannedAt = new Date(0).toISOString();
  }
  const now = new Date(scannedAt);

  let inventory: InventoryResult;
  try {
    inventory = await inventoryWorkflows(deps.fs, input.root);
  } catch {
    inventory = { uses: [], skipped: [], warnings: ["inventory failed"], filesRead: 0 };
  }

  const groups = groupByAction(inventory.uses);
  const results = await Promise.all(
    groups.map(async (group): Promise<[string, EvidenceResult]> => {
      const first = group.uses[0]!;
      try {
        const result = await deps.evidence({
          name: group.name,
          ref: first.ref,
          ...(first.path !== undefined ? { path: first.path } : {}),
          site: first.site,
          now,
        });
        return [group.name, result];
      } catch {
        return [group.name, allUnknownEvidence(group.name)];
      }
    }),
  );

  return buildScanReport({
    label: input.label,
    ref: input.ref,
    scannedAt,
    inventory,
    evidence: new Map(results),
  });
}
