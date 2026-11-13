// Attempt 1: the NAIVE native replacement for `intersect@1.0.1`.
// Written for this repository. It builds Sets, so it de-duplicates the result.
// It is expected to be wrong where the old package keeps duplicates of the last list.

function intersect(lists) {
  if (!Array.isArray(lists) || lists.length === 0) return [];
  const [first, ...rest] = lists;
  const restSets = rest.map((list) => new Set(list));
  const seen = new Set();
  const out = [];
  for (const item of first) {
    if (seen.has(item)) continue;
    if (restSets.every((s) => s.has(item))) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

intersect.big = intersect;

export default intersect;
