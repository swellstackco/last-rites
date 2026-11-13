// Proof_Names: the only strings allowed to become path segments of a Proof_Report.

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
