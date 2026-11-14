export { actionProofName } from "@last-rites/skeleton/proof";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `<repo part of the label, sanitized, cut to 54>-actions`. Pure and total; a Proof_Name. */
export function repoProofName(label: string): string {
  const text = String(label);
  const part = text.includes("/") ? text.slice(text.indexOf("/") + 1) : text;
  return `${slug(part).slice(0, 54) || "repo"}-actions`;
}
