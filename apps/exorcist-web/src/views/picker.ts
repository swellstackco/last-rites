// Repo_Picker screen: the four Demo_Repo cards first (larger), then the Live_Scan_Form.
import { COPY, PITCH_LINE, PRODUCT_NAME } from "../constants.js";
import { h } from "../dom/h.js";
import { DEMO_REPOS } from "../model/demo-repos.js";
import { renderLiveForm } from "./live-form.js";
import { renderFormSubtitle } from "./masthead.js";
import type { LiveFormHandle, LiveFormValues } from "./live-form.js";

export interface PickerOptions {
  prefill?: LiveFormValues;
  /** Non-blocking message (for example "live scans are not re-run on reload"). */
  notice?: string;
  onOpenDemo(name: string): void;
  onSubmitLive(input: { repo: string; ref?: string }, raw: LiveFormValues): void;
}

export interface PickerHandle {
  element: HTMLElement;
  heading: HTMLElement;
  form: LiveFormHandle;
  /** Shows "N dead" on the Demo_Card of `name` (adds or updates it). Does nothing for an unknown name. */
  setDemoDead(name: string, dead: number): void;
}

export function renderPicker(opts: PickerOptions): PickerHandle {
  const heading = h("h1", { class: "wordmark", tabindex: -1 }, PRODUCT_NAME);

  const cards = DEMO_REPOS.map((demo) => {
    const button = h(
      "button",
      { type: "button", class: ["btn", "demo-card"], "data-demo": demo.name },
      h("span", { class: "tag-hole", "aria-hidden": "true" }),
      h("span", { class: "tomb-name" }, demo.name),
      h("span", { class: "muted" }, demo.repo),
      h("span", null, demo.blurb),
      h("span", { class: "muted" }, "Cached snapshot, loads instantly, runs no scan"),
    );
    button.addEventListener("click", () => opts.onOpenDemo(demo.name));
    return h("li", null, button);
  });

  const form = renderLiveForm({
    ...(opts.prefill ? { initial: opts.prefill } : {}),
    onSubmit: opts.onSubmitLive,
  });

  const element = h(
    "div",
    { class: ["picker", "stack"] },
    h(
      "header",
      { class: "header" },
      h("div", { class: "masthead" }, heading, renderFormSubtitle()),
      h("p", { class: "pitch" }, PITCH_LINE),
    ),
    h(
      "main",
      { class: "stack" },
      opts.notice ? h("p", { class: "notice", role: "status" }, opts.notice) : null,
      h(
        "section",
        { class: "stack", "aria-labelledby": "demo-title" },
        h("h2", { id: "demo-title" }, "Open a demo"),
        h("p", { class: "muted" }, COPY.demoNote),
        h("ul", { class: "demo-cards" }, cards),
      ),
      form.element,
    ),
  );
  const setDemoDead = (name: string, dead: number): void => {
    const card = Array.from(element.querySelectorAll<HTMLElement>("button.demo-card")).find((c) => c.getAttribute("data-demo") === name);
    if (!card) return;
    const text = `${dead} dead`;
    const existing = card.querySelector(":scope > .demo-dead");
    if (existing) existing.textContent = text;
    else card.append(h("span", { class: "demo-dead" }, text));
  };
  return { element, heading, form, setDemoDead };
}
