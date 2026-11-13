// A tiny CSS declaration parser shared by the theme tests and the Stylesheet checks.
// It is not a general CSS parser: it yields every `prop: value` pair with the chain of
// preludes (selectors and at-rules) that enclose it.

export interface Decl {
  prop: string;
  value: string;
  preludes: string[];
}

export const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every declaration with the at-rule/selector preludes that enclose it. */
export function declarations(css: string): Decl[] {
  const out: Decl[] = [];
  const stack: string[] = [];
  let pending = "";
  const flush = (): void => {
    const text = pending.trim();
    pending = "";
    const m = /^([a-z-]+|--[a-z0-9-]+)\s*:\s*([\s\S]+)$/i.exec(text);
    if (m) out.push({ prop: (m[1] as string).toLowerCase(), value: (m[2] as string).trim(), preludes: [...stack] });
  };
  for (const ch of css) {
    if (ch === "{") {
      stack.push(pending.trim());
      pending = "";
    } else if (ch === "}") {
      flush();
      stack.pop();
    } else if (ch === ";") {
      flush();
    } else {
      pending += ch;
    }
  }
  return out;
}
