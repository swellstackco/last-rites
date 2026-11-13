# Synthetic source trees

Every tree here was written for this repository. None is copied from a real project.

- `intersect-like/`: a Flow-annotated `.js` file with `import intersect from 'intersect'`, `intersect.big(allIds)` and `intersect(allIds)`, plus a decoy `src/other.js` calling `other.big(x)`.
- `deep-diff-like/`: spec files with `const dd = require('deep-diff')` and `expect(dd(a, b)).toEqual(undefined)` (single and multi line), plus `Odd.spec.js` where the result is used another way.
- `declared-only/`: `package.json` lists `node-abort-controller`, the source never imports it.

`node_modules` and `dist` directories are created in temporary directories by the tests, because `.gitignore` excludes them.
