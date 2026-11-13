import fc from "fast-check";
import { KIND_PRECEDENCE } from "../../types.js";
import type { DependencyKind, SkipReason } from "../../types.js";

/** Intended class of a generated specifier: a skip reason, or a Registry_Specifier. */
export type SpecClass = SkipReason | "registry";

export interface TaggedSpec {
  range: string;
  cls: SpecClass;
}

export interface GeneratedManifest {
  /** The package.json text. */
  text: string;
  /** name -> kind -> tagged specifier, as generated. */
  declared: Map<string, Map<DependencyKind, TaggedSpec>>;
  hasWorkspaces: boolean;
}

const SPECS: ReadonlyArray<readonly [SpecClass, readonly string[]]> = [
  ["registry", ["^1.2.3", "~2.0.0", ">=1.0.0 <3", "1.x", "1.2.3", "*", "", "latest", "next", "beta", "^0.0.1"]],
  ["npm_alias", ["npm:other@^1.0.0", "npm:@scope/x@1.2.3"]],
  [
    "git",
    [
      "git+https://github.com/a/b.git",
      "git://example.com/a/b.git",
      "github:a/b",
      "a/b",
      "a/b#main",
      "owner/repo#semver:^1.0.0",
      "git@github.com:a/b.git",
      "gitlab:a/b",
      "bitbucket:a/b",
      "gist:abc123",
      "ssh://git@host/a/b.git",
    ],
  ],
  ["file", ["file:../x", "./x", "../x", "/abs/path", "~/x"]],
  ["link", ["link:../x"]],
  ["http", ["http://example.com/x.tgz", "https://example.com/x.tgz"]],
  ["workspace", ["workspace:*", "workspace:^1.0.0"]],
  ["other", ["portal:../x"]],
];

const taggedSpec: fc.Arbitrary<TaggedSpec> = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom(...SPECS[0]![1]).map((range) => ({ range, cls: "registry" as SpecClass })) },
  ...SPECS.slice(1).map(([cls, list]) => ({
    weight: 1,
    arbitrary: fc.constantFrom(...list).map((range) => ({ range, cls })),
  })),
);

const NAME_POOL = ["a", "b", "c", "d", "left-pad", "@scope/pkg", "@scope/other", "Upper", "lodash.get", "__proto__", "constructor"];

/** Extra generated names so wide manifests (up to 50 names) are possible. */
const WIDE_POOL = [...NAME_POOL, ...Array.from({ length: 50 }, (_, i) => `pkg-${i}`)];

const namesOf = (maxNames: number) =>
  fc.uniqueArray(fc.constantFrom(...(maxNames > NAME_POOL.length ? WIDE_POOL : NAME_POOL)), { minLength: 0, maxLength: maxNames });

/** Kinds subset (at least one), as a mask over the four kinds. */
const kindSubset: fc.Arbitrary<DependencyKind[]> = fc
  .integer({ min: 1, max: 15 })
  .map((mask) => KIND_PRECEDENCE.filter((_, i) => (mask >> i) & 1));

/** Own-property assignment that is safe for `__proto__`. */
function setOwn(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

/** Insertion-order shuffle selector: kinds are written to the manifest in this order. */
const kindOrder = fc.shuffledSubarray([...KIND_PRECEDENCE], { minLength: 4, maxLength: 4 });

/** A manifest arbitrary with 0 to `maxNames` distinct names. */
export const manifestArbUpTo = (maxNames: number): fc.Arbitrary<GeneratedManifest> => fc
  .tuple(
    namesOf(maxNames).chain((names) =>
      fc.tuple(
        fc.constant(names),
        fc.array(fc.tuple(kindSubset, fc.array(taggedSpec, { minLength: 4, maxLength: 4 })), {
          minLength: names.length,
          maxLength: names.length,
        }),
      ),
    ),
    kindOrder,
    fc.option(fc.oneof(fc.constant(["packages/*"]), fc.constant({ packages: ["a"] }), fc.constant(null)), { nil: undefined }),
    fc.boolean(),
  )
  .map(([[names, perName], order, workspaces, flip]) => {
    const declared = new Map<string, Map<DependencyKind, TaggedSpec>>();
    const fields = new Map<DependencyKind, object>();
    names.forEach((name, i) => {
      const [kinds, specs] = perName[i]!;
      const perKind = new Map<DependencyKind, TaggedSpec>();
      kinds.forEach((kind, j) => {
        // When `flip` is set, later kinds sometimes reuse the first kind's specifier (identical ranges).
        const spec = flip && j > 0 && j % 2 === 1 ? perKind.get(kinds[0]!)! : specs[j]!;
        perKind.set(kind, spec);
        let field = fields.get(kind);
        if (!field) {
          field = {};
          fields.set(kind, field);
        }
        setOwn(field, name, spec.range);
      });
      declared.set(name, perKind);
    });
    const manifest: Record<string, unknown> = { name: "generated", version: "1.0.0" };
    for (const kind of order) {
      const field = fields.get(kind);
      if (field) manifest[kind] = field;
    }
    if (workspaces !== undefined) manifest["workspaces"] = workspaces;
    return { text: JSON.stringify(manifest, null, 2), declared, hasWorkspaces: workspaces !== undefined };
  });

export const manifestArb: fc.Arbitrary<GeneratedManifest> = manifestArbUpTo(8);
