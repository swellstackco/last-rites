// Sabotage_List for Properties 2 and 3 (graveyard-ui-actions 4.2, design.md). Named ui-actions-p2 because
// `actions-p2.ts` already belongs to the exorcist-actions spec. Each entry is a deliberately wrong implementation.
import { actionProofName, sha256Hex } from "@last-rites/skeleton/proof";
import type { NamesImpl } from "../properties/p-actions-2.js";
import { realNamesImpl } from "../properties/p-actions-2.js";
import type { Sabotage } from "../sabotage-runner.js";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** A `NamesImpl` whose name function is `wrong` everywhere it is used. */
function withName(wrong: (name: string) => string): NamesImpl {
  const real = realNamesImpl(actionProofName);
  return {
    ...real,
    actionProofName: wrong,
    exported: wrong,
    proofNameFor: (eco, name) => (eco === "github-actions" ? (name === "" ? undefined : wrong(name)) : real.proofNameFor(eco, name)),
  };
}

const real = realNamesImpl(actionProofName);

export const P2_SABOTAGES: ReadonlyArray<Sabotage<NamesImpl>> = [
  { name: "(a) hash of the original-case name", impl: withName((n) => `${slug(n).slice(0, 55) || "x"}-${sha256Hex(String(n)).slice(0, 8)}`) },
  { name: "(b) slug cut at 56", impl: withName((n) => `${slug(n).slice(0, 56) || "x"}-${sha256Hex(n.toLowerCase()).slice(0, 8)}`) },
  { name: "(c) first 7 hex", impl: withName((n) => `${slug(n).slice(0, 55) || "x"}-${sha256Hex(n.toLowerCase()).slice(0, 7)}`) },
  {
    // Padding bug: input over one block (55 bytes) is hashed as if cut at 55 characters.
    name: "(f) sha256 wrong for inputs over 55 bytes",
    impl: { ...real, sha256Hex: (t) => (new TextEncoder().encode(t).length > 55 ? sha256Hex(t.slice(0, 55)) : sha256Hex(t)) },
  },
];

export const P3_PURE_SABOTAGES: ReadonlyArray<Sabotage<NamesImpl>> = [
  { name: "(a) proofNameFor for npm returns actionProofName(n)", impl: { ...real, proofNameFor: (_eco, n) => (n === "" ? undefined : actionProofName(n)) } },
  {
    name: "(b) proofNameFor accepts names the pattern rejects (scoped names get a request)",
    impl: { ...real, proofNameFor: (eco, n) => (eco === "github-actions" ? real.proofNameFor(eco, n) : n === "" ? undefined : n) },
  },
];

/** Static sabotages (d) and (e): the files a wrong checkout would contain, added to the real ones. */
export const P2_STATIC_SABOTAGES: ReadonlyArray<{ name: string; extra: Readonly<Record<string, string>> }> = [
  { name: "(d) a copy of the function left in the web app", extra: { "apps/exorcist-web/src/model/copy.ts": ["export func", "tion actionProofName(n: string): string { return n; }\n"].join("") } },
  { name: "(e) node:crypto import in the skeleton", extra: { "skeleton/src/proof/sha256.ts": 'import { createHash } from "node:crypto";\n' } },
];
