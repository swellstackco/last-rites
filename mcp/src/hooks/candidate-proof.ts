import { nodeEntryEnv, nodeToolDeps, runHook } from "./entry.js";
import { runCandidateProof } from "./run-candidate-proof.js";

/** Directory next to the repository root that holds the checkouts of the migration targets. */
const SIBLING_DIR = "lastrites-work";

const env = nodeEntryEnv();
await runHook(env, "candidate-proof-on-save", async ({ stdin }) =>
  runCandidateProof({ tools: await nodeToolDeps(env.root), root: env.root, siblingDir: SIBLING_DIR }, stdin),
);
