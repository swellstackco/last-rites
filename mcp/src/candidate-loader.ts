import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCandidate, type LoadedCandidate } from "@last-rites/exorcist-npm/programmatic";

/**
 * Load a Candidate so that an edited file is evaluated again in a long-lived process (Requirement 8.8):
 * the first 16 hex digits of the SHA-256 of the source text are passed as `cacheBust`.
 */
export async function loadCandidateBusted(file: string): Promise<LoadedCandidate> {
  let bust: string | undefined;
  try {
    bust = createHash("sha256").update(await readFile(resolve(file))).digest("hex").slice(0, 16);
  } catch {
    bust = undefined; // loadCandidate reports the unreadable file with its own message
  }
  return loadCandidate(file, bust);
}
