import { nodeEntryEnv, nodeProcessRunner, runHook } from "./entry.js";
import { runStopCheck } from "./run-stop-check.js";

const env = nodeEntryEnv();
await runHook(env, "check-on-stop", () => runStopCheck({ run: nodeProcessRunner(env.root) }));
