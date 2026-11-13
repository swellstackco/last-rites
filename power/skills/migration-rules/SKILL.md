---
name: migration-rules
description: Use when replacing a dead npm package with a living one. Tests first, pin real call sites only, the old package is the oracle, smallest diff.
---

# Migration rules (exorcising a dead package)

1. **Tests first.** Write the pin tests and run them green against the OLD package before touching any import.
2. **Never change public behavior.** The migration changes which package is used, not what the code returns, throws or logs.
3. **Pin real call sites only.** Pin tests come from the actual usage surface in this repo (imports + call arguments), not from the package's full API.
4. **The old package is the oracle.** For each pinned call, the property is `new(args) deep-equals old(args)` over generated inputs shaped like the real arguments.
5. **Smallest diff.** Replace imports and call sites; do not refactor neighboring code in the same change.
6. **If a property fails after migrating, stop.** Record the shrunk counterexample in `docs/kiro-log.md`, then fix the migration (an adapter shim is fine). Never weaken the test.
7. **Done means:** old ✅, new ✅, sabotage check ✅ (see proof-rules.md), typecheck ✅.
