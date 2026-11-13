import fc from "fast-check";
import type { NamedProperty } from "../../../evidence/test-support/sabotage-runner.js";
import type { ReportCodec } from "../../report.js";
import type { ScanReport } from "../../types.js";
import { reportArb } from "../arbitraries/report.js";

export type { ReportCodec };

/** Rebuild every object with its keys in a different order (rotate, and reverse on odd seeds). */
export function shuffleKeys<T>(value: T, seed: number): T {
  if (Array.isArray(value)) return value.map((v) => shuffleKeys(v, seed + 1)) as unknown as T;
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    const n = keys.length;
    const rotated = n === 0 ? keys : keys.map((_, i) => keys[(i + (seed % n)) % n]!);
    if (seed % 2 === 1) rotated.reverse();
    const out: Record<string, unknown> = {};
    for (const k of rotated) out[k] = shuffleKeys((value as Record<string, unknown>)[k], seed + 1);
    return out as T;
  }
  return value;
}

/** Key-order-insensitive structural equality. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );
}

const MUTATIONS = [
  "empty",
  "whitespace",
  "truncated",
  "no_trailing_newline",
  "extra_trailing_newline",
  "four_space_indent",
  "swap_top_level_keys",
  "delete_field",
  "wrong_type",
  "unknown_key",
] as const;
type Mutation = (typeof MUTATIONS)[number];

const TOP_KEYS = ["repo", "ref", "scannedAt", "dependencies", "skipped", "warnings", "summary"];

function mutate(text: string, m: Mutation, n: number): string {
  const obj = () => JSON.parse(text) as Record<string, unknown>;
  const out = (o: unknown) => JSON.stringify(o, null, 2) + "\n";
  switch (m) {
    case "empty":
      return "";
    case "whitespace":
      return " \n\t ";
    case "truncated":
      return text.slice(0, n % (text.length - 1));
    case "no_trailing_newline":
      return text.slice(0, -1);
    case "extra_trailing_newline":
      return text + "\n";
    case "four_space_indent":
      return text.replace(/^( +)/gm, (s) => s + s);
    case "swap_top_level_keys": {
      const o = obj();
      const { repo, ref, ...rest } = o;
      return out({ ref, repo, ...rest });
    }
    case "delete_field": {
      const o = obj();
      delete o[TOP_KEYS[n % TOP_KEYS.length]!];
      return out(o);
    }
    case "wrong_type": {
      const o = obj();
      o[TOP_KEYS[n % TOP_KEYS.length]!] = 5;
      return out(o);
    }
    case "unknown_key":
      return out({ ...obj(), extra: 1 });
  }
}

/** Property 6: Canonical_Json round trip and strictness. */
export const property6: NamedProperty<ReportCodec> = {
  name: "Property 6: Canonical_Json round trip and strictness",
  build: (codec) =>
    fc.property(
      reportArb,
      fc.nat({ max: 1000 }),
      fc.constantFrom(...MUTATIONS),
      fc.nat({ max: 100000 }),
      (r: ScanReport, shuffleSeed, mutation, pos) => {
        const text = codec.serialize(r);

        const parsed = codec.parse(text);
        if (!parsed.ok) throw new Error(`valid text rejected: ${parsed.error.category} ${parsed.error.message}`);
        if (canon(parsed.report) !== canon(r)) throw new Error("parsed report differs from the original");
        if (codec.serialize(parsed.report) !== text) throw new Error("serialize(parse(text)) !== text");

        if (!text.endsWith("\n") || text.endsWith("\n\n")) throw new Error("must end in exactly one newline");
        if (!/^ {2}"repo"/m.test(text)) throw new Error("expected two-space indentation");

        if (codec.serialize(shuffleKeys(r, shuffleSeed)) !== text) throw new Error("output depends on input key order");

        const bad = mutate(text, mutation, pos);
        let result;
        try {
          result = codec.parse(bad);
        } catch (e) {
          throw new Error(`parse threw on mutation ${mutation}: ${String(e)}`);
        }
        if (result.ok) throw new Error(`mutation ${mutation} accepted`);
        if (!result.error.category) throw new Error("no category");
      },
    ),
};
