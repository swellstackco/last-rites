import type { SignalName } from "../death-score/index.js";

export const SIGNAL_INFO: Record<SignalName, { label: string; explanation: string }> = {
  deprecated: {
    label: "Deprecated on npm",
    explanation: "The maintainers marked this package deprecated, which usually means it will not get fixes.",
  },
  repoArchived: {
    label: "Repository archived",
    explanation: "An archived repository is read-only, so no one can land fixes or review changes there.",
  },
  monthsSinceLastPublish: {
    label: "Months since last publish",
    explanation: "A long gap since the last release suggests no one is shipping fixes to users.",
  },
  monthsSinceLastCommit: {
    label: "Months since last commit",
    explanation: "A long gap since the last commit suggests development has stopped.",
  },
  maintainerCount: {
    label: "Maintainers",
    explanation: "Few maintainers means little review and a single point of failure if they leave.",
  },
  openVulnsNoFix: {
    label: "Open vulnerabilities without a fix",
    explanation: "Known security problems with no patched version stay in your code until you move off.",
  },
  knownReplacementExists: {
    label: "Known replacement exists",
    explanation: "A maintained replacement or native feature exists, so moving off this package is possible.",
  },
};

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Human display of a part's raw value. Unknown always shows as "unknown". */
export function formatRawValue(signal: SignalName, rawValue: string, status: "known" | "unknown"): string {
  if (status === "unknown") return "unknown";
  switch (signal) {
    case "deprecated":
    case "repoArchived":
    case "knownReplacementExists":
      if (rawValue === "true") return "yes";
      if (rawValue === "false") return "no";
      return rawValue;
    case "monthsSinceLastPublish":
    case "monthsSinceLastCommit": {
      const n = Number(rawValue);
      return Number.isFinite(n) ? `${rawValue} ${plural(n, "month", "months")}` : rawValue;
    }
    case "maintainerCount": {
      const n = Number(rawValue);
      return Number.isFinite(n) ? `${rawValue} ${plural(n, "maintainer", "maintainers")}` : rawValue;
    }
    case "openVulnsNoFix": {
      const n = Number(rawValue);
      return Number.isFinite(n)
        ? `${rawValue} open ${plural(n, "vulnerability", "vulnerabilities")} without a fix`
        : rawValue;
    }
  }
}
