// Repo_Picker screen: the four Demo_Repo cards first (larger), then the Live_Scan_Form.
import { COPY, PRODUCT_NAME, SCREEN_NAME } from "../constants.js";
import { h } from "../dom/h.js";
import { DEMO_REPOS } from "../model/demo-repos.js";
import { renderLiveForm } from "./live-form.js";
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
}

export function renderPicker(opts: PickerOptions): PickerHandle {
  const heading = h("h1", { tabindex: -1 }, PRODUCT_NAME);

  const cards = DEMO_REPOS.map((demo) => {
    const button = h(
      "button",
      { type: "button", class: ["btn", "demo-card"], "data-demo": demo.name },
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
      h("p", { class: "meta" }, SCREEN_NAME),
      heading,
      h("p", null, "Find the dead packages in a codebase, and see exactly why each one scores the way it does."),
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
  return { element, heading, form };
}
