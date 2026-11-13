import { createHash } from "node:crypto";
import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { Sabotage } from "../sabotage-runner.js";
import { realStage, type StageFactory } from "../stage-harness.js";
import type { EvidenceResult } from "../../types.js";

export const P11_SABOTAGES: ReadonlyArray<Sabotage<StageFactory>> = [
  {
    name: "token in the cache key",
    impl: (config, deps) => {
      const stage = realStage(config, deps);
      return async (input) => {
        const r = await stage(input);
        // Cache files end up keyed by (token + original key): the key now depends on the token.
        const dir = join(config.cacheRoot, ".cache");
        for (const f of readdirSync(dir)) {
          const key = createHash("sha256").update(`${config.githubToken ?? ""}${f}`).digest("hex");
          renameSync(join(dir, f), join(dir, `${key}.json`));
        }
        return r;
      };
    },
  },
  {
    name: "token sent to every host",
    impl: (config, deps) =>
      realStage(config, {
        ...deps,
        http: {
          request: (req) =>
            deps.http.request(config.githubToken ? { ...req, headers: { ...req.headers, authorization: `Bearer ${config.githubToken}` } } : req),
        },
      }),
  },
  {
    name: "failure message includes request headers",
    impl: (config, deps) => {
      const seen: string[] = [];
      const stage = realStage(config, {
        ...deps,
        http: {
          request: (req) => {
            seen.push(JSON.stringify(req.headers ?? {}));
            return deps.http.request(req);
          },
        },
      });
      return async (input) => {
        const r = await stage(input);
        const unknownReasons = Object.fromEntries(
          Object.entries(r.unknownReasons).map(([k, v]) => [k, v && { ...v, message: `${v.message} headers=${seen.join(",")}` }]),
        ) as EvidenceResult["unknownReasons"];
        return { ...r, unknownReasons };
      };
    },
  },
];
