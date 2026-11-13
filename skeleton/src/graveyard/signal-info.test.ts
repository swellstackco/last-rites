import { describe, expect, it } from "vitest";
import { SIGNAL_NAMES } from "../death-score/index.js";
import { formatRawValue, SIGNAL_INFO } from "./signal-info.js";

describe("SIGNAL_INFO", () => {
  it("has a non-empty label and explanation for every signal", () => {
    for (const name of SIGNAL_NAMES) {
      expect(SIGNAL_INFO[name].label.length).toBeGreaterThan(0);
      expect(SIGNAL_INFO[name].explanation.length).toBeGreaterThan(0);
    }
  });
});

describe("formatRawValue", () => {
  it("formats booleans as yes/no", () => {
    expect(formatRawValue("deprecated", "true", "known")).toBe("yes");
    expect(formatRawValue("repoArchived", "false", "known")).toBe("no");
    expect(formatRawValue("knownReplacementExists", "true", "known")).toBe("yes");
  });
  it("adds units to numbers", () => {
    expect(formatRawValue("monthsSinceLastPublish", "43", "known")).toBe("43 months");
    expect(formatRawValue("monthsSinceLastCommit", "1", "known")).toBe("1 month");
    expect(formatRawValue("maintainerCount", "2", "known")).toBe("2 maintainers");
    expect(formatRawValue("maintainerCount", "1", "known")).toBe("1 maintainer");
    expect(formatRawValue("openVulnsNoFix", "3", "known")).toBe("3 open vulnerabilities without a fix");
    expect(formatRawValue("openVulnsNoFix", "1", "known")).toBe("1 open vulnerability without a fix");
  });
  it("shows unknown for every signal when unknown", () => {
    for (const name of SIGNAL_NAMES) {
      expect(formatRawValue(name, "unknown", "unknown")).toBe("unknown");
    }
  });
});
