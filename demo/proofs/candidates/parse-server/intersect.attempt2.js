// Attempt 2: corrected native replacement for `intersect@1.0.1`.
// Written for this repository, from the shrunk counterexample of attempt 1:
// the old package returns the elements of the LAST list, in its order and with its
// duplicates, keeping those that appear in every earlier list.

function intersect(lists) {
  if (!Array.isArray(lists) || lists.length === 0) return [];
  const last = lists[lists.length - 1];
  const earlier = lists.slice(0, -1).map((list) => new Set(list));
  return last.filter((item) => earlier.every((s) => s.has(item)));
}

intersect.big = intersect;

export default intersect;
