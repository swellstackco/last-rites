// Live_Scan_Form: a labelled repo field, an optional ref in a <details>, inline field errors.
import { COPY } from "../constants.js";
import { h } from "../dom/h.js";
import { parseRepoInput } from "../model/repo-input.js";

export interface LiveFormValues {
  repo: string;
  ref: string;
}

export interface LiveFormOptions {
  /** Values to put into the fields (kept after Cancel, or taken from a live route). */
  initial?: LiveFormValues;
  /** Called with the parsed, accepted input. Never called for rejected input. */
  onSubmit(input: { repo: string; ref?: string }, raw: LiveFormValues): void;
}

export interface LiveFormHandle {
  element: HTMLElement;
  /** Current text in both fields. */
  values(): LiveFormValues;
  /** Mark the submit button aria-disabled (it stays in the tab order) while a scan runs. */
  setBusy(busy: boolean): void;
  /** Visible, aria-hidden countdown text while rate limited; undefined clears it and re-enables. */
  setCooldown(secondsLeft: number | undefined): void;
}

export function cooldownText(secondsLeft: number): string {
  return `You can scan again in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}`;
}

export function renderLiveForm(opts: LiveFormOptions): LiveFormHandle {
  const initial = opts.initial ?? { repo: "", ref: "" };

  const repoInput = h("input", {
    type: "text",
    id: "live-repo",
    name: "repo",
    value: initial.repo,
    placeholder: "owner/name",
    autocomplete: "off",
    "aria-describedby": "live-repo-hint",
  });
  const refInput = h("input", {
    type: "text",
    id: "live-ref",
    name: "ref",
    value: initial.ref,
    placeholder: "main",
    autocomplete: "off",
  });
  // `value` set through attributes is the default value; mirror it so values() is right at once.
  repoInput.value = initial.repo;
  refInput.value = initial.ref;

  const repoError = h("p", { class: "field-error", id: "live-repo-error", hidden: true });
  const refError = h("p", { class: "field-error", id: "live-ref-error", hidden: true });
  const refDetails = h(
    "details",
    { open: initial.ref !== "" },
    h("summary", null, "Branch or tag (optional)"),
    h(
      "div",
      { class: "field" },
      h("label", { for: "live-ref" }, "Branch or tag"),
      refInput,
      refError,
    ),
  );

  const button = h("button", { type: "submit", class: ["btn", "btn-primary"] }, "Scan this repo");
  const countdown = h("span", { class: "muted", "aria-hidden": "true", "data-countdown": "live" });

  const form = h(
    "form",
    { class: "live-form", "aria-labelledby": "live-form-title" },
    h("h2", { id: "live-form-title" }, "Scan a public GitHub repo"),
    h(
      "div",
      { class: "field" },
      h("label", { for: "live-repo" }, "Repository"),
      repoInput,
      h("p", { class: "muted", id: "live-repo-hint" }, "owner/name, or a github.com URL"),
      repoError,
    ),
    refDetails,
    h("div", { class: "row" }, button, countdown),
    h(
      "div",
      { class: "stack" },
      h("p", { class: "muted" }, COPY.liveLimitHint),
      h("p", { class: "muted" }, COPY.livePublicOnly),
      h("p", { class: "muted" }, COPY.liveFilesRead),
    ),
  );

  let busy = false;
  let cooling = false;

  const sync = (): void => {
    button.setAttribute("aria-disabled", busy || cooling ? "true" : "false");
  };
  sync();

  const clearErrors = (): void => {
    for (const [input, err] of [
      [repoInput, repoError],
      [refInput, refError],
    ] as const) {
      input.removeAttribute("aria-invalid");
      err.hidden = true;
      err.replaceChildren();
    }
    repoInput.setAttribute("aria-describedby", "live-repo-hint");
    refInput.removeAttribute("aria-describedby");
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || cooling) return;
    clearErrors();
    const parsed = parseRepoInput(repoInput.value, refInput.value);
    if (!parsed.ok) {
      const [input, err, id] =
        parsed.field === "repo"
          ? ([repoInput, repoError, "live-repo-error"] as const)
          : ([refInput, refError, "live-ref-error"] as const);
      if (parsed.field === "ref") refDetails.open = true;
      err.textContent = parsed.message;
      err.hidden = false;
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", parsed.field === "repo" ? `live-repo-hint ${id}` : id);
      input.focus();
      return;
    }
    const request: { repo: string; ref?: string } = { repo: parsed.repo };
    if (parsed.ref !== undefined) request.ref = parsed.ref;
    opts.onSubmit(request, { repo: repoInput.value, ref: refInput.value });
  });

  return {
    element: form,
    values: () => ({ repo: repoInput.value, ref: refInput.value }),
    setBusy(next) {
      busy = next;
      sync();
    },
    setCooldown(secondsLeft) {
      cooling = secondsLeft !== undefined;
      countdown.textContent = secondsLeft === undefined ? "" : cooldownText(secondsLeft);
      sync();
    },
  };
}
