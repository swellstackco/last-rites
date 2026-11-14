import fc from "fast-check";

const hex = "0123456789abcdefABCDEF";
const hexString = (n: number): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...hex.split("")), { minLength: n, maxLength: n }).map((a) => a.join(""));

/** 39, 40 and 41 hexadecimal characters, either case. */
export const shaLikeArb: fc.Arbitrary<string> = fc.oneof(hexString(39), hexString(40), hexString(41));

/** Real and hostile pieces of a `uses` value. */
const PIECES: readonly string[] = [
  "actions/",
  "checkout",
  "@",
  "@",
  "v1",
  "main",
  ".",
  "..",
  "%2e",
  "%2E%2e",
  "${{ matrix.x }}",
  "docker://",
  "./",
  "../",
  " ",
  "\u0000",
  "\n",
  "\r\n",
  "é",
  "日本",
  "a/b",
  "/",
  "-",
  "_",
  "?",
  "#",
  "a".repeat(300),
];

const pieceArb = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...PIECES) },
  { weight: 2, arbitrary: shaLikeArb },
  { weight: 2, arbitrary: fc.string({ maxLength: 8 }) },
);

/** A string built from the alphabet of real and hostile pieces. */
export const hostileUsesArb: fc.Arbitrary<string> = fc
  .array(pieceArb, { minLength: 0, maxLength: 8 })
  .map((a) => a.join(""));

const ownerArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom("actions", "a", "A-b", "dtolnay", "x1") },
  { weight: 2, arbitrary: fc.constantFrom("-bad", "x".repeat(39), "x".repeat(40), "a b", "", "a_b", "é") },
);
const repoArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom("checkout", "a.b", "setup-node", "x_y", "r") },
  { weight: 2, arbitrary: fc.constantFrom(".", "..", "x".repeat(100), "x".repeat(101), "a b", "", "a@b") },
);
const segmentArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom("sub", "a.b", "dir-1", "x_y") },
  { weight: 2, arbitrary: fc.constantFrom(".", "..", "", "a b", "%2e", "é") },
);
const refArb = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom("v1", "v1.2.3", "main", "release/v1", "a_b", "x".repeat(255)) },
  { weight: 3, arbitrary: fc.constantFrom(".", "..", "a/../b", "a/./b", "../..", "a//b", "x".repeat(256)) },
  { weight: 3, arbitrary: shaLikeArb },
  { weight: 1, arbitrary: fc.constantFrom("", "v 1", "${{ github.ref }}", "a@b", "é") },
);

/** `owner/repo[/path]@ref` with valid and invalid pieces. */
export const structuredUsesArb: fc.Arbitrary<string> = fc
  .tuple(ownerArb, repoArb, fc.array(segmentArb, { maxLength: 2 }), refArb)
  .map(([o, r, p, ref]) => `${o}/${r}${p.map((s) => `/${s}`).join("")}@${ref}`);

/** Valid in every part but at most one, which is a boundary or hostile value. */
export const nearValidUsesArb: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom("actions", "a", "A-b", "x".repeat(39), "x".repeat(40)),
    fc.constantFrom("checkout", "a.b", "x".repeat(100)),
    fc.array(fc.constantFrom("sub", "a.b", ".", "..", "x_y"), { maxLength: 2 }),
    fc.oneof(
      fc.constantFrom("v1", "main", "release/v1", "v${{ x }}", "a${{b}}"),
      shaLikeArb,
      fc.constantFrom("a".repeat(40), "A".repeat(40), "f".repeat(39), "F".repeat(41)),
    ),
  )
  .map(([o, r, p, ref]) => `${o}/${r}${p.map((x) => `/${x}`).join("")}@${ref}`);

/** The arbitrary of Property 2: structured and hostile strings. */
export const usesStringArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: structuredUsesArb },
  { weight: 3, arbitrary: nearValidUsesArb },
  { weight: 2, arbitrary: hostileUsesArb },
  { weight: 1, arbitrary: fc.constantFrom("docker://alpine:3", "docker://a/b@c", "./.github/actions/x", "../x@v1") },
);
