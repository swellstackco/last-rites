import type { Sabotage } from "../sabotage-runner.js";
import type { CountFn } from "../properties/osv-count.js";
import type { OsvAffected, OsvVuln } from "../../osv-count.js";

interface Opts {
  perObject: boolean;
  fixKeys: readonly string[];
  checkEcosystem: boolean;
  firstAffectedOnly: boolean;
}
const CORRECT: Opts = { perObject: false, fixKeys: ["fixed"], checkEcosystem: true, firstAffectedOnly: false };

function make(overrides: Partial<Opts>): CountFn {
  const o = { ...CORRECT, ...overrides };
  const fixedBy = (a: OsvAffected, name: string): boolean => {
    if (a.package?.name !== name) return false;
    if (o.checkEcosystem && a.package?.ecosystem !== "npm") return false;
    return (a.ranges ?? []).some((r) => (r.events ?? []).some((e) => o.fixKeys.some((k) => k in e)));
  };
  const vulnFixed = (v: OsvVuln, name: string): boolean => {
    const entries = o.firstAffectedOnly ? (v.affected ?? []).slice(0, 1) : (v.affected ?? []);
    return entries.some((a) => fixedBy(a, name));
  };
  return (vulns, name) => {
    if (o.perObject) return vulns.filter((v) => !vulnFixed(v, name)).length;
    const ids = new Map<string, boolean>();
    for (const v of vulns) ids.set(v.id, (ids.get(v.id) ?? false) || vulnFixed(v, name));
    return [...ids.values()].filter((f) => !f).length;
  };
}

export const P8_SABOTAGES: ReadonlyArray<Sabotage<CountFn>> = [
  { name: "counts objects, not distinct ids", impl: make({ perObject: true }) },
  { name: "last_affected treated as a fix", impl: make({ fixKeys: ["fixed", "last_affected"] }) },
  { name: "ecosystem ignored", impl: make({ checkEcosystem: false }) },
  { name: "only the first affected entry examined", impl: make({ firstAffectedOnly: true }) },
];
