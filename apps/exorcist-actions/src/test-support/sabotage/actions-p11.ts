import { parseReport, serializeReport } from "@graveyard-kit/exorcist-npm/programmatic";
import type { ScanReport } from "@graveyard-kit/exorcist-npm/programmatic";
import { buildScanReport } from "../../scan/report.js";
import { runScan } from "../../scan/scan.js";
import { realScanImpl, type ScanImpl } from "../properties/actions-p11.js";
import type { Sabotage } from "../sabotage-runner.js";

const real = realScanImpl;

type Doc = Record<string, unknown>;
const render = (doc: Doc): string => JSON.stringify(doc, null, 2) + "\n";

/** (a) write `ecosystem` for npm reports too. */
function serializeNpmWithEcosystem(report: ScanReport): string {
  const doc = JSON.parse(serializeReport(report)) as Doc;
  if (doc["ecosystem"] !== undefined) return render(doc);
  const out: Doc = {};
  for (const [k, v] of Object.entries(doc)) {
    out[k] = v;
    if (k === "ref") out["ecosystem"] = "npm";
  }
  return render(out);
}

/** (b) accept `"ecosystem": "npm"` in the parser. */
function parseAcceptingNpm(text: string): ReturnType<typeof parseReport> {
  const stripped = text.replace(/^ *"ecosystem": "npm",\n/m, "");
  if (stripped === text) return parseReport(text);
  const r = parseReport(stripped);
  return r.ok ? { ok: true, report: { ...r.report, ecosystem: "npm" } } : r;
}

/** (c) one dependency per Uses_String instead of per Action_Name. */
const perUse: typeof buildScanReport = (args) => {
  const r = buildScanReport(args);
  const counts = new Map<string, number>();
  for (const u of args.inventory.uses) {
    const key = `${u.owner}/${u.repo}`.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dependencies = r.dependencies.flatMap((d) => Array.from({ length: counts.get(d.name.toLowerCase()) ?? 1 }, () => d));
  return { ...r, dependencies, summary: { ...r.summary, total: dependencies.length } };
};

/** (d) leave `declaredRange` in inventory order, unsorted and with duplicates. */
const unsortedRange: typeof buildScanReport = (args) => {
  const r = buildScanReport(args);
  return {
    ...r,
    dependencies: r.dependencies.map((d) => ({
      ...d,
      declaredRange: args.inventory.uses
        .filter((u) => `${u.owner}/${u.repo}`.toLowerCase() === d.name.toLowerCase())
        .map((u) => u.ref)
        .join(", "),
    })),
  };
};

/** (e) drop the skipped uses. */
const dropSkipped: typeof buildScanReport = (args) => buildScanReport({ ...args, inventory: { ...args.inventory, skipped: [] } });

/** (f) kinds `["devDependencies"]`. */
const devKinds: typeof buildScanReport = (args) => {
  const r = buildScanReport(args);
  return { ...r, dependencies: r.dependencies.map((d) => ({ ...d, kinds: ["devDependencies"] })) };
};

/** (g) read the clock a second time. */
const secondRead: typeof runScan = (input, deps) => {
  deps.clock();
  return runScan(input, deps);
};

/** (h) put `ecosystem` after `warnings` (the canonical form changes). */
function ecosystemAfterWarnings(report: ScanReport): string {
  const doc = JSON.parse(serializeReport(report)) as Doc;
  const eco = doc["ecosystem"];
  if (eco === undefined) return serializeReport(report);
  const out: Doc = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "ecosystem") continue;
    out[k] = v;
    if (k === "warnings") out["ecosystem"] = eco;
  }
  return render(out);
}

export const sabotages: Sabotage<ScanImpl>[] = [
  { name: "(a) write ecosystem for npm reports", impl: { ...real, serialize: serializeNpmWithEcosystem } },
  { name: '(b) accept "ecosystem":"npm" in the parser', impl: { ...real, parse: parseAcceptingNpm } },
  { name: "(c) one dependency per Uses_String", impl: { ...real, build: perUse } },
  { name: "(d) leave declaredRange unsorted", impl: { ...real, build: unsortedRange } },
  { name: "(e) drop the skipped uses", impl: { ...real, build: dropSkipped } },
  { name: "(f) kinds devDependencies", impl: { ...real, build: devKinds } },
  { name: "(g) read the clock a second time", impl: { ...real, runScan: secondRead } },
  { name: "(h) ecosystem after warnings", impl: { ...real, serialize: ecosystemAfterWarnings } },
];
