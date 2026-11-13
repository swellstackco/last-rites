// toe-tag-polish TP4 sabotages (T7): wrong name markup, applied to the rendered `.tomb-name`.
// Each must make `checkName` (or the round-trip check) throw for "@saithodev/semantic-release-backmerge".
import type { TombstoneMutate } from "../properties/tp4.js";

export interface NameSabotage {
  name: string;
  mutate: TombstoneMutate;
}

const rewrite = (el: Element, nodes: Array<string | Element>): void => el.replaceChildren(...nodes.map((n) => (typeof n === "string" ? el.ownerDocument.createTextNode(n) : n)));
const wbr = (el: Element): Element => el.ownerDocument.createElement("wbr");

export const TP4_SABOTAGES: readonly NameSabotage[] = [
  {
    name: "(q) <wbr> after every character",
    mutate: (el) => rewrite(el, Array.from(el.textContent ?? "").flatMap((ch) => [ch, wbr(el)])),
  },
  {
    name: "(r) no <wbr> after a hyphen",
    mutate: (el) => {
      const parts = (el.textContent ?? "").split(/(?<=\/)/);
      rewrite(el, parts.flatMap((p, i) => (i < parts.length - 1 ? [p, wbr(el)] : [p])));
    },
  },
  { name: "(s) a zero-width space is inserted into the name", mutate: (el) => (el.textContent = (el.textContent ?? "").replace("/", "/\u200b")) },
  { name: "(t) the name is cut after the <wbr> pass", mutate: (el) => rewrite(el, [(el.textContent ?? "").slice(0, 10)]) },
];
