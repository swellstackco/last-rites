# Requirements Document

## Introduction

The Death_Score_Engine is a pure TypeScript module in the `/skeleton` package of the graveyard-kit monorepo. It scores how "dead" an open-source package is on a scale from 0 (alive) to 100 (dead), using signals an Adapter supplies: deprecated flag, repo archived, months since last publish, months since last commit, maintainer count, open vulnerabilities with no fix, and whether a known replacement exists. The engine is deterministic, makes no network calls, and returns a transparent breakdown so the graveyard UI can show why a package is dead. It is reusable across adapters (npm, GitHub Actions, and others) and is the scoring component of the skeleton's four-stage adapter interface (inventory, evidence, replacement, proof).

## Glossary

- **Death_Score_Engine**: the pure TypeScript module in `/skeleton` that computes a Death_Score from Package_Signals.
- **Adapter**: a package implementing the skeleton adapter interface; it collects Package_Signals from data sources such as the npm registry, the GitHub REST API, OSV.dev, and deps.dev.
- **Signal**: one named measurement about a package: `deprecated`, `repoArchived`, `monthsSinceLastPublish`, `monthsSinceLastCommit`, `maintainerCount`, `openVulnsNoFix`, or `knownReplacementExists`.
- **Package_Signals**: the structured set of Signals about one package supplied by an Adapter; each Signal is either known or unknown.
- **Signal_Value**: the raw value of a Signal, which is either known (a concrete value) or unknown (missing).
- **Weight_Config**: the configurable set of weights and thresholds that control how much each Signal contributes to the Death_Score.
- **Signal_Part**: one entry in the score breakdown: signal name, raw value, weight, points, status (known or unknown), and source URL.
- **Death_Score**: the total score, an integer from 0 to 100, equal to the sum of all Signal_Part points.
- **Grade_Band**: the classification of a Death_Score: alive, ailing, dying, or dead.
- **Death_Direction**: for a Signal, the direction of increasing deadness (for example, more months since last publish, fewer maintainers, or `deprecated` equal to true).

## Requirements

### Requirement 1: Compute a bounded death score

**User Story:** As a developer, I want a single 0-to-100 score that summarizes how dead a package is, so that I can rank packages and decide what to exorcise first.

#### Acceptance Criteria

1. WHEN Package_Signals are provided, THE Death_Score_Engine SHALL compute a Death_Score.
2. WHEN Package_Signals are provided, THE Death_Score_Engine SHALL produce a Death_Score greater than or equal to 0 and less than or equal to 100.
3. WHILE Package_Signals are present, WHEN a Weight_Config is provided, THE Death_Score_Engine SHALL produce a Death_Score greater than or equal to 0 and less than or equal to 100.
4. IF Package_Signals are missing or empty, THEN THE Death_Score_Engine SHALL produce an error indicating that Package_Signals are required.

### Requirement 2: Transparent score breakdown

**User Story:** As a developer, I want to see why a package is dead, so that I can trust the score and show evidence in the graveyard UI.

#### Acceptance Criteria

1. WHEN the Death_Score is computed for a Package, THE Death_Score_Engine SHALL return one Signal_Part for each Signal evaluated for that Package.
2. THE Death_Score_Engine SHALL include in each Signal_Part the signal name, the raw value, the weight, the points contributed, a status of "known" when the signal's source data is retrievable and "unknown" when the signal's source data is not retrievable, and the source URL when the status is "known" or an indication that no source URL is available when the status is "unknown".
3. WHEN the Death_Score is computed for a Package, THE Death_Score_Engine SHALL ensure the sum of all Signal_Part points for all Package_Signals equals the Death_Score within a tolerance of 0.01.

### Requirement 3: Configurable weights with defaults

**User Story:** As a kit maintainer, I want to tune how much each Signal matters, so that different ecosystems can weight Signals appropriately.

#### Acceptance Criteria

