/**
 * countOpenVulnsNoFix (Requirements 5.2, 5.3): number of distinct OSV ids with no
 * `fixed` event on any affected entry for this npm package. Pure.
 * `last_affected` is not a fix. A vulnerability with no matching affected entry
 * counts as unfixed.
 */

export interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}
export interface OsvRange {
  type?: string;
  events?: readonly OsvEvent[];
}
export interface OsvAffected {
  package?: { ecosystem?: string; name?: string };
  ranges?: readonly OsvRange[];
}
export interface OsvVuln {
  id: string;
  affected?: readonly OsvAffected[];
}

function hasFix(a: OsvAffected): boolean {
  if (!Array.isArray(a.ranges)) return false;
  return a.ranges.some(
    (r) =>
      Array.isArray(r?.events) &&
      r.events.some((e: OsvEvent) => typeof e === "object" && e !== null && Object.hasOwn(e, "fixed")),
  );
}

export function countOpenVulnsNoFix(vulns: readonly OsvVuln[], name: string, ecosystem = "npm"): number {
  const fixedById = new Map<string, boolean>();
  for (const v of vulns) {
    if (typeof v?.id !== "string") continue;
    let fixed = fixedById.get(v.id) ?? false;
    if (Array.isArray(v.affected)) {
      for (const a of v.affected) {
        if (a?.package?.ecosystem === ecosystem && a.package.name === name && hasFix(a)) fixed = true;
      }
    }
    fixedById.set(v.id, fixed);
  }
  let open = 0;
  for (const fixed of fixedById.values()) if (!fixed) open++;
  return open;
}
