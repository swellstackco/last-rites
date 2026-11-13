import type { EvidenceResult } from "../../types.js";
import type { StageFactory } from "../stage-harness.js";
import type { EvidenceInput } from "../../types.js";
import { realStage } from "../stage-harness.js";

/** A sabotage is a wrapper over the real stage that post-processes (or pre-processes) it. */
export function wrapStage(
  post: (r: EvidenceResult, input: EvidenceInput) => EvidenceResult,
  pre: (input: EvidenceInput) => EvidenceInput = (i) => i,
): StageFactory {
  return (config, deps) => {
    const stage = realStage(config, deps);
    return async (input) => post(await stage(pre(input)), input);
  };
}
