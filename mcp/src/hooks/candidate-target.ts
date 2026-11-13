import { isProofName } from "@graveyard-kit/skeleton/proof";

const MARKER = ["demo", "proofs", "candidates"] as const;

/**
 * `<prefix>demo/proofs/candidates/<repo>/<package>.<tag>.js` -> `{ repo, package }`, where the prefix is empty,
 * `./` or any absolute directory. Undefined for any other shape: a `..` or empty segment, extra depth, a
 * non-`.js` file, a backslash, a NUL, or a name that is not a Proof_Name.
 */
export function candidateTarget(path: string): { repo: string; package: string } | undefined {
  if (typeof path !== "string" || path.includes("\\") || path.includes("\0")) return undefined;
  const segments = path.split("/");
  if (segments.includes("..")) return undefined;
  if (segments.length < MARKER.length + 2) return undefined;
  const [repo, file] = segments.slice(-2) as [string, string];
  const marker = segments.slice(-2 - MARKER.length, -2);
  if (marker.some((s, i) => s !== MARKER[i])) return undefined;
  // Only a leading empty segment (an absolute path) is allowed in the prefix.
  const prefix = segments.slice(0, -2 - MARKER.length);
  if (prefix.some((s, i) => s === "" && i !== 0)) return undefined;

  if (!file.endsWith(".js")) return undefined;
  const dot = file.indexOf(".");
  // `<package>.<tag>.js`: at least one dot before the final `.js`.
  if (dot < 0 || dot === file.length - 3) return undefined;
  const pkg = file.slice(0, dot);
  if (!isProofName(repo) || !isProofName(pkg)) return undefined;
  return { repo, package: pkg };
}
