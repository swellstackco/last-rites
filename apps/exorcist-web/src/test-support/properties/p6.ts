import fc from "fast-check";
import { ensure } from "@last-rites/skeleton/graveyard/testing";
import { formatRoute, parseRoute } from "../../app/router.js";
import type { Route } from "../../app/router.js";
import { parseRepoInput } from "../../model/repo-input.js";

export interface RouteCodec {
  parseRoute: (hash: string) => Route;
  formatRoute: (route: Route) => string;
}

export const REAL_CODEC: RouteCodec = { parseRoute, formatRoute };

/** Package keys that stress the codec. All are well-formed UTF-16 (a lone surrogate cannot be encoded). */
const PKG_CORPUS: readonly string[] = [
  "left-pad",
  "@scope/name",
  "@scope/name#2",
  "a/b/c",
  "a#b",
  "50%",
  "%2F",
  "%",
  "a&b=c",
  "a?b",
  "a+b",
  "a b",
  " ",
  "emoji-\u{1F480}",
  "\u00e9",
  "=",
  "&&",
  "pkg=x",
];

const pkgArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...PKG_CORPUS) },
  { weight: 3, arbitrary: fc.string({ unit: "grapheme", minLength: 1, maxLength: 12 }) },
  { weight: 3, arbitrary: fc.string({ unit: "binary", minLength: 1, maxLength: 12 }).filter((s) => !/[\ud800-\udfff]/.test(s)) },
  { weight: 2, arbitrary: fc.array(fc.constantFrom("/", "&", "?", "#", "%", "+", "=", " ", "a", "@"), { minLength: 1, maxLength: 8 }).map((a) => a.join("")) },
);

const demoNameArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/);
const ownerArb = fc.stringMatching(/^[A-Za-z0-9-]{1,39}$/);
const repoNameArb = fc
  .stringMatching(/^[A-Za-z0-9._-]{1,40}$/)
  // A name ending in ".git" is stripped by the Repo_Input parser (accepted spelling), so it cannot round trip.
  .filter((n) => n !== "." && n !== ".." && !n.endsWith(".git"));
const refArb = fc.stringMatching(/^[A-Za-z0-9._/-]{1,30}$/).filter((r) => !r.includes(".."));

const optional = <T>(a: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> => fc.option(a, { nil: undefined });

export const validRouteArb: fc.Arbitrary<Route> = fc.oneof(
  fc.constant<Route>({ view: "picker" }),
  fc.tuple(demoNameArb, optional(pkgArb)).map(([name, pkg]): Route => (pkg === undefined ? { view: "demo", name } : { view: "demo", name, pkg })),
  fc
    .tuple(ownerArb, repoNameArb, optional(refArb), optional(pkgArb))
    .map(([o, n, ref, pkg]): Route => {
      const r: Route = { view: "live", repo: `${o}/${n}` };
      if (ref !== undefined) r.ref = ref;
      if (pkg !== undefined) r.pkg = pkg;
      return r;
    }),
);

const PIECES = [
  "#/", "#", "/", "demo/", "live", "?", "&", "=", "pkg", "repo", "ref", "%", "%E0%A4%A", "%zz", "%2F", "%00", "x", "a/b",
  "+", "owner/name", "parse-server", "..", " ", "\ud800", "%ED%A0%80", "\u{1F480}", "UPPER",
];

/** Arbitrary strings, hash-shaped pieces and broken percent-escapes. */
export const hashStringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.string({ maxLength: 30 }) },
  { weight: 2, arbitrary: fc.string({ unit: "binary", maxLength: 30 }) },
  { weight: 6, arbitrary: fc.array(fc.constantFrom(...PIECES), { maxLength: 10 }).map((a) => a.join("")) },
  {
    weight: 4,
    arbitrary: fc
      .tuple(fc.constantFrom("#/demo/x?pkg=", "#/live?repo=a/b&pkg=", "#/live?repo=a%2Fb&ref=", "#/demo/x?"), fc.array(fc.constantFrom(...PIECES), { maxLength: 5 }))
      .map(([p, a]) => p + a.join("")),
  },
);

const DEMO_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Characters `encodeURIComponent` leaves unescaped, plus `%`, `=` and `&` as separators. */
const WELL_FORMED = /^#\/(?:(?:demo\/[a-z0-9-]+)|live)?(?:\?[A-Za-z0-9\-_.!~*'()%=&]*)?$/;

function ensureValidRoute(r: Route, input: string): void {
  switch (r.view) {
    case "picker":
      return;
    case "demo":
      ensure(DEMO_RE.test(r.name), `demo name ${JSON.stringify(r.name)} invalid (from ${JSON.stringify(input)})`);
      ensure(r.pkg === undefined || r.pkg !== "", "empty pkg must be absent");
      return;
    case "live": {
      const p = parseRepoInput(r.repo, r.ref);
      ensure(p.ok, `live route repo/ref rejected by parseRepoInput (from ${JSON.stringify(input)})`);
      ensure(r.pkg === undefined || r.pkg !== "", "empty pkg must be absent");
      return;
    }
  }
}

/** Property 6: route codec round trip and totality. */
export function build(impl: RouteCodec = REAL_CODEC): fc.IPropertyWithHooks<[Route, string]> {
  return fc.property(validRouteArb, hashStringArb, (route, hash) => {
    // Round trip.
    const formatted = impl.formatRoute(route);
    ensure(WELL_FORMED.test(formatted), `formatted route ${JSON.stringify(formatted)} has an unescaped character`);
    const back = impl.parseRoute(formatted);
    ensure(
      JSON.stringify(back) === JSON.stringify(route),
      `round trip changed the route: ${JSON.stringify(route)} -> ${formatted} -> ${JSON.stringify(back)}`,
    );

    // Totality: any string gives a valid Route, no throw.
    const parsed = impl.parseRoute(hash);
    ensureValidRoute(parsed, hash);

    // Normal form is idempotent.
    const once = impl.formatRoute(parsed);
    const twice = impl.formatRoute(impl.parseRoute(once));
    ensure(once === twice, `normal form not idempotent: ${JSON.stringify(once)} -> ${JSON.stringify(twice)}`);
  });
}
