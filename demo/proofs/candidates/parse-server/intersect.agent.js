// Replacement for `intersect` as called in parse-server: intersect(arrays) and intersect.big(arrays).
// Semantics (matching the old package's many-set path): membership is by string key,
// and the result is taken from the LAST list, keeping its order and duplicates.
function intersect(sets) {
  const l = sets.length - 1;
  const o = {};
  for (const i in sets[0]) o[sets[0][i]] = 0;
  for (let i = 1; i <= l; i++) {
    const row = sets[i];
    for (const j in row) {
      const key = row[j];
      if (o[key] === i - 1) o[key] = i;
    }
  }
  const a = [];
  const last = sets[l];
  for (const i in last) {
    const key = last[i];
    if (o[key] === l) a.push(key);
  }
  return a;
}
intersect.big = intersect;

export const big = intersect;
export { intersect };
export default intersect;
