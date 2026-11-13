import fc from "fast-check";
import semver from "semver";
import type { NamedAsyncProperty } from "../../../evidence/test-support/sabotage-runner.js";
import type { PipelineParts } from "../../pipeline.js";
import { KIND_PRECEDENCE } from "../../types.js";
import { lockfileArb, lockfileAccepted } from "../arbitraries/lockfile.js";
import { runScan } from "../run-scan.js";

const MISMATCH = /^lockfile version \d/;
const isLockfileLevel = (w: string): boolean => (w.startsWith("lockfile ") && !MISMATCH.test(w)) || w.startsWith("no lockfile");

/** Property 3: lockfile precedence and what the evidence stage receives. */
export const property3: NamedAsyncProperty<PipelineParts> = {
  name: "Property 3: Lockfile precedence and what the evidence stage receives",
  build: (parts) =>
    fc.asyncProperty(lockfileArb, async (lock) => {
      const { outcome, gate } = await runScan(parts, lock.manifest.text, lock.text);
      if (!outcome.ok) throw new Error(`scan failed: ${outcome.error.code} ${outcome.error.message}`);
      const report = outcome.report;
      const accepted = lockfileAccepted(lock);

      // Expected registry names and their declared ranges (first kind in Kind_Precedence).
      const registry = new Map<string, string>();
      const skippedNames: string[] = [];
      for (const [name, perKind] of lock.manifest.declared) {
        const first = perKind.get(KIND_PRECEDENCE.find((k) => perKind.has(k))!)!;
        if (first.cls === "registry") registry.set(name, first.range);
        else skippedNames.push(name);
      }

      // The report holds exactly the manifest's distinct names, no transitive packages.
      const reported = [...report.dependencies.map((d) => d.name), ...report.skipped.map((s) => s.name)].sort();
      const expectedNames = [...lock.manifest.declared.keys()].sort();
      if (JSON.stringify(reported) !== JSON.stringify(expectedNames)) {
        throw new Error(`reported names ${JSON.stringify(reported)} differ from manifest names ${JSON.stringify(expectedNames)}`);
      }
      if (report.dependencies.length !== registry.size) throw new Error("dependency count differs from registry names");

      const mismatches: string[] = [];
      for (const dep of report.dependencies) {
        const range = registry.get(dep.name);
        if (range === undefined) throw new Error(`${dep.name} is not a registry dependency`);
        const version = accepted ? lock.usable.get(dep.name) : undefined;
        if (version !== undefined) {
          if (dep.resolvedVersion !== version || dep.versionSource !== "lockfile") {
            throw new Error(`${dep.name}: resolvedVersion ${dep.resolvedVersion}, expected ${version}`);
          }
          if (semver.validRange(range) !== null && !semver.satisfies(version, range, { includePrerelease: true })) {
            mismatches.push(`lockfile version ${version} of "${dep.name}" does not satisfy declared range "${range}"`);
          }
        } else if (dep.versionSource !== "range" || "resolvedVersion" in dep) {
          throw new Error(`${dep.name}: expected a range-sourced entry without resolvedVersion`);
        }
      }

      // Lockfile-level warning: exactly one when the lockfile is not accepted, none otherwise.
      const lockWarnings = report.warnings.filter(isLockfileLevel);
      if (lockWarnings.length !== (accepted ? 0 : 1)) {
        throw new Error(`${lockWarnings.length} lockfile-level warnings, accepted=${accepted}`);
      }

      // Version mismatch warnings: exactly one per mismatch, none otherwise.
      const gotMismatch = report.warnings.filter((w) => MISMATCH.test(w));
      if (JSON.stringify([...gotMismatch].sort()) !== JSON.stringify([...mismatches].sort())) {
        throw new Error(`mismatch warnings ${JSON.stringify(gotMismatch)}, expected ${JSON.stringify(mismatches)}`);
      }

      // Evidence calls: once per dependency entry, never for skipped names, with the lockfile version first.
      if (gate.calls.length !== registry.size) throw new Error(`${gate.calls.length} evidence calls for ${registry.size} entries`);
      const seen = new Set<string>();
      for (const c of gate.calls) {
        if (seen.has(c.name)) throw new Error(`evidence called twice for ${c.name}`);
        seen.add(c.name);
        const range = registry.get(c.name);
        if (range === undefined) throw new Error(`evidence called for non-registry name ${c.name}`);
        const expected = (accepted ? lock.usable.get(c.name) : undefined) ?? range;
        if (c.versionRange !== expected) throw new Error(`${c.name}: evidence got ${c.versionRange}, expected ${expected}`);
      }
    }),
};
