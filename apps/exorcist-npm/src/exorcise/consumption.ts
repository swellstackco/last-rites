// Requirement 4: is the result of a call only compared with `undefined`? Syntax tree of one file only.
import ts from "typescript";

function skipParens(node: ts.Node): ts.Node {
  let n = node;
  while (ts.isParenthesizedExpression(n)) n = n.expression;
  return n;
}

/** Walks up past parentheses; returns the outermost parenthesized wrapper of `node`. */
function outerWrapper(node: ts.Node): ts.Node {
  let n = node;
  while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent;
  return n;
}

function isUndefinedExpr(node: ts.Node): boolean {
  const n = skipParens(node);
  if (ts.isIdentifier(n)) return n.text === "undefined";
  return ts.isVoidExpression(n) && ts.isNumericLiteral(skipParens(n.expression)) && (skipParens(n.expression) as ts.NumericLiteral).text === "0";
}

function isExpectMatcherUndefinedCheck(call: ts.Node): boolean {
  const wrapped = outerWrapper(call);
  const expectCall = wrapped.parent;
  if (!expectCall || !ts.isCallExpression(expectCall)) return false;
  if (!ts.isIdentifier(expectCall.expression) || expectCall.expression.text !== "expect") return false;
  if (expectCall.arguments.length !== 1 || expectCall.arguments[0] !== wrapped) return false;

  const first: ts.Node | undefined = outerWrapper(expectCall).parent;
  if (!first || !ts.isPropertyAccessExpression(first) || skipParens(first.expression) !== expectCall) return false;
  let access: ts.PropertyAccessExpression = first;
  if (access.name.text === "not") {
    const next: ts.Node | undefined = access.parent;
    if (!next || !ts.isPropertyAccessExpression(next) || next.expression !== access) return false;
    access = next;
  }
  const matcherCall = access.parent;
  if (!matcherCall || !ts.isCallExpression(matcherCall) || matcherCall.expression !== access) return false;
  const matcher = access.name.text;
  const args = matcherCall.arguments;
  if (matcher === "toEqual" || matcher === "toStrictEqual" || matcher === "toBe") {
    return args.length === 1 && isUndefinedExpr(args[0] as ts.Expression);
  }
  if (matcher === "toBeUndefined" || matcher === "toBeDefined") return args.length === 0;
  return false;
}

function isStrictUndefinedComparison(call: ts.Node): boolean {
  const wrapped = outerWrapper(call);
  const bin = wrapped.parent;
  if (!bin || !ts.isBinaryExpression(bin)) return false;
  const k = bin.operatorToken.kind;
  if (k !== ts.SyntaxKind.EqualsEqualsEqualsToken && k !== ts.SyntaxKind.ExclamationEqualsEqualsToken) return false;
  const other = bin.left === wrapped ? bin.right : bin.left;
  return isUndefinedExpr(other);
}

export function detectConsumedAs(callNode: ts.Node): "undefined-check" | undefined {
  if (isExpectMatcherUndefinedCheck(callNode) || isStrictUndefinedComparison(callNode)) return "undefined-check";
  return undefined;
}
