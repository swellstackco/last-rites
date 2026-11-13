// Loading and error blocks. Server text is written as text and was already cut by describeError.
import type { UiError } from "../api/errors.js";
import { PRODUCT_NAME } from "../constants.js";
import { h } from "../dom/h.js";

export interface ScreenHandle {
  element: HTMLElement;
  /** The screen's h1 (tabindex -1), the focus target on phase change. */
  heading: HTMLElement;
}

export interface LoadingOptions {
  /** "owner/repo" for a live scan, the demo name for a demo. */
  label: string;
  kind: "demo" | "live";
  onCancel(): void;
}

export function renderLoading(opts: LoadingOptions): ScreenHandle {
  const heading = h("h1", { tabindex: -1 }, `${opts.kind === "demo" ? "Opening" : "Scanning"} ${opts.label}`);
  const cancel = h("button", { type: "button", class: "btn" }, "Cancel");
  cancel.addEventListener("click", opts.onCancel);
  const element = h(
    "main",
    { class: ["status", "stack"] },
    h("p", { class: "meta" }, PRODUCT_NAME),
    heading,
    h(
      "div",
      { class: "stack", role: "status" },
      h(
        "p",
        null,
        opts.kind === "demo"
          ? `Loading the ${opts.label} snapshot.`
          : `Scanning ${opts.label}. This can take up to a minute.`,
      ),
    ),
    cancel,
  );
  return { element, heading };
}

export interface ErrorOptions {
  error: UiError;
  /** Set when Retry should be offered. */
  onRetry?: () => void;
  onBack(): void;
}

export interface ErrorHandle extends ScreenHandle {
  /** Retry button, present when the error is retryable. */
  retry?: HTMLButtonElement;
}

export function renderError(opts: ErrorOptions): ErrorHandle {
  const { error } = opts;
  const heading = h("h1", { tabindex: -1 }, error.title);
  const back = h("button", { type: "button", class: "btn" }, "Back to repos");
  back.addEventListener("click", opts.onBack);

  let retry: HTMLButtonElement | undefined;
  if (error.retryable && opts.onRetry) {
    retry = h("button", { type: "button", class: ["btn", "btn-primary"] }, "Retry");
    retry.addEventListener("click", opts.onRetry);
  }

  const element = h(
    "main",
    { class: ["status", "stack"] },
    h("p", { class: "meta" }, PRODUCT_NAME),
    heading,
    h(
      "div",
      { class: ["error", "stack"], role: "alert" },
      h("p", null, error.detail),
      error.serverMessage ? h("p", { class: "muted" }, `Service message: ${error.serverMessage}`) : null,
      error.parseDetail ? h("p", { class: "muted" }, error.parseDetail) : null,
    ),
    error.code === "rate_limited" ? h("p", { class: "muted", "aria-hidden": "true", "data-countdown": "error" }) : null,
    h("div", { class: "row" }, retry, back),
  );
  const out: ErrorHandle = { element, heading };
  if (retry) out.retry = retry;
  return out;
}
