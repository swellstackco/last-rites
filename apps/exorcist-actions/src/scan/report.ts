// buildScanReport (Requirements 8.1 to 8.7): a pure mapping from an inventory and the evidence of each
// Action_Name to the ordinary Scan_Report of the npm app, with `ecosystem: "github-actions"`.
import { scoreDeath } from "@last-rites/skeleton";
import { assembleReport } from "@last-rites/exorcist-npm/programmatic";
import type { ScanReport, ScannedDependency } from "@last-rites/exorcist-npm/programmatic";
import type { EvidenceResult } from "../evidence/assemble.js";
import { allUnknownEvidence } from "../evidence/stage.js";
import type { ActionUse, InventoryResult } from "../inventory/types.js";

type SkippedEntry = ScanReport["skipped"][number];

export interface BuildScanReportArgs {
  label: string;
  ref: string;
  /** ISO 8601, from the one Clock reading. */
  scannedAt: string;
  inventory: InventoryResult;
  /** Keyed by Action_Name as spelled by the first use of that name in inventory order. */
  evidence: ReadonlyMap<string, EvidenceResult>;
}

/** The Action_Name `owner/repo` of a use. */
export const actionNameOf = (use: Pick<ActionUse, "owner" | "repo">): string => `${use.owner}/${use.repo}`;

export interface ActionGroup {
  /** The casing of the first use. */
  name: string;
  /** In inventory order. */
  uses: ActionUse[];
}

/** Groups uses by Action_Name, case-insensitively, keeping the first use's casing and the inventory order. */
export function groupByAction(uses: readonly ActionUse[]): ActionGroup[] {
  const groups = new Map<string, ActionGroup>();
  for (const use of uses) {
    const name = actionNameOf(use);
    const key = name.toLowerCase();
    const group = groups.get(key);
    if (group) group.uses.push(use);
    else groups.set(key, { name, uses: [use] });
  }
  return [...groups.values()];
}

/** Sorted unique refs joined with `, ` (UTF-16 code-unit order). */
export const declaredRangeOf = (uses: readonly ActionUse[]): string =>
  [...new Set(uses.map((u) => u.ref))].sort().join(", ");

function scored(name: string, evidence: EvidenceResult): { evidence: EvidenceResult; death: ScannedDependency["death"] } {
  try {
    return { evidence, death: scoreDeath(evidence.signals) };
  } catch {
    const fallback = allUnknownEvidence(name);
    return { evidence: fallback, death: scoreDeath(fallback.signals) };
  }
}

export function buildScanReport(args: BuildScanReportArgs): ScanReport {
  const { inventory } = args;
  const scanned: ScannedDependency[] = [];
  for (const group of groupByAction(inventory.uses)) {
    // The map is keyed by the first use's casing; a differently-cased key is accepted too.
    let found = args.evidence.get(group.name);
    if (found === undefined) {
      for (const [key, value] of args.evidence) {
        if (key.toLowerCase() === group.name.toLowerCase()) {
          found = value;
          break;
        }
      }
    }
    const { evidence, death } = scored(group.name, found ?? allUnknownEvidence(group.name));
    scanned.push({
      name: group.name,
      kinds: ["dependencies"],
      declaredRange: declaredRangeOf(group.uses),
      versionSource: "range",
      signals: evidence.signals,
      unknownReasons: evidence.unknownReasons,
      ...(evidence.replacement ? { replacement: evidence.replacement } : {}),
      evidenceWarnings: evidence.warnings,
      death,
    });
  }

  const skipped: SkippedEntry[] = inventory.skipped.map((s) => ({
    name: s.specifier,
    kind: "dependencies",
    specifier: s.specifier,
    reason: "other",
  }));
  const warnings = [
    ...inventory.warnings,
    ...inventory.skipped.map((s) => `${s.file}:${s.line}: skipped ${s.reason}: ${s.specifier}`),
  ];

  const report = assembleReport({
    target: { owner: "", repo: "", ref: args.ref },
    scannedAt: args.scannedAt,
    scanned,
    skipped,
    warnings,
  });
  // `repo` is the label as given (Requirement 8.6), not a split and re-joined pair.
  return { ...report, repo: args.label, ecosystem: "github-actions" };
}
