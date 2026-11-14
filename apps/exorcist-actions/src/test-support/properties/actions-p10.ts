import fc from "fast-check";
import type { SabotageSummary } from "@graveyard-kit/skeleton/proof";
import { isWeak } from "../../proof/attempt.js";
import { checkContract } from "../../proof/contract-check.js";
import type { ContractInput } from "../../proof/contract-check.js";
import { CONTRACT_MUTANTS, PIN_MUTANTS, runSabotage, sabotageFor } from "../../proof/mutants.js";
import type { Mutant } from "../../proof/mutants.js";
import { checkPin } from "../../proof/pin-check.js";
import type { PinCheckInput } from "../../proof/pin-check.js";
import type { NamedProperty } from "../sabotage-runner.js";
import { contractCaseArb } from "./actions-p9.js";
import { passInput, pinCaseArb } from "./actions-p8.js";
import { linesOf } from "./actions-p3.js";

/** The seam under test (Property 10). */
export interface SabotageImpl {
  runSabotage: typeof runSabotage;
  weakOf: typeof isWeak;
  sabotageFor: typeof sabotageFor;
  pinMutants: readonly Mutant<PinCheckInput>[];
  contractMutants: readonly Mutant<ContractInput>[];
}
export const realSabotageImpl: SabotageImpl = { runSabotage, weakOf: isWeak, sabotageFor, pinMutants: PIN_MUTANTS, contractMutants: CONTRACT_MUTANTS };

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
const must = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

/** Independent model: the Mutants of the pin proof that apply. */
function pinApplicable(i: PinCheckInput): string[] {
  const out: string[] = [];
  if (i.pinned.some((u) => u.refKind === "mutable")) out.push("wrong-sha");
  const pinnedLines = new Set(i.pinned.map((u) => `${u.file}\n${u.line}`));
  const plain = [...i.rewritten].some(([file, text]) => linesOf(text).some((_, n) => !pinnedLines.has(`${file}\n${n + 1}`)));
  if (plain) out.push("extra-line");
  return out;
}

/** Independent model: the Mutants of the contract proof that apply. */
function contractApplicable(i: ContractInput): string[] {
  const out: string[] = [];
  const req = new Set([...i.manifest.inputs].filter(([, f]) => f.required && !f.hasDefault).map(([n]) => n));
  const supplied = Object.keys(i.withMap).some((k) => has(i.replacement.inputs, k) && req.has(i.replacement.inputs[k] as string));
  if (supplied) out.push("drop-required-input");
  if (i.outputRefs.length > 0 && !i.manifest.outputs.has(i.outputRefs[0]! + "_x")) out.push("rename-output");
  out.push("add-unmapped-input");
  return out;
}

const idsOf = (ids: string[], shape: string): string[] => ids.map((id) => `${shape}:${id}`);
const sameMap = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

const passingContractArb = contractCaseArb.filter((c) => checkContract(c).ok);
const statusArb = fc.constantFrom("counterexample" as const, "error" as const, "no-call-sites" as const);
const summaryArb: fc.Arbitrary<SabotageSummary> = fc
  .tuple(fc.nat({ max: 5 }), fc.nat({ max: 5 }))
  .map(([caught, surv]) => ({ applied: caught + surv, caught, survivors: Array.from({ length: surv }, (_, i) => `pin:m${i}`) }));

