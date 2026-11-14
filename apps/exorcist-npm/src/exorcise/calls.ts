// Requirements 3.2-3.5, 3.9: call sites whose callee is rooted at a binding of the package.
import type { CallSite, Enclosing } from "@last-rites/skeleton/proof";
import ts from "typescript";
import { joinMember, literalText, requireSpecifier, specifierPrefix, type BindingMap } from "./bindings.js";
import { detectConsumedAs } from "./consumption.js";

const ARG_TEXT_LIMIT = 200;

function strip(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression(e)) e = e.expression;
  return e;
}

/** Member path of a callee expression, or undefined when it is not rooted at the package. */
function memberOf(expr: ts.Expression, bindings: BindingMap, pkg: string): string | undefined {
  const e = strip(expr);
  if (ts.isIdentifier(e)) return bindings.get(e.text);
  if (ts.isPropertyAccessExpression(e)) {
    const base = memberOf(e.expression, bindings, pkg);
    return base === undefined ? undefined : joinMember(base, e.name.text);
  }
  if (ts.isElementAccessExpression(e)) {
    const base = memberOf(e.expression, bindings, pkg);
    if (base === undefined) return undefined;
    return joinMember(base, literalText(e.argumentExpression) ?? "<dynamic>");
  }
  if (ts.isCallExpression(e)) {
    const spec = requireSpecifier(e);
    return spec === undefined ? undefined : specifierPrefix(spec, pkg);
  }
  return undefined;
}

function argText(arg: ts.Node, sf: ts.SourceFile): string {
  const t = arg.getText(sf).replace(/\s+/g, " ").trim();
  return t.length > ARG_TEXT_LIMIT ? `${t.slice(0, ARG_TEXT_LIMIT)}…` : t;
}

export function collectCallSites(sf: ts.SourceFile, bindings: BindingMap, pkg: string, enclosing: Enclosing): CallSite[] {
  const sites: CallSite[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const member = memberOf(node.expression, bindings, pkg);
      if (member !== undefined) {
        const p = sf.getLineAndCharacterOfPosition(node.expression.getStart(sf));
        const args = node.arguments ?? [];
        const site: CallSite = {
          file: sf.fileName,
          line: p.line + 1,
          column: p.character + 1,
          callee: node.expression.getText(sf),
          member,
          argCount: args.length,
          argTexts: args.map((a) => argText(a, sf)),
          enclosing,
        };
        const consumed = detectConsumedAs(node);
        if (consumed) site.consumedAs = consumed;
        if (ts.isNewExpression(node)) site.new = true;
        sites.push(site);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}
