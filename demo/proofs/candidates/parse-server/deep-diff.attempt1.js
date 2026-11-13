// Attempt 1: native replacement for `deep-diff@1.0.2`, for call sites that only ask
// "is the result undefined?". Written for this repository.
// Returns undefined when the values are deeply equal, otherwise a non-empty array.

import { isDeepStrictEqual } from "node:util";

function diff(a, b) {
  if (isDeepStrictEqual(a, b)) return undefined;
  return [{ kind: "N" }];
}

export default diff;
