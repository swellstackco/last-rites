import { SIGNAL_NAMES, type SignalName } from "@last-rites/skeleton";
import type { Sabotage } from "../sabotage-runner.js";
import type { StageFactory } from "../stage-harness.js";
import type { EvidenceResult } from "../../types.js";
import { wrapStage } from "./stage-wrap.js";

const failedNames = (r: EvidenceResult): SignalName[] =>
  SIGNAL_NAMES.filter((s) => r.unknownReasons[s] && r.unknownReasons[s]?.category !== "not_applicable");

const BOOL: ReadonlySet<SignalName> = new Set(["deprecated", "repoArchived", "knownReplacementExists"]);

export const P3_SABOTAGES: ReadonlyArray<Sabotage<StageFactory>> = [
  {
    name: "fail-fast: any failure makes all seven signals unknown",
    impl: wrapStage((r) => {
      const first = failedNames(r)[0];
      if (!first) return r;
      const reason = r.unknownReasons[first]!;
      return {
        ...r,
        signals: Object.fromEntries([...SIGNAL_NAMES.map((s) => [s, { kind: "unknown" }]), ["sourceUrls", {}]]) as unknown as EvidenceResult["signals"],
        unknownReasons: Object.fromEntries(SIGNAL_NAMES.map((s) => [s, reason])),
      };
    }),
  },
  {
    name: "failed-as-alive: a failed source's signals become known false / 0 with a URL",
    impl: wrapStage((r) => {
      const failed = failedNames(r);
      if (failed.length === 0) return r;
      const signals = { ...r.signals, sourceUrls: { ...r.signals.sourceUrls } } as Record<string, unknown>;
      const reasons = { ...r.unknownReasons };
      for (const s of failed) {
        signals[s] = { kind: "known", value: BOOL.has(s) ? false : 0 };
        (signals["sourceUrls"] as Record<string, string>)[s] = `https://example.test/${s}`;
        delete reasons[s];
      }
      return { ...r, signals: signals as unknown as EvidenceResult["signals"], unknownReasons: reasons };
    }),
  },
  {
    name: "npm failure also blanks knownReplacementExists",
    impl: wrapStage((r) => {
      const npmFailed = SIGNAL_NAMES.some((s) => r.unknownReasons[s]?.source === "npm");
      if (!npmFailed || r.signals.knownReplacementExists.kind === "unknown") return r;
      const urls = { ...r.signals.sourceUrls };
      delete urls.knownReplacementExists;
      const { replacement: _dropped, ...rest } = r;
      return {
        ...rest,
        signals: { ...r.signals, knownReplacementExists: { kind: "unknown" }, sourceUrls: urls },
        unknownReasons: { ...r.unknownReasons, knownReplacementExists: { source: "npm", category: "network_error", message: "npm: blanked" } },
      };
    }),
  },
  {
    name: "rethrows the first source failure",
    impl: wrapStage((r) => {
      const first = failedNames(r)[0];
      if (first) throw new Error(`source failed: ${r.unknownReasons[first]?.message}`);
      return r;
    }),
  },
];
