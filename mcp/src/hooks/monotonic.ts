import { nodeEntryEnv, nodeProcessRunner, runHook } from "./entry.js";
import { runMonotonic } from "./run-monotonic.js";

const env = nodeEntryEnv();
await runHook(env, "death-score-monotonic-on-save", () => runMonotonic({ run: nodeProcessRunner(env.root) }));
