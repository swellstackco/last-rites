import type { SignalName, SignalValue, WeightConfig } from "./types.js";

/** Clamp a number to the inclusive range [min, max]. */
function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/**
 * Compute a per-signal severity factor in [0, 1].
 *
 * 0 = fully alive for that signal, 1 = fully dead.
 * Unknown signals return `config.unknownFactor` (always > 0, so unknown is
 * never treated as the most-alive value).
 *
 * Per the design severity table:
 *
 * | Signal                     | known, alive (f=0) | known, dead (f=1) | mapping                          |
 * |----------------------------|---------------------|--------------------|----------------------------------|
 * | deprecated                 | false               | true               | boolean                          |
 * | repoArchived               | false               | true               | boolean                          |
 * | monthsSinceLastPublish     | 0 months            | >= fullDead        | clamp(months / fullDead, 0, 1)   |
 * | monthsSinceLastCommit      | 0 months            | >= fullDead        | clamp(months / fullDead, 0, 1)   |
 * | maintainerCount            | >= fullAlive        | 0                  | count<=0?1:clamp(1-n/fullAlive)  |
 * | openVulnsNoFix             | 0                   | >= fullDead        | clamp(count / fullDead, 0, 1)     |
 * | knownReplacementExists     | false               | true               | boolean (presence = death)       |
 */
export function severityFactor(
  signal: SignalName,
  value: SignalValue<boolean> | SignalValue<number>,
  config: WeightConfig,
): number {
  if (value.kind === "unknown") {
    return config.unknownFactor;
  }

  switch (signal) {
    case "deprecated":
    case "repoArchived":
    case "knownReplacementExists":
      // Boolean death signals: true = fully dead, false = fully alive.
      return value.value ? 1 : 0;

    case "monthsSinceLastPublish": {
      // Negative months clamped to 0 before mapping (Error Handling).
      const months = Math.max(0, value.value as number);
      return clamp(months / config.monthsSinceLastPublishFullDead, 0, 1);
    }

    case "monthsSinceLastCommit": {
      const months = Math.max(0, value.value as number);
      return clamp(months / config.monthsSinceLastCommitFullDead, 0, 1);
    }

    case "maintainerCount": {
      const count = value.value as number;
      // Fewer maintainers = deader. Zero (or negative) maintainers = fully dead.
      if (count <= 0) return 1;
      return clamp(1 - count / config.maintainerCountFullAlive, 0, 1);
    }

    case "openVulnsNoFix": {
      const count = Math.max(0, value.value as number);
      return clamp(count / config.openVulnsFullDead, 0, 1);
    }
  }
}
