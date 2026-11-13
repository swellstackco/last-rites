import type { Sabotage } from "../sabotage-runner.js";
import type { ParseRepoUrlFn } from "../properties/repo-url.js";
import { makeParser } from "./p1.js";

export const P2_SABOTAGES: ReadonlyArray<Sabotage<ParseRepoUrlFn>> = [
  { name: "accepts any host", impl: makeParser({ anyHost: true }) },
  { name: "accepts a repo over 100 characters", impl: makeParser({ maxRepoLength: Number.MAX_SAFE_INTEGER }) },
  { name: "throws on non-string input", impl: makeParser({ throwOnNonString: true }) },
];
