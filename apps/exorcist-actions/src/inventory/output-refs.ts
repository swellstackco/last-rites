const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Sorted, unique `<name>` of every `steps.<stepId>.outputs.<name>` occurrence in `laterStepsText`. */
export function outputRefsFor(stepId: string | undefined, laterStepsText: string): string[] {
  if (stepId === undefined || stepId === "") return [];
  const re = new RegExp(`steps\\.${escapeRegExp(stepId)}\\.outputs\\.([A-Za-z0-9_-]+)`, "g");
  const found = new Set<string>();
  for (const m of laterStepsText.matchAll(re)) found.add(m[1]!);
  return [...found].sort(cmp);
}
