// Property 2 (graveyard-ui-actions, 2.3): `actionProofName` has one definition (the skeleton's), computed by a pure
// SHA-256 that equals an independent `node:crypto` model for every string, including empty, upper-case, non-ASCII,
// lone surrogates and multi-block input. The implementation under test is swappable (Sabotage_List, task 4.2).
import { createHash } from "node:crypto";
import fc from "fast-check";
import { actionProofName, isProofName, sha256Hex } from "@last-rites/skeleton/proof";
import type { NamedProperty } from "../sabotage-runner.js";

export interface NamesImpl {
  /** The skeleton's actionProofName (or a wrong one). */
  actionProofName(name: string): string;
  /** The skeleton's SHA-256 (or a wrong one). */
  sha256Hex(text: string): string;
  /** The name function the actions app exports under its public name. */
  exported(name: string): string;
}

/** Test-only model with `node:crypto`, independent of the code under test. */
export const modelSha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export function modelName(name: string): string {
  const lower = String(name).toLowerCase();
  return `${slug(lower).slice(0, 55) || "x"}-${modelSha256(lower).slice(0, 8)}`;
}

const must = (ok: boolean, message: string): void => {
  if (!ok) throw new Error(message);
};

/** Strings of every length class: empty, short, around the 55/56/64-byte block edges, multi-block, any unicode. */
export const nameArb: fc.Arbitrary<string> = fc.oneof(
  { weight: 2, arbitrary: fc.constantFrom("", "A", "actions/checkout", "Actions-RS/Toolchain", "é/ü", "\u{1F480}/x") },
  { weight: 3, arbitrary: fc.fullUnicodeString({ maxLength: 40 }) },
  { weight: 2, arbitrary: fc.string16bits({ maxLength: 40 }) },
  { weight: 3, arbitrary: fc.stringOf(fc.constantFrom("a", "B", "/", "@", ".", "-", "_", "é", "9"), { minLength: 0, maxLength: 80 }) },
  // 50-70 and 110-130 bytes: both sides of the one- and two-block padding edges.
  { weight: 3, arbitrary: fc.integer({ min: 50, max: 70 }).chain((n) => fc.string({ minLength: n, maxLength: n })) },
  { weight: 3, arbitrary: fc.integer({ min: 110, max: 130 }).chain((n) => fc.string({ minLength: n, maxLength: n })) },
  { weight: 2, arbitrary: fc.string({ minLength: 100, maxLength: 700 }) },
);

export const namesProperties: ReadonlyArray<NamedProperty<NamesImpl>> = [
  {
    name: "P-actions-2 sha256Hex equals the node:crypto model",
    build: (impl) => fc.property(nameArb, (s) => must(impl.sha256Hex(s) === modelSha256(s), `sha256 of ${JSON.stringify(s.slice(0, 40))} (${s.length} chars) differs`)),
  },
  {
    name: "P-actions-2 actionProofName equals the model, is a Proof_Name of at most 64 characters",
    build: (impl) =>
      fc.property(nameArb, (s) => {
        const got = impl.actionProofName(s);
        must(got === modelName(s), `${JSON.stringify(s.slice(0, 40))}: got ${got}, model ${modelName(s)}`);
        must(isProofName(got) && got.length <= 64, `${got} is not a Proof_Name of at most 64 characters`);
      }),
  },
  {
    name: "P-actions-2 the actions app exports the same function",
    build: (impl) => fc.property(nameArb, (s) => must(impl.exported(s) === impl.actionProofName(s), `the export differs for ${JSON.stringify(s.slice(0, 40))}`)),
  },
];

export const realNamesImpl = (exported: (name: string) => string): NamesImpl => ({ actionProofName, sha256Hex, exported });
