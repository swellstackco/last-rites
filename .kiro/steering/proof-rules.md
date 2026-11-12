---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.prop.ts", "skeleton/src/proof/**", "apps/*/src/pin-tests/**"]
---

# Proof rules (no fake green)

- **No trivial passes.** A property that cannot fail is a bug. Every pin test suite runs a **sabotage check**: swap in a deliberately wrong implementation and confirm at least one property fails. If sabotage stays green, the suite is rejected.
- **A pin test with zero real call sites fails** instead of passing vacuously.
- **Generators match real usage.** Arbitraries are shaped by the argument types and values seen at the real call sites (strings, formats, option objects), plus edge cases (empty, unicode, boundaries).
- **Determinism.** Fix the fast-check seed in CI and record it on failure. Mock time zones and the clock for date libraries.
- **Report counterexamples.** When a property fails, show the shrunk counterexample in the test output and in the UI proof panel.
- Default to `numRuns: 200` for pin tests and `100` for internal properties.
