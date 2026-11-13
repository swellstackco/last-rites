import ts from "typescript";
import { describe, expect, it } from "vitest";
import { collectBindings } from "./bindings.js";
import { collectCallSites } from "./calls.js";

function calls(code: string, prelude = 'import x from "P";\n') {
  const text = prelude + code;
  const sf = ts.createSourceFile("a.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const { bindings } = collectBindings(sf, "P");
  return collectCallSites(sf, bindings, "P", "src");
}

describe("collectCallSites", () => {
  it("finds the direct call", () => {
    expect(calls("x(a);")).toEqual([
      { file: "a.ts", line: 2, column: 1, callee: "x", member: "", argCount: 1, argTexts: ["a"], enclosing: "src" },
    ]);
  });

  it.each([
    ["x.big(a);", "big", "x.big"],
    ['x["big"](a);', "big", 'x["big"]'],
    ["x?.big(a);", "big", "x?.big"],
    ["x[k](a);", "<dynamic>", "x[k]"],
    ["x.a.b(a);", "a.b", "x.a.b"],
    ["(x.big)(a);", "big", "x.big"],
  ])("%s", (code, member, callee) => {
    const [s, ...rest] = calls(code);
    expect(rest).toEqual([]);
    expect(s).toMatchObject({ member, callee: callee === "x.big" && code.startsWith("(") ? "(x.big)" : callee });
  });

  it("marks new", () => {
    expect(calls("new x(a, b);")[0]).toMatchObject({ new: true, argCount: 2, column: 5 });
    expect(calls("new x;")[0]).toMatchObject({ new: true, argCount: 0 });
  });

  it("emits one site per nested call", () => {
    const s = calls("x(x(a));");
    expect(s).toHaveLength(2);
    expect(s.map((c) => c.column)).toEqual([1, 3]);
    expect(calls("g(x.big(a));")).toHaveLength(1);
  });

  it("handles immediate require", () => {
    const s = calls('require("P")(a);\nrequire("P").big(a);', "");
    expect(s.map((c) => c.member)).toEqual(["", "big"]);
  });

  it("uses the binding prefix and subpaths", () => {
    expect(calls("c(a); d.e(a); g.h(1);", 'import { a as c } from "P";\nconst { b: d } = require("P");\nimport g from "P/get";\n').map((s) => s.member)).toEqual(["a", "b.e", "./get.h"]);
  });

  it("ignores unbound names and other packages", () => {
    expect(calls("y(a); y.big(a); x2(a);")).toEqual([]);
  });

  it("positions multi-line calls at the callee start", () => {
    const [s] = calls("foo(\n  1,\n);\n  x.big(\n  a,\n);");
    expect(s).toMatchObject({ line: 5, column: 3 });
  });

  it("collapses whitespace in argTexts and cuts at 200 code units", () => {
    const [s] = calls(`x({\n   a:   1,\n}, "${"z".repeat(300)}");`);
    expect(s?.argTexts[0]).toBe("{ a: 1, }");
    const long = s!.argTexts[1]!;
    expect(long.length).toBe(201);
    expect(long.endsWith("…")).toBe(true);
  });

  it("keeps spread arguments as text", () => {
    const [s] = calls("x(...args, b);");
    expect(s).toMatchObject({ argCount: 2, argTexts: ["...args", "b"] });
  });

  it("sets consumedAs only for undefined checks", () => {
    const s = calls("expect(x(a, b)).toEqual(undefined);\nconst y = x(a);");
    expect(s[0]?.consumedAs).toBe("undefined-check");
    expect(s[1]).not.toHaveProperty("consumedAs");
  });
});
