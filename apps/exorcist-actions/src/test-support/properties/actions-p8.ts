import fc from "fast-check";
import { inventoryText } from "../../inventory/inventory.js";
import type { ActionUse } from "../../inventory/types.js";
import { checkPin } from "../../proof/pin-check.js";
import type { PinCheck, PinCheckInput } from "../../proof/pin-check.js";
import { pinAll } from "../../rewrite/pin.js";
import { fileSpecArb, renderFile } from "../arbitraries/workflow.js";
import type { FileSpec } from "../arbitraries/workflow.js";
import type { NamedProperty } from "../sabotage-runner.js";
import { linesOf, shaArb } from "./actions-p3.js";

/** The seam under test (Property 8). */
export interface PinCheckImpl {
  checkPin(input: PinCheckInput): PinCheck;
}
export const realPinCheckImpl: PinCheckImpl = { checkPin };

const F1 = ".github/workflows/ci.yml";
const F2 = ".github/workflows/other.yml";
const keyOf = (u: ActionUse): string => `${u.owner}/${u.repo}@${u.ref}`;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const blockSpec = fileSpecArb.map((spec): FileSpec => ({
  ...spec,
  jobs: spec.jobs.map((j) => ({ ...j, steps: j.steps.map((s) => ({ ...s, flow: false })) })),
}));

export interface PinCase {
  originals: Map<string, string>;
  rewritten: Map<string, string>;
  pinned: ActionUse[];
  resolved: Map<string, string>;
  /** Every use of every file, in (file, line, column) order. */
  all: ActionUse[];
}

/** One or two block-style files; a non-empty subset of the mutable uses pinned by the real `pinAll`. */
export const pinCaseArb: fc.Arbitrary<PinCase | undefined> = fc
  .tuple(blockSpec, blockSpec, fc.boolean(), fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), fc.array(shaArb, { minLength: 1, maxLength: 4 }))
  .map(([s1, s2, two, mask, pool]) => {
    const models = [renderFile(s1, F1), ...(two ? [renderFile(s2, F2)] : [])];
    const files = [F1, F2].slice(0, models.length);
    const all = models.flatMap((m) => m.uses);
    const mutable = all.filter((u) => u.refKind === "mutable");
    if (mutable.length === 0) return undefined;
    let chosen = mutable.filter((_, i) => mask[i % mask.length]);
    if (chosen.length === 0) chosen = [mutable[0]!];
    const resolved = new Map<string, string>();
    for (const u of mutable) if (!resolved.has(keyOf(u))) resolved.set(keyOf(u), pool[resolved.size % pool.length]!);
    const originals = new Map<string, string>();
    const rewritten = new Map<string, string>();
    models.forEach((m, i) => {
      const file = files[i]!;
      originals.set(file, m.text);
      const mine = chosen.filter((u) => u.file === file);
      const r = pinAll(m.text, mine, resolved);
      if (!r.ok) throw new Error(`the real pinAll refused: ${JSON.stringify(r)}`);
      rewritten.set(file, r.text);
    });
    return { originals, rewritten, pinned: chosen, resolved, all };
  });

export const passInput = (c: PinCase): PinCheckInput => ({ originals: c.originals, rewritten: c.rewritten, pinned: c.pinned, resolved: c.resolved });

// ---------------------------------------------------------------- scenarios

export type Tamper = "extra-line" | "delete-line" | "blank-line" | "line-ending" | "comment" | "quote" | "indent" | "other-file";
export const TAMPERS: readonly Tamper[] = ["extra-line", "delete-line", "blank-line", "line-ending", "comment", "quote", "indent", "other-file"];

