// Proof section. The switch is exhaustive
// so a new ProofState is a compile error until it is rendered.
import type { AttemptView, ProofSlot, ProofState, ProofView } from "@last-rites/skeleton/graveyard";
import { COPY } from "../constants.js";
import { h } from "../dom/h.js";
import type { ClassName } from "../dom/h.js";

function assertNever(value: never): never {
  throw new Error(`Unhandled proof state: ${JSON.stringify(value)}`);
}

const badgeClass = (badge: ProofView["badge"]) => ["proof-badge", `proof-badge-${badge}`] as const;

function preBlock(label: string, text: string, cell = false, hot = false): HTMLElement {
  const cls: ClassName[] = cell ? (hot ? ["stack", "proof-cell", "proof-cell-new"] : ["stack", "proof-cell"]) : ["stack"];
  return h("div", { class: cls }, h("p", { class: "muted" }, label), h("pre", { class: "proof-pre", tabindex: 0 }, text));
}

function rewriteBlock(r: NonNullable<AttemptView["rewrite"]>): HTMLElement {
  return h(
    "div",
    { class: "stack" },
    h("pre", { class: "proof-pre", tabindex: 0 }, r.lines.join("\n")),
    r.moreCount > 0 ? h("p", { class: "muted" }, `and ${r.moreCount} more lines`) : null,
  );
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
    a.kindLine !== undefined ? h("p", null, a.kindLine) : null,
    a.coverageText !== undefined ? h("p", { class: "muted" }, a.coverageText) : null,
    a.rewrite !== undefined ? rewriteBlock(a.rewrite) : null,
    a.errorText !== undefined ? h("p", null, a.errorText) : null,
    c
      ? h(
          "div",
          { class: "stack" },
          h("h4", null, COPY.proofCounterexampleHeading),
          preBlock("Shrunk input", c.input),
          h(
            "div",
            { class: "proof-compare" },
            preBlock("Old output", c.oldOutput, true),
            preBlock("New output", c.newOutput, true, true),
          ),
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
