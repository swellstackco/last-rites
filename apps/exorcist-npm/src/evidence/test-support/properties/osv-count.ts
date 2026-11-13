import fc from "fast-check";
import type { NamedProperty } from "../sabotage-runner.js";
import type { OsvAffected, OsvEvent, OsvVuln } from "../../osv-count.js";

/** The seam under test for Property 8. */
export type CountFn = (vulns: readonly OsvVuln[], name: string) => number;

export const TARGET = "target-pkg";
const OTHER = "other-pkg";

const eventArb: fc.Arbitrary<OsvEvent> = fc.oneof(
  fc.constant<OsvEvent>({ introduced: "0" }),
  fc.constant<OsvEvent>({ fixed: "1.2.3" }),
  fc.constant<OsvEvent>({ last_affected: "1.0.0" }),
  fc.constant<OsvEvent>({ limit: "2.0.0" }),
);

const affectedArb: fc.Arbitrary<OsvAffected> = fc.record({
  package: fc.record({
    ecosystem: fc.constantFrom("npm", "PyPI"),
    name: fc.constantFrom(TARGET, OTHER),
  }),
  ranges: fc.array(
    fc.record({
      type: fc.constantFrom("SEMVER", "ECOSYSTEM"),
      events: fc.array(eventArb, { maxLength: 4 }),
    }),
    { maxLength: 2 },
  ),
});

const vulnArb: fc.Arbitrary<OsvVuln> = fc.record({
  id: fc.constantFrom("GHSA-1", "GHSA-2", "GHSA-3", "CVE-4", "CVE-5"),
  affected: fc.array(affectedArb, { maxLength: 3 }),
});

export const vulnListArb: fc.Arbitrary<OsvVuln[]> = fc.array(vulnArb, { maxLength: 12 });

/** Independent oracle: distinct ids with no matching npm/target affected entry holding a `fixed` event. */
export function modelCount(vulns: readonly OsvVuln[], name: string): number {
  const ids = [...new Set(vulns.map((v) => v.id))];
  return ids.filter((id) => {
    const entries = vulns
      .filter((v) => v.id === id)
      .flatMap((v) => v.affected ?? [])
      .filter((a) => a.package?.ecosystem === "npm" && a.package?.name === name);
    const events = entries.flatMap((a) => (a.ranges ?? []).flatMap((r) => r.events ?? []));
    return !events.some((e) => "fixed" in e);
  }).length;
}

/** Property 8: Open-vulnerability count matches the unfixed-id model. */
export const property8: NamedProperty<CountFn> = {
  name: "Property 8: Open-vulnerability count matches the unfixed-id model",
  build: (impl) =>
    fc.property(vulnListArb, fc.nat({ max: 12 }), (vulns, rot) => {
      const expected = modelCount(vulns, TARGET);
      const got = impl(vulns, TARGET);
      if (got !== expected) throw new Error(`expected ${expected}, got ${got}`);
      const reversed = impl([...vulns].reverse(), TARGET);
      if (reversed !== expected) throw new Error(`reordering changed the count: ${reversed} vs ${expected}`);
      const k = vulns.length === 0 ? 0 : rot % vulns.length;
      const rotated = impl([...vulns.slice(k), ...vulns.slice(0, k)], TARGET);
      if (rotated !== expected) throw new Error(`rotation changed the count: ${rotated} vs ${expected}`);
      const doubled = impl([...vulns, ...vulns], TARGET);
      if (doubled !== expected) throw new Error(`self-concatenation changed the count: ${doubled} vs ${expected}`);
      if (impl([], TARGET) !== 0) throw new Error("empty list must give 0");
    }),
};
