// Split_Points for package names: a <wbr> directly after each "/" and "-", so a browser prefers those places
// to break a long name. The text is never changed; <wbr> adds no characters.
import { h } from "../dom/h.js";

export function withSplitPoints(text: string): Array<string | HTMLElement> {
  const out: Array<string | HTMLElement> = [];
  let run = "";
  for (let i = 0; i < text.length; i++) {
    run += text[i];
    if ((text[i] === "/" || text[i] === "-") && i < text.length - 1) {
      out.push(run, h("wbr", null));
      run = "";
    }
  }
  if (run !== "") out.push(run);
  return out;
}
