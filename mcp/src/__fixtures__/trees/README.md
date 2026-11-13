# Synthetic source trees

Written for this repository; none is copied from a real project. They mimic the call shapes the usage surface looks for.

- `intersect-like/`: a Flow-annotated `.js` file with `import intersect from 'intersect'`, `intersect.big(allIds)` and `intersect(allIds)`, plus a decoy `src/other.js` calling `other.big(x)`.
- `declared-only/`: `package.json` lists `node-abort-controller`, the source never imports it.
