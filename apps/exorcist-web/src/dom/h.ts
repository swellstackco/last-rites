// Tiny hyperscript helper with a closed prop vocabulary.
// Text is always written with createTextNode; there is no HTML option at all.
// `href` only accepts a SafeHref, which only safeHref() and constantHref() produce.
import { safeHttpUrl } from "@graveyard-kit/skeleton/graveyard";

declare const safeHrefBrand: unique symbol;
export type SafeHref = string & { readonly [safeHrefBrand]: true };

/** Wraps safeHttpUrl: returns a SafeHref only for a Safe_Url, otherwise undefined. */
export function safeHref(value: unknown): SafeHref | undefined {
  return safeHttpUrl(value) as SafeHref | undefined;
}

/** For literals written in code: an http(s) URL or an in-page `#fragment`. Throws otherwise. */
export function constantHref(literal: string): SafeHref {
  if (/^#[A-Za-z0-9_-]*$/.test(literal)) return literal as SafeHref;
  if (safeHttpUrl(literal) === undefined) throw new Error(`constantHref: not a safe URL: ${literal}`);
  return literal as SafeHref;
}

/** The fixed class vocabulary; every class used by the views and styles/*.css. */
export type ClassName =
  | "app" | "screen" | "skip-link" | "visually-hidden" | "stack" | "row" | "chip"
  | "btn" | "btn-primary" | "notice" | "error" | "field" | "field-error"
  | "picker" | "demo-cards" | "demo-card" | "live-form" | "status"
  | "header" | "masthead" | "wordmark" | "form-subtitle" | "meta" | "counts" | "count" | "legend" | "warnings" | "note"
  | "group" | "group-title" | "grid" | "grid-dead" | "grid-dying" | "grid-ailing" | "grid-alive"
  | "disclosure" | "skipped"
  | "tombstone" | "tombstone-dead" | "tombstone-dying" | "tombstone-ailing" | "tombstone-alive"
  | "tomb-name" | "tomb-score" | "tomb-grade" | "tomb-summary" | "tomb-badge"
  | "tag-hole" | "tag-field" | "tag-package" | "tag-score" | "tag-cause" | "tag-label" | "tag-band" | "tag-range"
  | "backdrop" | "sheet" | "sheet-head" | "sheet-tag" | "facts" | "score-big" | "grade-chip"
  | "breakdown" | "bar" | "bar-fill" | "calibration" | "calibration-label" | "total" | "unknown" | "mismatch"
  | "col-signal" | "col-value" | "col-status" | "col-points" | "col-source" | "total-label"
  | "proof" | "num" | "muted"
  | "proof-badge" | "proof-badge-proved" | "proof-badge-weak" | "proof-badge-counterexample"
  | "proof-badge-no_call_sites" | "proof-badge-error"
  | "proof-sites" | "proof-attempts" | "proof-pre"
  | "proof-compare" | "proof-cell" | "proof-cell-new";

type DataKey = `data-${string}`;
type AriaKey = `aria-${string}`;
type AttrValue = string | number | boolean | undefined;

export interface Props {
  class?: ClassName | readonly ClassName[];
  id?: string;
  type?: "button" | "submit" | "text" | "search";
  title?: string;
  hidden?: boolean;
  role?: string;
  tabindex?: number;
  href?: SafeHref;
  target?: "_blank";
  rel?: "noopener noreferrer";
  for?: string;
  name?: string;
  value?: string;
  placeholder?: string;
  autocomplete?: "off" | "on";
  scope?: "col" | "row";
  colspan?: number;
  lang?: string;
  disabled?: boolean;
  open?: boolean;
  required?: boolean;
  readonly?: boolean;
  checked?: boolean;
  inert?: boolean;
  [key: AriaKey]: AttrValue;
  [key: DataKey]: string | undefined;
}

export type Child = string | Node | null | undefined | false | readonly Child[];

const PLAIN = new Set([
  "id", "type", "title", "role", "href", "target", "rel", "for", "name", "value",
  "placeholder", "autocomplete", "scope", "colspan", "lang",
]);
const BOOLEAN = new Set(["hidden", "disabled", "open", "required", "readonly", "checked", "inert"]);

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return;
  if (typeof child === "string") {
    parent.appendChild(parent.ownerDocument!.createTextNode(child));
  } else if (Array.isArray(child)) {
    for (const c of child as readonly Child[]) append(parent, c);
  } else {
    parent.appendChild(child as Node);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, raw] of Object.entries(props ?? {})) {
    if (raw === undefined) continue;
    if (key === "class") {
      el.setAttribute("class", Array.isArray(raw) ? raw.join(" ") : String(raw));
    } else if (key === "tabindex") {
      el.setAttribute("tabindex", String(raw));
    } else if (BOOLEAN.has(key)) {
      if (raw === true) el.setAttribute(key, "");
    } else if (PLAIN.has(key)) {
      el.setAttribute(key, String(raw));
    } else if (/^aria-[a-z-]+$/.test(key)) {
      el.setAttribute(key, String(raw));
    } else if (/^data-[a-z0-9-]+$/.test(key)) {
      el.setAttribute(key, String(raw));
    } else {
      throw new Error(`h: unsupported prop "${key}"`);
    }
  }
  for (const c of children) append(el, c);
  return el;
}