1. THE Death_Score_Engine SHALL load default weights from a single Weight_Config file.
2. WHERE a Weight_Config is supplied, THE Death_Score_Engine SHALL use that Weight_Config instead of the defaults.
3. WHILE Package_Signals are present, WHEN a Weight_Config is provided, THE Death_Score_Engine SHALL produce a Death_Score greater than or equal to 0 and less than or equal to 100.
4. IF a Weight_Config contains a negative weight value, THEN THE Death_Score_Engine SHALL treat that weight as 0 before normalization.

### Requirement 4: Missing Signals are unknown, not alive

**User Story:** As a developer, I want missing evidence to count against a package, so that a package with no data is never silently marked healthy.

#### Acceptance Criteria

1. IF no data is available for a Signal, THEN THE Death_Score_Engine SHALL mark that Signal as unknown.
2. IF a Signal is unknown, THEN THE Death_Score_Engine SHALL mark the status of the Signal_Part associated with that Signal as unknown.
3. THE Death_Score_Engine SHALL ensure that setting a Signal to unknown yields a Death_Score greater than or equal to setting the same Signal to the Signal value that indicates maximum liveness, with all other Signals held equal.

### Requirement 5: Grade bands

**User Story:** As a developer, I want a human-readable grade, so that the graveyard UI can label packages at a glance.

#### Acceptance Criteria

1. THE Death_Score_Engine SHALL map a Death_Score greater than or equal to 0 and less than or equal to 24 to the alive Grade_Band.
2. THE Death_Score_Engine SHALL map a Death_Score greater than or equal to 25 and less than or equal to 49 to the ailing Grade_Band.
3. THE Death_Score_Engine SHALL map a Death_Score greater than or equal to 50 and less than or equal to 74 to the dying Grade_Band.
4. THE Death_Score_Engine SHALL map a Death_Score greater than or equal to 75 and less than or equal to 100 to the dead Grade_Band.

### Requirement 6: Deterministic, pure, no network

**User Story:** As a developer, I want reproducible scores, so that tests are stable and CI is deterministic.

#### Acceptance Criteria

1. THE Death_Score_Engine SHALL perform no network access.
2. WHEN the Death_Score_Engine is invoked more than once with the same Package_Signals and the same Weight_Config, THE Death_Score_Engine SHALL return an identical Death_Score on each invocation.
3. THE Death_Score_Engine SHALL produce a Death_Score that is independent of external mutable state, including system time and random values.

### Requirement 7: Monotonic in the death direction

**User Story:** As a developer, I want worse Signals to never look healthier, so that the score is trustworthy and never contradicts the evidence.

#### Acceptance Criteria

1. FOR ALL pairs of Package_Signals where all Signals are known and one is at least as dead as the other on every Signal in the Death_Direction, and FOR ALL Weight_Config values, THE Death_Score_Engine SHALL produce a Death_Score for the deader Package_Signals that is greater than or equal to the Death_Score for the less-dead Package_Signals.

### Requirement 8: Evidence source links

**User Story:** As a developer, I want a link to the source of each Signal, so that I can verify the evidence behind a death score.

#### Acceptance Criteria

1. WHERE a source URL is supplied for a Signal, THE Death_Score_Engine SHALL include that source URL unchanged in the corresponding Signal_Part.
2. IF no source URL is supplied for a Signal or the supplied source URL is an empty string or not a valid URL format, THEN THE Death_Score_Engine SHALL omit the source URL from that Signal_Part.

### Requirement 9: Property-based test coverage

**User Story:** As a kit maintainer, I want the engine verified by property-based tests, so that I can trust it across all inputs rather than only worked examples.

#### Acceptance Criteria

1. THE Death_Score_Engine SHALL be covered by property-based tests for the bounded, transparent, deterministic, unknown-not-alive, and monotonic correctness properties, with each property-based test running at least 100 generated cases.
2. THE Death_Score_Engine test suite SHALL include a sabotage check for each of the bounded, transparent, deterministic, unknown-not-alive, and monotonic correctness properties.
3. IF a sabotage check runs the property-based test for a property against an implementation that violates that property, THEN THE Death_Score_Engine test suite SHALL report a test failure.