export const sabotageProperties: NamedProperty<SabotageImpl>[] = [
  {
    name: "P10 on a passing pin case every applicable Mutant is caught and the attempt is not weak",
    build: (impl) =>
      fc.property(pinCaseArb, (c) => {
        if (!c) return;
        const input = passInput(c);
        must(checkPin(input).ok, "the case does not pass");
        const s = impl.runSabotage("pin", input, (i) => checkPin(i).ok, impl.pinMutants);
        const want = pinApplicable(input);
        must(s.applied === want.length && s.caught === s.applied && s.survivors.length === 0, `got ${JSON.stringify(s)}, applicable ${want}`);
        must(!impl.weakOf("proved", s), "a fully caught proof is weak");
      }),
  },
  {
    name: "P10 on a passing contract case every applicable Mutant is caught and the attempt is not weak",
    build: (impl) =>
      fc.property(passingContractArb, (c) => {
        const s = impl.runSabotage("contract", c, (i) => checkContract(i).ok, impl.contractMutants);
        const want = contractApplicable(c);
        must(s.applied === want.length && s.caught === s.applied && s.survivors.length === 0, `got ${JSON.stringify(s)}, applicable ${want}`);
        must(!impl.weakOf("proved", s), "a fully caught proof is weak");
      }),
  },
  {
    name: "P10 with a check that accepts everything every applicable Mutant survives, named <shape>:<id>, and the attempt is weak",
    build: (impl) =>
      fc.property(pinCaseArb, passingContractArb, (p, c) => {
        if (p) {
          const input = passInput(p);
          const s = impl.runSabotage("pin", input, () => true, impl.pinMutants);
          const want = pinApplicable(input);
          must(JSON.stringify(s) === JSON.stringify({ applied: want.length, caught: 0, survivors: idsOf(want, "pin") }), `pin: got ${JSON.stringify(s)}`);
          must(impl.weakOf("proved", s), "a lax pin check is not weak");
        }
        const s = impl.runSabotage("contract", c, () => true, impl.contractMutants);
        const want = contractApplicable(c);
        must(JSON.stringify(s) === JSON.stringify({ applied: want.length, caught: 0, survivors: idsOf(want, "contract") }), `contract: got ${JSON.stringify(s)}`);
        must(impl.weakOf("proved", s), "a lax contract check is not weak");
      }),
  },
  {
    name: "P10 applied equals caught plus survivors for any check, and an inapplicable Mutant is not counted",
    build: (impl) =>
      fc.property(passingContractArb, fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }), (c, bits) => {
        let n = 0;
        const extra: Mutant<ContractInput> = { id: "rename-output", applicable: () => false, apply: (i) => i };
        const s = impl.runSabotage("contract", c, () => bits[n++ % bits.length]!, [...impl.contractMutants, extra]);
        must(s.applied === s.caught + s.survivors.length, `applied ${s.applied} != caught ${s.caught} + survivors ${s.survivors.length}`);
        must(s.applied === contractApplicable(c).length, "an inapplicable Mutant was counted");
      }),
  },
  {
    name: "P10 a check that throws leaves the Mutant a survivor, never caught",
    build: (impl) =>
      fc.property(passingContractArb, (c) => {
        const s = impl.runSabotage("contract", c, () => {
          throw new Error("boom");
        }, impl.contractMutants);
        must(s.caught === 0 && s.survivors.length === s.applied && s.applied > 0, `got ${JSON.stringify(s)}`);
      }),
  },
  {
    name: "P10 a proof with no applicable Mutant is weak; the weak rule is proved and (applied 0 or a survivor)",
    build: (impl) =>
      fc.property(passingContractArb, summaryArb, fc.constantFrom("proved" as const, "counterexample" as const, "error" as const), (c, s, status) => {
        const none = impl.runSabotage("contract", c, () => false, []);
        must(JSON.stringify(none) === JSON.stringify({ applied: 0, caught: 0, survivors: [] }), "an empty list is not {0,0,[]}");
        must(impl.weakOf("proved", none), "applied 0 is not weak");
        must(impl.weakOf(status, s) === (status === "proved" && (s.applied === 0 || s.survivors.length > 0)), `weak rule broken for ${status} ${JSON.stringify(s)}`);
      }),
  },
  {
    name: "P10 a counterexample or error attempt has no sabotage numbers, and the Mutants are not run",
    build: (impl) =>
      fc.property(statusArb, (status) => {
        let ran = false;
        const s = impl.sabotageFor(status, () => {
          ran = true;
          return { applied: 3, caught: 1, survivors: ["pin:x", "pin:y"] };
        });
        must(!ran && JSON.stringify(s) === JSON.stringify({ applied: 0, caught: 0, survivors: [] }), `got ${JSON.stringify(s)}`);
        const p = impl.sabotageFor("proved", () => ({ applied: 1, caught: 1, survivors: [] }));
        must(p.applied === 1, "a proved attempt lost its numbers");
      }),
  },
  {
    name: "P10 a Mutant changes only the rewritten texts (pin) or one contract input, never the original",
    build: (impl) =>
      fc.property(pinCaseArb, passingContractArb, (p, c) => {
        if (p) {
          const input = passInput(p);
          for (const m of impl.pinMutants) {
            if (!m.applicable(input)) continue;
            const out = m.apply(input);
            must(sameMap(out.originals, input.originals) && out.pinned === input.pinned && out.resolved === input.resolved, `${m.id} changed more than the rewritten texts`);
            const changed = [...input.rewritten].filter(([k, v]) => out.rewritten.get(k) !== v);
            must(changed.length === 1, `${m.id} changed ${changed.length} rewritten files`);
          }
        }
        for (const m of impl.contractMutants) {
          if (!m.applicable(c)) continue;
          const out = m.apply(c);
          must(out.replacement === c.replacement && out.manifest === c.manifest, `${m.id} changed the replacement or manifest`);
          must(out.withMap !== c.withMap || out.outputRefs !== c.outputRefs, `${m.id} changed nothing`);
        }
      }),
  },
];
