import { SIGNAL_NAMES } from "@last-rites/skeleton";
import type { Sabotage } from "../sabotage-runner.js";
import { sourceOfUrl, realStage, type SourceName, type StageFactory } from "../stage-harness.js";
import type { EvidenceResult } from "../../types.js";
import { wrapStage } from "./stage-wrap.js";

export const P5_SABOTAGES: ReadonlyArray<Sabotage<StageFactory>> = [
  {
    name: "reads new Date() instead of the injected now",
    impl: wrapStage((r) => r, (input) => ({ ...input, now: new Date() })),
  },
  {
    name: "random jitter in a reason message",
    impl: wrapStage((r) => {
      const unknownReasons = Object.fromEntries(
        Object.entries(r.unknownReasons).map(([k, v]) => [k, v && { ...v, message: `${v.message} #${Math.random()}` }]),
      ) as EvidenceResult["unknownReasons"];
      return { ...r, unknownReasons };
    }),
  },
  {
    name: "unknownReasons built in completion order",
    impl: (config, deps) => {
      const order: SourceName[] = [];
      const http = {
        async request(req: Parameters<typeof deps.http.request>[0]) {
          try {
            return await deps.http.request(req);
          } finally {
            const s = sourceOfUrl(req.url);
            if (s && !order.includes(s)) order.push(s);
          }
        },
      };
      const stage = realStage(config, { ...deps, http });
      return async (input) => {
        const r = await stage(input);
        const rank = (s: string) => {
          const i = order.indexOf(s as SourceName);
          return i < 0 ? 99 : i;
        };
        const entries = Object.entries(r.unknownReasons).sort(
          ([a, ra], [b, rb]) =>
            rank(ra?.source ?? "") - rank(rb?.source ?? "") ||
            SIGNAL_NAMES.indexOf(a as (typeof SIGNAL_NAMES)[number]) - SIGNAL_NAMES.indexOf(b as (typeof SIGNAL_NAMES)[number]),
        );
        return { ...r, unknownReasons: Object.fromEntries(entries) as EvidenceResult["unknownReasons"] };
      };
    },
  },
];
