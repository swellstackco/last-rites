import fc from "fast-check";
import type { CallShape, Outcome, Projection } from "@last-rites/skeleton/proof/runner";
import type { CallSite } from "@last-rites/skeleton/proof";
import { loadOracle } from "../oracles.js";
import type { AppRecipe } from "./types.js";

const IDENTITY: Projection = { name: "identity", observes: "value", apply: (v) => v };

// objectId-like: 10 to 24 characters from a small alphabet (with one non-ASCII character).
const ID = fc.stringOf(fc.constantFrom(..."0123456789abcdefABCDEF_ü"), { minLength: 10, maxLength: 24 });

const independent = fc.array(fc.array(ID, { maxLength: 8 }), { maxLength: 6 });

// Lists drawn from a small shared pool so that overlaps and repeated elements are common.
const pooled = fc
  .uniqueArray(ID, { minLength: 1, maxLength: 6 })
  .chain((pool) => fc.array(fc.array(fc.constantFrom(...pool), { maxLength: 8 }), { maxLength: 6 }));

const ARG = fc.oneof(independent, pooled, pooled);

function isStringList(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function classify(args: unknown[], oracle: Outcome): string[] {
  const lists = args[0] as string[][];
  const labels: string[] = [];
  if (lists.length === 1) labels.push("single-list");
  if (lists.length >= 2) labels.push("multi-list");
  if (oracle.kind === "returned" && Array.isArray(oracle.value)) {
    const result = oracle.value as string[];
    labels.push(result.length === 0 ? "empty-result" : "non-empty-result");
    const last = lists[lists.length - 1];
    if (last !== undefined) {
      const inResult = new Set(result);
      const seen = new Set<string>();
      let dup = false;
      for (const e of last) {
        if (seen.has(e) && inResult.has(e)) dup = true;
        seen.add(e);
      }
      if (dup) labels.push("duplicates-in-last-list");
    }
  }
  return labels;
}

function shape(id: string, member: string): CallShape {
  return {
    id,
    member,
    argCount: 1,
    outputKind: "array",
    orderSensitive: false,
    projection: IDENTITY,
    accepts: (site: CallSite) =>
      site.member === member &&
      site.argCount === 1 &&
      site.new !== true &&
      !site.argTexts.some((t) => t.startsWith("...")),
    arbitrary: ARG.map((lists): unknown[] => [lists]),
    guard: (args) => args.length === 1 && Array.isArray(args[0]) && args[0].every(isStringList),
    classify,
    requiredLabels: ["single-list", "multi-list", "empty-result", "non-empty-result", "duplicates-in-last-list"],
  };
}

export const intersectRecipe: AppRecipe = {
  package: "intersect",
  expectedVersion: "1.0.1",
  shapes: [shape("intersect", ""), shape("intersect.big", "big")],
  loadOracle: () => loadOracle("intersect"),
};
