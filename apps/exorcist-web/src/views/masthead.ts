// Shared masthead pieces. The Form_Subtitle is two nowrap phrases so "Form LR-1" never sits alone on a line.
import { FORM_SUBTITLE_PARTS } from "../constants.js";
import { h } from "../dom/h.js";

/** `p.form-subtitle`: two `span.subtitle-phrase` joined by a space; textContent equals FORM_SUBTITLE. */
export function renderFormSubtitle(): HTMLElement {
  const [first, second] = FORM_SUBTITLE_PARTS;
  return h(
    "p",
    { class: "form-subtitle" },
    h("span", { class: "subtitle-phrase" }, first),
    " ",
    h("span", { class: "subtitle-phrase" }, second),
  );
}
