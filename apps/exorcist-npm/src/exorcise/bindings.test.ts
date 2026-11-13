import ts from "typescript";
import { describe, expect, it } from "vitest";
import { collectBindings } from "./bindings.js";

function run(code: string, pkg = "P") {
  const sf = ts.createSourceFile("a.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const r = collectBindings(sf, pkg);
  return { bindings: Object.fromEntries(r.bindings), forms: r.importSites.map((s) => s.form), sites: r.importSites };
}

describe("collectBindings", () => {
  it.each([
    ['import x from "P";', { x: "" }, ["import-default"]],
    ['import * as x from "P";', { x: "" }, ["import-namespace"]],
    ['import { a, b as c } from "P";', { a: "a", c: "b" }, ["import-named"]],
    ['import x, { a } from "P";', { x: "", a: "a" }, ["import-default"]],
    ['import x = require("P");', { x: "" }, ["import-equals"]],
    ['const x = require("P");', { x: "" }, ["require"]],
    ['let x = require("P");', { x: "" }, ["require"]],
    ['var x = require("P");', { x: "" }, ["require"]],
    ['const { a, b: c } = require("P");', { a: "a", c: "b" }, ["require"]],
    ['const x = require("P").a;', { x: "a" }, ["require"]],
    ['const x = require("P").a.b;', { x: "a.b" }, ["require"]],
    ['import type { T } from "P";', {}, ["import-type"]],
    ['import "P";', {}, ["import-side-effect"]],
    ['export { a } from "P";', {}, ["re-export"]],
    ['export * from "P";', {}, ["re-export"]],
    ['const m = import("P");', {}, ["dynamic-import"]],
    ['require("P");', {}, ["require-unbound"]],
    ["const m = import(`P`);", {}, ["dynamic-import"]],
    ['require("P")(1);', {}, ["require-unbound"]],
  ] as const)("%s", (code, bindings, forms) => {
    const r = run(code);
    expect(r.bindings).toEqual(bindings);
    expect(r.forms).toEqual(forms);
  });

  it("handles a subpath specifier", () => {
    const r = run('import get from "P/get";\nconst { z } = require("P/lib/z");');
    expect(r.bindings).toEqual({ get: "./get", z: "./lib/z.z" });
    expect(r.forms).toEqual(["import-default", "require"]);
  });

  it("ignores other packages, similar names and non-literal require", () => {
    const r = run('import a from "Q";\nimport b from "PP";\nconst c = require(name);\nconst d = require(`P${x}`);');
    expect(r.bindings).toEqual({});
    expect(r.sites).toEqual([]);
  });

  it("first binding of a repeated local name wins", () => {
    expect(run('import { a } from "P";\nimport { b as a } from "P";').bindings).toEqual({ a: "a" });
  });

  it("records 1-based positions", () => {
    const r = run('\n  import x from "P";');
    expect(r.sites[0]).toMatchObject({ file: "a.ts", line: 2, column: 3 });
  });
});
