// Proof section. The switch is exhaustive
// so a new ProofState is a compile error until it is rendered.
import type { ProofSlot, ProofState } from "@graveyard-kit/skeleton/graveyard";
import { COPY } from "../constants.js";
import { h } from "../dom/h.js";

function assertNever(value: never): never {
  throw new Error(`Unhandled proof state: ${JSON.stringify(value)}`);
}

/** `idBase` must come from an index-based id (never from the package name). */
export function renderProofState(state: ProofState, idBase: string): HTMLElement {
  switch (state.status) {
    case "coming_soon": {
      const descId = `${idBase}-desc`;
      return h(
        "div",
        { class: "stack" },
        h("p", null, h("strong", null, COPY.exorcismComing)),
        h(
          "p",
          { id: descId, class: "muted" },
          "Pin tests against the old package and the new one, and a sabotage check, will appear here.",
        ),
        // aria-disabled (not disabled) keeps it in the tab order; activating it does nothing.
        h(
          "button",
          { type: "button", class: "btn", "aria-disabled": "true", "aria-describedby": descId },
          "Start exorcism",
        ),
      );
    }
    case "loading":
      return h("p", { class: "muted" }, "Loading proof…");
    case "report": {
      // Minimal text rendering; task 8.7 replaces it with the full Proof_Section.
      const v = state.view;
      return h(
        "div",
        { class: "stack" },
        h("p", null, h("strong", null, v.badgeLabel)),
        h("p", { class: "muted" }, `${v.runsText}, ${v.seedText}`),
        h("p", { class: "muted" }, v.sabotageLine),
      );
    }
    default:
      return assertNever(state);
  }
}

export function renderProofSlot(slot: ProofSlot, idBase: string): HTMLElement {
  return h(
    "section",
    { class: "proof", "aria-labelledby": `${idBase}-title` },
    h("h3", { id: `${idBase}-title` }, "Proof"),
    renderProofState(slot.state, idBase),
  );
}
