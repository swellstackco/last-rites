// FROZEN, test-only, never import from production code or main.ts.
// Byte copy of src/views/proof-slot.ts as it was before toe-tag-redesign (2026-11-13, post graveyard-ui-polish); imports adjusted to ../../.
// Used only by the Toe Tag preservation properties (tt1 to tt3) as the Reference_Views.
// Proof section. The switch is exhaustive
// so a new ProofState is a compile error until it is rendered.
import type { AttemptView, ProofSlot, ProofState, ProofView } from "@last-rites/skeleton/graveyard";
import { COPY } from "../../constants.js";
import { h } from "../../dom/h.js";

function assertNever(value: never): never {
  throw new Error(`Unhandled proof state: ${JSON.stringify(value)}`);
}

const badgeClass = (badge: ProofView["badge"]) => ["proof-badge", `proof-badge-${badge}`] as const;

function preBlock(label: string, text: string): HTMLElement {
  return h("div", { class: "stack" }, h("p", { class: "muted" }, label), h("pre", { class: "proof-pre", tabindex: 0 }, text));
}

function renderAttempt(a: AttemptView): HTMLElement {
  const c = a.counterexample;
  return h(
    "li",
    null,
    h("span", { class: badgeClass(a.badge) }, a.badgeLabel),
    ` Attempt ${a.attempt}`,
    a.candidateName !== undefined ? `: ${a.candidateName}` : "",
    h("p", { class: "muted" }, `${a.runsText}, ${a.seedText}`),
    h("p", { class: "muted" }, a.sabotageLine),
    a.errorText !== undefined ? h("p", null, a.errorText) : null,
    c
      ? h(
          "div",
          { class: "stack" },
          h("h4", null, COPY.proofCounterexampleHeading),
          preBlock("Shrunk input", c.input),
          preBlock("Old output", c.oldOutput),
          preBlock("New output", c.newOutput),
        )
      : null,
  );
}

function renderProofView(v: ProofView): HTMLElement {
  return h(
    "div",
    { class: "stack" },
    h("p", null, h("span", { class: badgeClass(v.badge) }, v.badgeLabel)),
    h("p", { class: "muted" }, `${v.runsText}, ${v.seedText}`),
    h("p", { class: "muted" }, v.sabotageLine),
    v.recommendation !== undefined ? h("p", null, v.recommendation) : null,
    h(
      "details",
      { class: "proof-sites" },
      h("summary", null, `Call sites (${v.callSiteTotal})`),
      h(
        "ul",
        null,
        v.callSites.map((c) => h("li", null, `${c.label} (${c.enclosing})`)),
        v.moreCount > 0 ? h("li", null, `and ${v.moreCount} more`) : null,
      ),
    ),
    h("h4", null, "Attempts"),
    h("ol", { class: "proof-attempts" }, v.attempts.map(renderAttempt)),
  );
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
      return h("p", { class: "muted" }, COPY.proofLoading);
    case "report":
      return renderProofView(state.view);
    default:
      return assertNever(state);
  }
}

/** `unreadable` adds the muted line for a proof report that was found but could not be read. */
export function renderProofSlot(slot: ProofSlot, idBase: string, unreadable = false): HTMLElement {
  return h(
    "section",
    { class: "proof", "aria-labelledby": `${idBase}-title` },
    h("h3", { id: `${idBase}-title` }, "Proof"),
    renderProofState(slot.state, idBase),
    unreadable ? h("p", { class: "muted" }, COPY.proofUnreadable) : null,
  );
}
