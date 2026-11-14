import { createHash } from "node:crypto";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `<slug cut to 55>-<8 hex of sha256(lower-cased name)>`. Pure and total; a Proof_Name. */
export function actionProofName(actionName: string): string {
  const lower = String(actionName).toLowerCase();
  const s = slug(lower).slice(0, 55) || "x";
  return `${s}-${createHash("sha256").update(lower).digest("hex").slice(0, 8)}`;
}

/** `<repo part of the label, sanitized, cut to 54>-actions`. Pure and total; a Proof_Name. */
export function repoProofName(label: string): string {
  const text = String(label);
  const part = text.includes("/") ? text.slice(text.indexOf("/") + 1) : text;
  return `${slug(part).slice(0, 54) || "repo"}-actions`;
}