/** The lines of `text` after one tamper at line index `n % lines`, or undefined when the tamper does not apply. */
export function tamperText(text: string, kind: Tamper, n: number, pinnedLines: ReadonlySet<number>): string | undefined {
  const ls = linesOf(text);
  if (ls.length === 0) return undefined;
  const i = n % ls.length;
  const l = ls[i]!;
  const bodyOf = (s: string): string => s.replace(/\r?\n$/, "");
  switch (kind) {
    case "extra-line":
    case "other-file": {
      const b = bodyOf(l);
      ls[i] = b + " x" + l.slice(b.length);
      break;
    }
    case "delete-line":
      ls.splice(i, 1);
      break;
    case "blank-line":
      ls.splice(i, 0, "\n");
      break;
    case "line-ending": {
      if (l.endsWith("\r\n")) ls[i] = l.slice(0, -2) + "\n";
      else if (l.endsWith("\n")) ls[i] = l.slice(0, -1) + "\r\n";
      else ls[i] = l + "\n";
      break;
    }
    case "comment": {
      const idx = [...pinnedLines][n % Math.max(1, pinnedLines.size)];
      if (idx === undefined) return undefined;
      const pl = ls[idx]!;
      const at = pl.indexOf(" # ");
      if (at < 0) return undefined;
      ls[idx] = n % 2 === 0 ? pl.slice(0, at) + (pl.slice(at).match(/\r?\n$/)?.[0] ?? "") : pl.slice(0, at + 3) + "other" + pl.slice(at + 3);
      break;
    }
    case "quote": {
      const idx = [...pinnedLines].find((p) => /["']/.test(ls[p]!));
      if (idx === undefined) return undefined;
      ls[idx] = ls[idx]!.replace(/["']/, "");
      break;
    }
    case "indent":
      ls[i] = " " + l;
      break;
  }
  const out = ls.join("");
  return out === text ? undefined : out;
}

/** 1-based number of the first line where two texts differ (as line lists with their endings). */
export function firstDiffLine(a: string, b: string): number | undefined {
  const x = linesOf(a);
  const y = linesOf(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return i + 1;
  return undefined;
}

// ---------------------------------------------------------------- the reference model

/**
 * The model of Property 8: build the expected text from the original BY OFFSETS, compare for equality,
 * and require the re-inventory of the rewritten text to list the pinned refs.
 */
export function referenceOk(c: PinCheckInput): boolean {
  const pinned = c.pinned.filter((u) => u.refKind === "mutable");
  const files = new Set([...c.originals.keys(), ...c.rewritten.keys()]);
  for (const file of files) {
    const original = c.originals.get(file);
    const got = c.rewritten.get(file);
    if (original === undefined || got === undefined) return false;
    let want = original;
    for (const u of pinned.filter((p) => p.file === file).sort((a, b) => b.offset - a.offset)) {
      const sha = c.resolved.get(keyOf(u));
      if (sha === undefined || !/^[0-9a-f]{40}$/.test(sha)) return false;
      const end = u.offset + u.length;
      const q = original.charAt(u.offset - 1);
      const quoted = (q === '"' || q === "'") && original.charAt(end) === q;
      const scalarEnd = quoted ? end + 1 : end;
      want = want.slice(0, end - u.ref.length) + sha + want.slice(end, scalarEnd) + " # " + u.ref + want.slice(scalarEnd);
    }
    if (got !== want) return false;
    const before = inventoryText(file, original);
    const after = inventoryText(file, got);
    if (after.warnings.length !== before.warnings.length || after.uses.length !== before.uses.length) return false;
    const isPinned = (u: ActionUse): boolean => pinned.some((p) => p.file === file && p.line === u.line && p.column === u.column);
    const expectedRefs = before.uses.map((u) => (isPinned(u) ? c.resolved.get(keyOf(u))! : u.ref));
    if (after.uses.some((u, i) => u.ref !== expectedRefs[i])) return false;
  }
  return true;
}

/** A naive pin that writes the comment even inside a flow mapping (what the real `pinUse` refuses). */
export function naivePin(text: string, uses: readonly ActionUse[], sha: string): string {
  let cur = text;
  for (const u of [...uses].sort((a, b) => b.offset - a.offset)) {
    const end = u.offset + u.length;
    const q = cur.charAt(u.offset - 1);
    const scalarEnd = (q === '"' || q === "'") && cur.charAt(end) === q ? end + 1 : end;
    cur = cur.slice(0, end - u.ref.length) + sha + cur.slice(end, scalarEnd) + " # " + u.ref + cur.slice(scalarEnd);
  }
  return cur;
}

const flowSpec = fileSpecArb.map((spec): FileSpec => ({
  ...spec,
  jobs: spec.jobs.map((j) => ({ ...j, steps: j.steps.map((s) => ({ ...s, flow: true })) })),
}));

const pinnedLinesOf = (c: PinCase, file: string): Set<number> => new Set(c.pinned.filter((u) => u.file === file).map((u) => u.line - 1));

const must = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

export const pinCheckProperties: NamedProperty<PinCheckImpl>[] = [
  {
    name: "P8 the real pinAll output passes",
    build: (impl) =>
      fc.property(pinCaseArb, (c) => {
        if (!c) return;
        const r = impl.checkPin(passInput(c));
        must(r.ok && r.runs > 0, `expected ok, got ${JSON.stringify(r)}`);
      }),
  },
  {
    name: "P8 a different sha written for a use is a sha violation naming that use",
    build: (impl) =>
      fc.property(pinCaseArb, fc.nat(), shaArb, (c, n, other) => {
        if (!c) return;
        const keys = [...new Set(c.pinned.map(keyOf))];
        const key = keys[n % keys.length]!;
        const wrong = c.resolved.get(key) === other ? other.replace(/^./, (h) => (h === "0" ? "1" : "0")) : other;
        const shas = new Map(c.resolved).set(key, wrong);
        const rewritten = new Map<string, string>();
        for (const [file, text] of c.originals) {
          const r = pinAll(text, c.pinned.filter((u) => u.file === file), shas);
          if (!r.ok) throw new Error(JSON.stringify(r));
          rewritten.set(file, r.text);
        }
        const res = impl.checkPin({ ...passInput(c), rewritten });
        must(!res.ok, "a wrong sha passed");
        if (res.ok) return;
        const first = c.pinned
          .filter((u) => keyOf(u) === key)
          .sort((a, b) => cmp(a.file, b.file) || a.line - b.line || a.column - b.column)[0]!;
        const v = res.violation;
        must(v.kind === "sha" && v.file === first.file && v.line === first.line && v.ref === key, `expected a sha violation at ${first.file}:${first.line}, got ${JSON.stringify(v)}`);
        if (v.kind === "sha") must(v.written === wrong && v.resolved === c.resolved.get(key), "the violation does not carry the two shas");
      }),
  },
  {
    name: "P8 any tampering of a passing rewrite is a bytes or parse violation at the first affected line",
    build: (impl) =>
      fc.property(pinCaseArb, fc.constantFrom(...TAMPERS), fc.nat(), (c, kind, n) => {
        if (!c) return;
        const files = [...c.rewritten.keys()];
        const file = kind === "other-file" ? files[files.length - 1]! : files[n % files.length]!;
        const pinnedHere = pinnedLinesOf(c, file);
        const text = c.rewritten.get(file)!;
        if (kind === "other-file" || kind === "extra-line" || kind === "indent" || kind === "delete-line" || kind === "blank-line" || kind === "line-ending") {
          // a line that holds no pinned use (the tamper must hit a non-use line for "other-file")
          const ls = linesOf(text);
          const plain = ls.map((_, i) => i).filter((i) => kind !== "other-file" || !pinnedHere.has(i));
          if (plain.length === 0) return;
          n = plain[n % plain.length]!;
          if (n >= ls.length) return;
        }
        const tampered = tamperText(text, kind, n, pinnedHere);
        if (tampered === undefined) return;
        const d = firstDiffLine(text, tampered)!;
        const rewritten = new Map(c.rewritten).set(file, tampered);
        const r = impl.checkPin({ ...passInput(c), rewritten });
        must(!r.ok, `${kind}: a tampered rewrite passed`);
        if (r.ok) return;
        const v = r.violation;
        must(v.kind === "bytes" || v.kind === "parse", `${kind}: expected bytes or parse, got ${v.kind}`);
        must(v.file === file && v.line === d, `${kind}: expected ${file}:${d}, got ${v.file}:${v.line}`);
      }),
  },
  {
    name: "P8 a flow-style use pinned naively (a comment inside the mapping) is a parse violation",
    build: (impl) =>
      fc.property(flowSpec, shaArb, (spec, sha) => {
        const m = renderFile(spec, F1);
        const mutable = m.uses.filter((u) => u.refKind === "mutable");
        if (mutable.length === 0) return;
        const resolved = new Map(mutable.map((u) => [keyOf(u), sha] as const));
        const rewritten = naivePin(m.text, mutable, sha);
        // Limit of an inventory-based check: when the swallowed `}` only joins empty jobs to the step,
        // the list of uses is genuinely unchanged and nothing can tell. Those cases are not asserted.
        const after = inventoryText(F1, rewritten);
        if (after.warnings.length === 0 && after.uses.length === m.uses.length && after.uses.every((u, i) => u.ref === (m.uses[i]!.refKind === "mutable" ? sha : m.uses[i]!.ref))) return;
        const r = impl.checkPin({ originals: new Map([[F1, m.text]]), rewritten: new Map([[F1, rewritten]]), pinned: mutable, resolved });
        must(!r.ok, "a naive flow pin passed");
        if (!r.ok) must(r.violation.kind === "parse", `expected parse, got ${r.violation.kind}`);
      }),
  },
  {
    name: "P8 a missing or malformed resolution never passes",
    build: (impl) =>
      fc.property(pinCaseArb, fc.nat(), fc.constantFrom("drop", "short", "upper"), (c, n, how) => {
        if (!c) return;
        const key = keyOf(c.pinned[n % c.pinned.length]!);
        const resolved = new Map(c.resolved);
        if (how === "drop") resolved.delete(key);
        else resolved.set(key, how === "short" ? resolved.get(key)!.slice(1) : resolved.get(key)!.toUpperCase().replace(/^[0-9]/, "A"));
        const r = impl.checkPin({ ...passInput(c), resolved });
        must(!r.ok, `${how}: a bad resolution passed`);
      }),
  },
  {
    name: "P8 the reference model agrees with checkPin on ok",
    build: (impl) =>
      fc.property(pinCaseArb, fc.constantFrom<"none" | Tamper | "sha" | "flow">("none", ...TAMPERS, "sha", "flow"), fc.nat(), shaArb, (c, how, n, other) => {
        if (!c) return;
        let input = passInput(c);
        if (how === "sha") {
          const rewritten = new Map<string, string>();
          for (const [file, text] of c.originals) {
            const r = pinAll(text, c.pinned.filter((u) => u.file === file), new Map([...c.resolved].map(([k]) => [k, other] as const)));
            if (!r.ok) throw new Error(JSON.stringify(r));
            rewritten.set(file, r.text);
          }
          input = { ...input, rewritten };
        } else if (how !== "none" && how !== "flow") {
          const file = [...c.rewritten.keys()][n % c.rewritten.size]!;
          const t = tamperText(c.rewritten.get(file)!, how, n, pinnedLinesOf(c, file));
          if (t !== undefined) input = { ...input, rewritten: new Map(c.rewritten).set(file, t) };
        } else if (how === "flow") {
          const file = [...c.originals.keys()][0]!;
          const text = c.originals.get(file)!;
          const mine = c.pinned.filter((u) => u.file === file);
          input = { ...input, rewritten: new Map(c.rewritten).set(file, naivePin(text, mine, other)), resolved: new Map([...c.resolved].map(([k]) => [k, other] as const)) };
        }
        const got = impl.checkPin(input).ok;
        const want = referenceOk(input);
        must(got === want, `${how}: checkPin ok=${got}, reference ok=${want}`);
      }),
  },
  {
    name: "P8 the check never throws on arbitrary text",
    build: (impl) =>
      fc.property(fc.string(), fc.string(), (a, b) => {
        const r = impl.checkPin({ originals: new Map([[F1, a]]), rewritten: new Map([[F1, b]]), pinned: [], resolved: new Map() });
        must(typeof r.ok === "boolean", "no result");
        must(r.ok === (a === b), "unpinned texts pass exactly when equal");
      }),
  },
];
