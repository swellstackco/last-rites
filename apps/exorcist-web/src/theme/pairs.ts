// Pair_Registry: every text/background and boundary/background pair the Stylesheet uses.
// Test-support only (no DOM). A new color combination in a stylesheet needs a row here first.
import { contrastRatio, parseHex } from "./contrast.js";

export type TokenName = `--${string}`;

export interface ColorPair {
  id: string;
  fg: TokenName;
  bg: TokenName;
  /** 4.5 for text, 3 for component edges, the focus ring and non-text accents. */
  min: 3 | 4.5;
  use: string;
}

const TEXT_ON_GROUNDS: readonly (readonly [string, TokenName, readonly (readonly [string, TokenName])[]])[] = [
  ["body", "--ink", [["wall", "--wall"], ["tag", "--tag"], ["paper", "--paper"], ["grid", "--paper-grid"], ["hot", "--paper-hot"]]],
  ["soft", "--ink-soft", [["wall", "--wall"], ["tag", "--tag"], ["paper", "--paper"], ["grid", "--paper-grid"]]],
  ["link", "--steel-ink", [["wall", "--wall"], ["tag", "--tag"], ["paper", "--paper"], ["grid", "--paper-grid"], ["hot", "--paper-hot"]]],
  ["err", "--red-ink", [["wall", "--wall"], ["tag", "--tag"], ["paper", "--paper"], ["grid", "--paper-grid"], ["hot", "--paper-hot"]]],
];

const textRows: ColorPair[] = TEXT_ON_GROUNDS.flatMap(([name, fg, grounds]) =>
  grounds.map(([g, bg]): ColorPair => ({ id: `${name}-${g}`, fg, bg, min: 4.5, use: `${fg} text on ${bg}` })),
);

export const PAIRS: readonly ColorPair[] = [
  ...textRows,
  { id: "bar-paper", fg: "--paper", bg: "--ink", min: 4.5, use: "caption bars, primary buttons" },
  { id: "bar-tag", fg: "--tag", bg: "--ink", min: 4.5, use: "tag-colored text on a bar" },
  { id: "band-red", fg: "--on-band", bg: "--red", min: 4.5, use: "DEAD band" },
  { id: "band-rust", fg: "--on-band", bg: "--rust", min: 4.5, use: "DYING band" },
  { id: "band-steel", fg: "--on-band", bg: "--steel", min: 4.5, use: "ALIVE band" },
  { id: "band-amber", fg: "--ink", bg: "--amber", min: 4.5, use: "AILING band (Ink, never white)" },
  { id: "edge-wall", fg: "--ink", bg: "--wall", min: 3, use: "component edge on the Wall" },
  { id: "edge-paper", fg: "--ink", bg: "--paper", min: 3, use: "component edge on Paper" },
  { id: "edge-tag", fg: "--ink", bg: "--tag", min: 3, use: "component edge on Manila" },
  { id: "ring-wall", fg: "--focus", bg: "--wall", min: 3, use: "focus ring on the Wall" },
  { id: "ring-tag", fg: "--focus", bg: "--tag", min: 3, use: "focus ring on Manila" },
  { id: "ring-paper", fg: "--focus", bg: "--paper", min: 3, use: "focus ring on Paper" },
  { id: "large-red", fg: "--red", bg: "--paper", min: 3, use: "Stamp border and heavy rules only (non-text)" },
];

/** Color tokens that are decorative and need no pair. */
export const DECORATIVE_TOKENS: readonly string[] = ["--wall-rule", "--scrim"];

/**
 * The surface a color-only rule sits on, by selector, when the rule itself sets no background.
 * Rules not listed here are checked for a registered text color only.
 */
export const SURFACES: Readonly<Record<string, TokenName>> = {
  "body": "--wall",
  "a": "--wall",
  ".muted": "--wall",
  ".wordmark": "--wall",
  ".form-subtitle": "--wall",
  ".meta": "--wall",
  ".legend, .warnings, .note": "--wall",
  ".breakdown a": "--paper",
  ".mismatch td": "--paper",
  ".field-error": "--paper",
  ".proof .muted": "--paper",
  ".proof-badge-proved": "--paper",
  ".proof-badge-weak": "--paper",
  ".proof-badge-counterexample, .proof-badge-error": "--paper",
  ".proof-badge-no_call_sites": "--paper",
};

export function tokenValue(tokens: ReadonlyMap<string, string>, name: string): string {
  const v = tokens.get(name);
  if (v === undefined) throw new Error(`missing token ${name}`);
  return v;
}

export function pairRatio(tokens: ReadonlyMap<string, string>, p: ColorPair): number {
  return contrastRatio(parseHex(tokenValue(tokens, p.fg)), parseHex(tokenValue(tokens, p.bg)));
}

export const hasPair = (fg: string, bg: string): boolean => PAIRS.some((p) => p.fg === fg && p.bg === bg);
export const isRegisteredFg = (fg: string): boolean => PAIRS.some((p) => p.fg === fg);
