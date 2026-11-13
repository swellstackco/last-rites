import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Sabotage } from "../sabotage-runner.js";
import type { KeyPathFn } from "../properties/cache.js";

function keyed(text: (r: Parameters<KeyPathFn>[1]) => string): KeyPathFn {
  return (root, req) => join(root, ".cache", `${createHash("sha256").update(text(req)).digest("hex")}.json`);
}

export const P9_SABOTAGES: ReadonlyArray<Sabotage<KeyPathFn>> = [
  {
    name: "key includes request headers",
    impl: keyed((r) => `${r.method}\n${r.url}\n${r.body ?? ""}\n${JSON.stringify(r.headers ?? {})}`),
  },
  { name: "key ignores the body", impl: keyed((r) => `${r.method}\n${r.url}`) },
  { name: "key ignores the method", impl: keyed((r) => `${r.url}\n${r.body ?? ""}`) },
];
