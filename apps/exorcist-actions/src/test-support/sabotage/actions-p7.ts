import { SIGNAL_NAMES } from "@last-rites/skeleton";
import type { SignalName } from "@last-rites/skeleton";
import { monthsSince } from "@last-rites/exorcist-npm/programmatic";
import { assembleActionEvidence } from "../../evidence/assemble.js";
import type { ActionEvidenceAssembleInput, EvidenceResult } from "../../evidence/assemble.js";
import { createActionEvidenceStage } from "../../evidence/stage.js";
import { rawManifestUrl } from "../../evidence/urls.js";
import type { EvidenceImpl } from "../properties/actions-p7.js";
import type { Sabotage } from "../sabotage-runner.js";

const real: EvidenceImpl = { assemble: assembleActionEvidence, makeStage: createActionEvidenceStage };

type SignalEdit = (signals: Record<string, unknown>, reasons: Record<string, unknown>, urls: Record<string, string>) => void;

/** Runs the real assembly, then applies one deliberate defect to a copy of the result. */
const withDefect =
  (when: (i: ActionEvidenceAssembleInput) => boolean, edit: SignalEdit) =>
  (i: ActionEvidenceAssembleInput): EvidenceResult => {
    const r = assembleActionEvidence(i);
    if (!when(i)) return r;
    const copy = structuredClone(r);
    edit(copy.signals as unknown as Record<string, unknown>, copy.unknownReasons as Record<string, unknown>, (copy.signals.sourceUrls ??= {}) as Record<string, string>);
    return copy;
  };

const knownValue = (signal: SignalName, value: boolean | number): SignalEdit => (s, reasons, urls) => {
  s[signal] = { kind: "known", value };
  delete reasons[signal];
  urls[signal] = "https://example.test/x";
};

/** (g) a future timestamp gives a negative month count. */
const unclamped = (i: ActionEvidenceAssembleInput): EvidenceResult => {
  const r = assembleActionEvidence(i);
  const copy = structuredClone(r);
  const fix = (signal: "monthsSinceLastPublish" | "monthsSinceLastCommit", ts: string | undefined): void => {
    if (ts === undefined || copy.signals[signal].kind !== "known") return;
    const t = new Date(ts).getTime();
    if (Number.isNaN(t) || t <= i.now.getTime()) return;
    const raw = -Math.max(1, (monthsSince(new Date(i.now.getTime() - (t - i.now.getTime())).toISOString(), i.now) ?? 1));
    copy.signals[signal] = { kind: "known", value: raw };
  };
  fix("monthsSinceLastPublish", i.publish?.ok ? i.publish.value.timestamp : undefined);
  fix("monthsSinceLastCommit", i.github?.ok && i.github.value.lastCommit.ok ? i.github.value.lastCommit.value : undefined);
  return copy;
};

/** (h) a source URL on an unknown signal. */
const urlOnUnknown = (i: ActionEvidenceAssembleInput): EvidenceResult => {
  const copy = structuredClone(assembleActionEvidence(i));
  const s = SIGNAL_NAMES.find((n) => copy.signals[n].kind === "unknown");
  if (s !== undefined) (copy.signals.sourceUrls ??= {})[s] = "https://example.test/unknown";
  return copy;
};

/** (e) an unknown reason for a known signal. */
const reasonOnKnown = (i: ActionEvidenceAssembleInput): EvidenceResult => {
  const copy = structuredClone(assembleActionEvidence(i));
  const s = SIGNAL_NAMES.find((n) => copy.signals[n].kind === "known");
  if (s !== undefined) copy.unknownReasons[s] = { source: "github", category: "network_error", message: "github: network_error" };
  return copy;
};

/** (i) a stage that requests action.yml for a Site `job` use as well. */
const jobRequestsManifest: EvidenceImpl["makeStage"] = (config, deps) => {
  const inner = createActionEvidenceStage(config, deps);
  return async (input) => {
    if (input.site === "job") {
      await deps.http
        .request({ method: "GET", url: rawManifestUrl(input.name, input.ref, input.path, "action.yml"), timeoutMs: 1000 })
        .catch(() => undefined);
    }
    return inner(input);
  };
};

export const sabotages: Sabotage<EvidenceImpl>[] = [
  {
    name: "(a) a failed OSV source yields openVulnsNoFix known 0",
    impl: { ...real, assemble: withDefect((i) => i.osv?.ok === false, knownValue("openVulnsNoFix", 0)) },
  },
  {
    name: "(b) a failed GitHub source yields repoArchived known false",
    impl: { ...real, assemble: withDefect((i) => i.github?.ok === false, knownValue("repoArchived", false)) },
  },
  {
    name: "(c) no release and no tag yields monthsSinceLastPublish known 0",
    impl: { ...real, assemble: withDefect((i) => i.publish?.ok === false && i.publish.reason.category === "not_found", knownValue("monthsSinceLastPublish", 0)) },
  },
  {
    name: "(d) a failed manifest fetch yields deprecated known false",
    impl: { ...real, assemble: withDefect((i) => i.site === "step" && i.manifest?.ok === false, knownValue("deprecated", false)) },
  },
  { name: "(e) add an unknown reason for a known signal", impl: { ...real, assemble: reasonOnKnown } },
  { name: "(f) maintainerCount known 1", impl: { ...real, assemble: withDefect(() => true, knownValue("maintainerCount", 1)) } },
  { name: "(g) months not clamped at 0 for a future timestamp", impl: { ...real, assemble: unclamped } },
  { name: "(h) a source URL on an unknown signal", impl: { ...real, assemble: urlOnUnknown } },
  { name: "(i) a Site job use requests action.yml", impl: { ...real, makeStage: jobRequestsManifest } },
];
