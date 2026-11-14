import type { Sabotage } from "@last-rites/skeleton/graveyard/testing";
import { REAL_CODEC } from "../properties/p6.js";
import type { RouteCodec } from "../properties/p6.js";

const real = REAL_CODEC;

const slashNotEncoded: RouteCodec = {
  ...real,
  formatRoute: (r) => real.formatRoute(r).replaceAll("%2F", "/"),
};

const ampersandNotEncoded: RouteCodec = {
  ...real,
  formatRoute: (r) => real.formatRoute(r).replaceAll("%26", "&"),
};

const refDropped: RouteCodec = {
  ...real,
  formatRoute: (r) => {
    if (r.view !== "live") return real.formatRoute(r);
    const { ref: _ref, ...rest } = r;
    return real.formatRoute(rest);
  },
};

const repoLowerCased: RouteCodec = {
  ...real,
  parseRoute: (h) => {
    const r = real.parseRoute(h);
    return r.view === "live" ? { ...r, repo: r.repo.toLowerCase() } : r;
  },
};

const decodeErrorsThrown: RouteCodec = {
  ...real,
  parseRoute: (h) => {
    const q = h.indexOf("?");
    if (q !== -1) decodeURIComponent(h.slice(q + 1));
    return real.parseRoute(h);
  },
};

const plusDecodedAsSpace: RouteCodec = {
  ...real,
  parseRoute: (h) => {
    const r = real.parseRoute(h);
    return r.view !== "picker" && r.pkg !== undefined ? { ...r, pkg: r.pkg.replaceAll("+", " ") } : r;
  },
};

export const P6_SABOTAGES: readonly Sabotage<RouteCodec>[] = [
  { name: "slash not encoded in pkg", impl: slashNotEncoded },
  { name: "ampersand not encoded", impl: ampersandNotEncoded },
  { name: "ref dropped on format", impl: refDropped },
  { name: "repo lower-cased on parse", impl: repoLowerCased },
  { name: "decode errors thrown", impl: decodeErrorsThrown },
  { name: "plus decoded as space", impl: plusDecodedAsSpace },
];
