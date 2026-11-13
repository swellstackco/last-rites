// FROZEN, test-only, never import from production code or main.ts.
// Byte copy of src/views/detail.ts as it was at 6f860b4 (2026-11-13, before toe-tag-polish); imports adjusted to ../../.
// Used only by the toe-tag-polish preservation properties (TP6, TP1) as the Reference_Renderer.
// Detail_Panel: a hand-written modal dialog (role="dialog") with focus trap and restore.
import { GRADE_INFO, buildBreakdown, proofSlotFor } from "@graveyard-kit/skeleton/graveyard";
import type { Grave, ProofState } from "@graveyard-kit/skeleton/graveyard";
import type { ScannedDependency } from "@graveyard-kit/exorcist-npm/report";
import { h } from "../../dom/h.js";
import { restoreFocus, setInertAround, trapTab } from "../../dom/focus.js";
import { renderBreakdown } from "./breakdown.js";
import { renderProofSlot } from "./proof-slot.js";
import { graveId } from "./tombstone.js";

export interface DetailOptions {
  /** The page root that becomes inert while the panel is open. */
  appRoot: HTMLElement;
  /** Where the backdrop and panel live (a sibling of appRoot). */
  host: HTMLElement;
  /** Escape, Close or backdrop: the controller removes `pkg` from the route, then calls close(). */
  onRequestClose(): void;
}

/** What the Proof_Section shows. `unreadable` adds the muted "could not be read" line. */
export interface ProofShown {
  state: ProofState;
  unreadable?: boolean;
}

export interface OpenOptions {
  /** Initial proof state for a dead or dying package; defaults to "Exorcism coming". */
  proof?: ProofShown;
  /** The control that opened the panel; focus returns to it. Defaults to the active element. */
  opener?: HTMLElement | null;
  /** Fallback focus targets, in order, if the opener is gone (group heading, then h1). */
  fallbacks?: () => ReadonlyArray<HTMLElement | null | undefined>;
}

export interface DetailHandle {
  isOpen(): boolean;
  /** The Grave currently shown, if any. */
  current(): Grave<ScannedDependency> | undefined;
  open(grave: Grave<ScannedDependency>, options?: OpenOptions): void;
  /** Replaces only the content of the open panel's Proof_Section, when the open grave has `key`. */
  updateProof(key: string, proof: ProofShown): void;
  close(): void;
  destroy(): void;
}

function versionText(dep: ScannedDependency): string {
  return dep.versionSource === "lockfile" && dep.resolvedVersion !== undefined
    ? `${dep.resolvedVersion} (from lockfile)`
    : `${dep.declaredRange} (declared range)`;
}

function renderContent(grave: Grave<ScannedDependency>, onClose: () => void, proof?: ProofShown): HTMLElement[] {
  const dep = grave.record;
  const death = dep.death;
  const info = GRADE_INFO[death.grade];
  const id = graveId(grave);
  const breakdown = buildBreakdown(dep);
  const baseSlot = proofSlotFor(grave);
  const slot = baseSlot && proof ? { ...baseSlot, state: proof.state } : baseSlot;

  const closeButton = h(
    "button",
    { type: "button", class: "btn", "aria-label": `Close score breakdown for ${dep.name}` },
    "Close",
  );
  closeButton.addEventListener("click", onClose);

  const fact = (label: string, value: string) =>
    h("div", null, h("p", { class: "muted" }, label), h("p", null, value));

  const nodes: Array<HTMLElement | null> = [
    h(
      "div",
      { class: "sheet-head" },
      h(
        "div",
        { class: "sheet-tag", "data-grade": death.grade },
        h("span", { class: "tag-hole", "aria-hidden": "true" }),
        h("h2", { id: "detail-title", tabindex: -1 }, dep.name),
        h("span", { class: "tag-band", "aria-hidden": "true" }),
      ),
      closeButton,
    ),
    h(
      "div",
      { class: "facts" },
      h(
        "div",
        null,
        h("p", { class: "muted" }, "Death score"),
        h("p", { class: "score-big" }, `${death.score} / 100`),
        h("p", { class: "grade-chip" }, `${info.label} (${info.min}-${info.max})`),
      ),
      fact("Version", versionText(dep)),
      fact("Dependency kinds", dep.kinds.join(", ")),
      dep.replacement
        ? fact(
            "Replacement",
            dep.replacement.replacements.length > 0
              ? `${dep.replacement.type}: ${dep.replacement.replacements.join(", ")}`
              : dep.replacement.type,
          )
        : null,
    ),
    renderBreakdown(breakdown, dep),
    dep.evidenceWarnings.length > 0
      ? h(
          "div",
          { class: "stack" },
          h("h3", null, "Evidence warnings"),
          h("ul", null, dep.evidenceWarnings.map((w) => h("li", null, w))),
        )
      : null,
    slot ? renderProofSlot(slot, `${id}-proof`, proof?.unreadable === true) : null,
  ];
  return nodes.filter((n): n is HTMLElement => n !== null);
}

export function createDetail(options: DetailOptions): DetailHandle {
  const doc = options.host.ownerDocument;
  // The backdrop is a native button (outside the tab order) so activating it is a real control.
  const backdrop = h("button", {
    type: "button",
    class: "backdrop",
    tabindex: -1,
    hidden: true,
    "aria-label": "Close score breakdown",
  });
  const panel = h("section", {
    class: "sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "detail-title",
    hidden: true,
  });
  options.host.append(backdrop, panel);

  let opened = false;
  let grave: Grave<ScannedDependency> | undefined;
  let remembered: HTMLElement | null = null;
  let fallbacks: OpenOptions["fallbacks"];

  const request = () => options.onRequestClose();
  backdrop.addEventListener("click", request);
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      request();
      return;
    }
    trapTab(panel, event);
  });

  return {
    isOpen: () => opened,
    current: () => grave,
    open(next, openOptions = {}) {
      if (!opened) {
        const active = doc.activeElement;
        remembered = openOptions.opener ?? (active instanceof HTMLElement && active !== doc.body ? active : null);
      }
      fallbacks = openOptions.fallbacks ?? fallbacks;
      grave = next;
      panel.replaceChildren(...renderContent(next, request, openOptions.proof));
      panel.scrollTop = 0;
      setInertAround(options.appRoot, true);
      backdrop.hidden = false;
      panel.hidden = false;
      opened = true;
      doc.getElementById("detail-title")?.focus();
    },
    updateProof(key, proof) {
      if (!opened || !grave || grave.key !== key) return;
      const section = panel.querySelector<HTMLElement>("section.proof");
      const slot = proofSlotFor(grave);
      if (!section || !slot) return;
      const fresh = renderProofSlot({ ...slot, state: proof.state }, `${graveId(grave)}-proof`, proof.unreadable === true);
      section.replaceChildren(...Array.from(fresh.childNodes));
    },
    close() {
      if (!opened) return;
      opened = false;
      grave = undefined;
      setInertAround(options.appRoot, false);
      backdrop.hidden = true;
      panel.hidden = true;
      panel.replaceChildren();
      restoreFocus([remembered, ...(fallbacks ? fallbacks() : [])]);
      remembered = null;
    },
    destroy() {
      setInertAround(options.appRoot, false);
      backdrop.remove();
      panel.remove();
    },
  };
}
