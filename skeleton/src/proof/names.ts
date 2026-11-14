// Proof_Names: the only strings allowed to become path segments of a Proof_Report.
import { sha256Hex } from "./sha256.js";

export const PROOF_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const isProofName = (s: string): boolean => typeof s === "string" && PROOF_NAME_PATTERN.test(s);

const PREFIX = "demo/proofs/";
const SUFFIX = ".json";

/** "demo/proofs/<repo>/<package>.json", or undefined unless both are Proof_Names. */
export function proofReportPath(repo: string, pkg: string): string | undefined {
  if (!isProofName(repo) || !isProofName(pkg)) return undefined;
  return `${PREFIX}${repo}/${pkg}${SUFFIX}`;
}

/** Inverse of `proofReportPath`: exactly that shape, else undefined. */
export function parseProofReportPath(path: string): { repo: string; package: string } | undefined {
  if (typeof path !== "string" || !path.startsWith(PREFIX) || !path.endsWith(SUFFIX)) return undefined;
  const inner = path.slice(PREFIX.length, path.length - SUFFIX.length);
  const parts = inner.split("/");
  if (parts.length !== 2) return undefined;
  const [repo, pkg] = parts as [string, string];
  if (!isProofName(repo) || !isProofName(pkg)) return undefined;
  return { repo, package: pkg };
}

// ---- github-actions names (graveyard-ui-actions) -----------------------------------------------------------------

export type Ecosystem = "npm" | "github-actions";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `<slug cut to 55>-<8 hex of sha256(lower-cased name)>`. Pure and total; a Proof_Name. */
export function actionProofName(actionName: string): string {
  const lower = String(actionName).toLowerCase();
  const s = slug(lower).slice(0, 55) || "x";
  return `${s}-${sha256Hex(lower).slice(0, 8)}`;
}

/** The Proof_Name of one dependency, or undefined when it has none. Pure and total. */
export function proofNameFor(ecosystem: Ecosystem | undefined, name: string): string | undefined {
  if (ecosystem === "github-actions") return typeof name === "string" && name !== "" ? actionProofName(name) : undefined;
  return isProofName(name) ? name : undefined;
}
