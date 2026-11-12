# Kiro build log

Dated notes on how Kiro was used to build this project: which surface (IDE, CLI, Web, Crew), which feature (spec, steering, hook, agent, MCP, power), what worked, what didn't, and every bug property-based testing caught (with the shrunk counterexample).

## 2026-11-13
- Repo created. Steering written first: `product.md`, `tech.md`, `structure.md` (always included), `migration-rules.md` and `proof-rules.md` (file-matched).
- Next: first spec in the Kiro IDE: `death-score`, with correctness properties.
- death-score spec refined in Kiro IDE Spec mode (requirements detailing pass, ~23 credits, 38 min). Kiro flagged one judgment call: `knownReplacementExists` counts as a death signal. Kept: a listing in e18e `module-replacements` means the ecosystem has already moved on, which is the product's core claim. Lightly weighted.
- Kiro CLI 3.2.1 installed so spec tasks can also be run headless (`kiro-cli chat --no-interactive`).
