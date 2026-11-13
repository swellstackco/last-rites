// Requirement 2.7: classify a file path (already relative to the scan root) as test or source code.
import type { Enclosing } from "@graveyard-kit/skeleton/proof";

const TEST_SEGMENTS: ReadonlySet<string> = new Set(["spec", "test", "tests", "__tests__", "__mocks__"]);

export function enclosingOf(file: string): Enclosing {
  const segments = file.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (name.includes(".spec.") || name.includes(".test.")) return "test";
  for (let i = 0; i < segments.length - 1; i++) {
    if (TEST_SEGMENTS.has(segments[i] as string)) return "test";
  }
  return "src";
}
