import ts from "typescript";
import { describe, expect, it } from "vitest";
import { detectConsumedAs } from "./consumption.js";

/** Consumption of the first call to `f` in the snippet. */
function consumed(code: string): "undefined-check" | undefined {
  const sf = ts.createSourceFile("a.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found: ts.Node | undefined;
  const visit = (n: ts.Node): void => {
    if (!found && ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "f") found = n;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!found) throw new Error("no call to f");
  return detectConsumedAs(found);
}

describe("detectConsumedAs", () => {
  it.each([
    "expect(f(a, b)).toEqual(undefined);",
    "expect(\n  f(a, b),\n)\n  .toEqual(\n    undefined,\n  );",
    "expect(f(a)).toStrictEqual(undefined);",
    "expect(f(a)).toBe(undefined);",
    "expect(f(a)).toBe(void 0);",
    "expect(f(a)).toBeUndefined();",
    "expect(f(a)).not.toBeDefined();",
    "expect(f(a)).not.toEqual(undefined);",
    "expect((f(a))).toEqual((undefined));",
    "x = f(a) === undefined;",
    "x = undefined !== f(a);",
    "x = (f(a)) === void 0;",
  ])("detects %j", (code) => {
    expect(consumed(code)).toBe("undefined-check");
  });

  it.each([
    "x = f(a) == undefined;",
    "x = f(a) != undefined;",
    "expect(f(a)).toEqual(null);",
    "expect(f(a)).toEqual({});",
    "expect(f(a)).toEqual(undefined, 1);",
    "expect(f(a), 1).toEqual(undefined);",
    "expect(f(a)).toBeNull();",
    "expect(f(a)).resolves.toEqual(undefined);",
    "if (f(a)) {}",
    "const x = f(a);",
    "g(f(a));",
    "x = f(a) === null;",
    "f(a);",
  ])("does not detect %j", (code) => {
    expect(consumed(code)).toBeUndefined();
  });
});
