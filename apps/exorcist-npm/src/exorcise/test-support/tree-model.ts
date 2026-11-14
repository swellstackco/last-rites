// Property 6 generator: a small source tree built from a model, plus the result the usage surface must
// return for it. The expected result comes from the model itself (positions are recorded while the text is
// assembled), so no second TypeScript parser exists in the tests.
import type { CallSite, Enclosing, ImportForm, ImportSite, UsageSurfaceResult } from "@last-rites/skeleton/proof";
import fc from "fast-check";

export const PACKAGE = "P";

// ---------------------------------------------------------------------------------------------- descriptors

export type StatementKind =
  | "plain" | "member" | "element" | "optional" | "new" | "nested" | "req-call" | "req-member"
  | "expect-eq" | "expect-strict" | "expect-not-undefined" | "expect-defined"
  | "cmp-strict" | "cmp-not-strict" | "cmp-void" | "cmp-undefined-left"
  | "bare" | "loose-eq" | "loose-eq-left" | "expect-null" | "if-test"
  | "decoy-other" | "decoy-unbound" | "decoy-method" | "decoy-comment" | "decoy-string" | "decoy-foreign";

export interface StatementDesc {
  kind: StatementKind;
  args: string[];
  member: string;
}

export interface FileDesc {
  dir: string;
  base: string;
  infix: string;
  ext: string;
  /** 0: no binding of the package; 1..9: see BINDINGS. */
  binding: number;
  foreignImport: boolean;
  extraImports: number[];
  annotated: boolean;
  body: StatementDesc[];
}

export interface TreeModel {
  files: FileDesc[];
}

// ------------------------------------------------------------------------------------------------- tables

interface BindingDef {
  line: string;
  prefix: string;
  form: ImportForm;
  /** Marker text whose first occurrence gives the import-site column; absent: column 1. */
  at?: string;
}

const BINDINGS: Record<number, BindingDef> = {
  1: { line: 'import x from "P";', prefix: "", form: "import-default" },
  2: { line: 'import * as x from "P";', prefix: "", form: "import-namespace" },
  3: { line: 'import x = require("P");', prefix: "", form: "import-equals" },
  4: { line: 'const x = require("P");', prefix: "", form: "require", at: "require(" },
  5: { line: 'import { big as x } from "P";', prefix: "big", form: "import-named" },
  6: { line: 'const { big: x } = require("P");', prefix: "big", form: "require", at: "require(" },
  7: { line: 'const x = require("P").big;', prefix: "big", form: "require", at: "require(" },
  8: { line: 'import x from "P/sub";', prefix: "./sub", form: "import-default" },
  9: { line: 'import x, { big } from "P";', prefix: "", form: "import-default" },
};

const EXTRA_IMPORTS: { line: string; form: ImportForm }[] = [
  { line: 'import "P";', form: "import-side-effect" },
  { line: 'export * from "P";', form: "re-export" },
  { line: 'import type { T } from "P";', form: "import-type" },
  { line: 'import("P");', form: "dynamic-import" },
  { line: 'require("P");', form: "require-unbound" },
];

const DIRS = [
  "", "src/", "lib/Controllers/", "Controllers/", "spec/", "test/", "tests/", "__tests__/", "src/__mocks__/",
  "src/contest/", "node_modules/p/", "dist/", "build/", "coverage/", "src/dist/x/",
];
const BASES = ["a", "mod", "Db", "B", "Thing", "util", "x"];
const INFIXES = ["", "", "", ".spec", ".test"];
const ELIGIBLE_EXTS = [".js", ".js", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"];
const INELIGIBLE_EXTS = [".d.ts", ".d.mts", ".json", ".md"];
const SKIPPED_DIR_NAMES = new Set(["node_modules", "dist", "build", "coverage", ".git"]);
const TEST_DIR_NAMES = new Set(["spec", "test", "tests", "__tests__", "__mocks__"]);

// ------------------------------------------------------------------------------------------------ arbitrary

const argArb = fc.constantFrom("1", "a", "[1,   2]", "'q, r'", "{ k:  1 }", "ids", "f(a,b)", "`t`", "...rest");
const kindArb = fc.constantFrom<StatementKind>(
  "plain", "member", "element", "optional", "new", "nested", "req-call", "req-member",
  "expect-eq", "expect-strict", "expect-not-undefined", "expect-defined",
  "cmp-strict", "cmp-not-strict", "cmp-void", "cmp-undefined-left",
  "bare", "loose-eq", "loose-eq-left", "expect-null", "if-test",
  "decoy-other", "decoy-unbound", "decoy-method", "decoy-comment", "decoy-string", "decoy-foreign",
);
const statementArb: fc.Arbitrary<StatementDesc> = fc.record({
  kind: kindArb,
  args: fc.array(argArb, { maxLength: 3 }),
  member: fc.constantFrom("foo", "big", "a.b"),
});

const fileArb: fc.Arbitrary<FileDesc> = fc.record({
  dir: fc.constantFrom(...DIRS),
  base: fc.constantFrom(...BASES),
  infix: fc.constantFrom(...INFIXES),
  ext: fc.oneof({ weight: 6, arbitrary: fc.constantFrom(...ELIGIBLE_EXTS) }, { weight: 1, arbitrary: fc.constantFrom(...INELIGIBLE_EXTS) }),
  binding: fc.integer({ min: 0, max: 9 }),
  foreignImport: fc.boolean(),
  extraImports: fc.uniqueArray(fc.integer({ min: 0, max: EXTRA_IMPORTS.length - 1 }), { maxLength: 3 }),
  annotated: fc.boolean(),
  body: fc.array(statementArb, { maxLength: 8 }),
});

export const treeModelArb: fc.Arbitrary<TreeModel> = fc.record({
  files: fc.array(fileArb, { minLength: 1, maxLength: 6 }),
});

// ----------------------------------------------------------------------------------------------- assembling

interface ExpectedCall {
  col: number;
  callee: string;
  /** Member segments after the binding prefix. */
  suffix: string[];
  args: string[];
  bound: boolean;
  isNew?: true;
  consumed?: true;
}
interface Built {
  text: string;
  calls: ExpectedCall[];
  imports: { col: number; form: ImportForm }[];
}

class Line {
  text = "";
  marks: number[] = [];
  add(s: string): this {
    this.text += s;
    return this;
  }
  mark(): this {
    this.marks.push(this.text.length + 1);
    return this;
  }
}

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();
const joinMember = (...parts: string[]): string => parts.filter((p) => p !== "").join(".");

function argsText(args: string[]): string {
  return args.join(", ");
}

function build(d: StatementDesc): Built {
  const a = argsText(d.args);
  const seg = d.member.split(".");
  const call = (l: Line, extra: Partial<ExpectedCall> & Pick<ExpectedCall, "callee" | "suffix">): ExpectedCall => ({
    col: l.marks[0]!, args: d.args, bound: true, ...extra,
  });
  const one = (l: Line, c: ExpectedCall[], imports: Built["imports"] = []): Built => ({ text: l.text, calls: c, imports });
  const wrapped = (before: string, after: string, consumed: boolean): Built => {
    const l = new Line().add(before).mark().add(`x(${a})`).add(after);
    return one(l, [call(l, { callee: "x", suffix: [], ...(consumed ? { consumed: true as const } : {}) })]);
  };
  switch (d.kind) {
    case "plain": {
      const l = new Line().mark().add(`x(${a});`);
      return one(l, [call(l, { callee: "x", suffix: [] })]);
    }
    case "member": {
      const l = new Line().mark().add(`x.${d.member}(${a});`);
      return one(l, [call(l, { callee: `x.${d.member}`, suffix: seg })]);
    }
    case "element": {
      const l = new Line().mark().add(`x["${d.member}"](${a});`);
      return one(l, [call(l, { callee: `x["${d.member}"]`, suffix: [d.member] })]);
    }
    case "optional": {
      const l = new Line().mark().add(`x?.${d.member}(${a});`);
      return one(l, [call(l, { callee: `x?.${d.member}`, suffix: seg })]);
    }
    case "new": {
      const l = new Line().add("new ").mark().add(`x(${a});`);
      return one(l, [call(l, { callee: "x", suffix: [], isNew: true })]);
    }
    case "nested": {
      const l = new Line().mark().add("x(").mark().add(`x(${a}));`);
      const outer: ExpectedCall = { col: l.marks[0]!, callee: "x", suffix: [], args: [`x(${a})`], bound: true };
      const inner: ExpectedCall = { col: l.marks[1]!, callee: "x", suffix: [], args: d.args, bound: true };
      return one(l, [outer, inner]);
    }
    case "req-call": {
      const l = new Line().mark().add(`require("P")(${a});`);
      return one(l, [call(l, { callee: 'require("P")', suffix: [], bound: false })], [{ col: l.marks[0]!, form: "require-unbound" }]);
    }
    case "req-member": {
      const l = new Line().mark().add(`require("P").${d.member}(${a});`);
      return one(l, [call(l, { callee: `require("P").${d.member}`, suffix: seg, bound: false })], [{ col: l.marks[0]!, form: "require-unbound" }]);
    }
    case "expect-eq": return wrapped("expect(", ").toEqual(undefined);", true);
    case "expect-strict": return wrapped("expect(", ").toStrictEqual(void 0);", true);
    case "expect-not-undefined": return wrapped("expect(", ").not.toBeUndefined();", true);
    case "expect-defined": return wrapped("expect(", ").toBeDefined();", true);
    case "cmp-strict": return wrapped("const r = ", " === undefined;", true);
    case "cmp-not-strict": return wrapped("const r = ", " !== void 0;", true);
    case "cmp-void": return wrapped("const r = void 0 === ", ";", true);
    case "cmp-undefined-left": return wrapped("const r = undefined !== ", ";", true);
    case "bare": return wrapped("const r = ", ";", false);
    case "loose-eq": return wrapped("const r = ", " == undefined;", false);
    case "loose-eq-left": return wrapped("const r = undefined == ", ";", false);
    case "expect-null": return wrapped("expect(", ").toEqual(null);", false);
    case "if-test": return wrapped("if (", ") {}", false);
    case "decoy-other": return { text: `other.${d.member}(${a});`, calls: [], imports: [] };
    case "decoy-unbound": return { text: `y(${a});`, calls: [], imports: [] };
    case "decoy-method": return { text: `obj.x(${a});`, calls: [], imports: [] };
    case "decoy-comment": return { text: `// x(${a}); require("P")(1);`, calls: [], imports: [] };
    case "decoy-string": return { text: `const s = "x(${a.replace(/"/g, "'")})";`, calls: [], imports: [] };
    case "decoy-foreign": return { text: `z(${a});`, calls: [], imports: [] };
  }
}

export interface BuiltFile {
  path: string;
  text: string;
  eligible: boolean;
  skipped: boolean;
  enclosing: Enclosing;
  callSites: CallSite[];
  importSites: ImportSite[];
}

function modelEnclosing(path: string): Enclosing {
  const segs = path.split("/");
  const name = segs[segs.length - 1]!;
  if (/\.(spec|test)\./.test(name)) return "test";
  return segs.slice(0, -1).some((s) => TEST_DIR_NAMES.has(s)) ? "test" : "src";
}

export function buildFile(d: FileDesc, index: number): BuiltFile {
  const path = `${d.dir}${d.base}${index}${d.infix}${d.ext}`;
  const lines: string[] = [];
  const importSites: ImportSite[] = [];
  const callSites: CallSite[] = [];
  const enclosing = modelEnclosing(path);
  const binding = d.binding === 0 ? undefined : BINDINGS[d.binding]!;

  const headImport = (text: string, form: ImportForm, at?: string): void => {
    lines.push(text);
    importSites.push({ file: path, line: lines.length, column: at === undefined ? 1 : text.indexOf(at) + 1, form });
  };
  if (binding) headImport(binding.line, binding.form, binding.at);
  for (const i of d.extraImports) headImport(EXTRA_IMPORTS[i]!.line, EXTRA_IMPORTS[i]!.form);
  if (d.foreignImport) lines.push('import z from "Q";');
  if (d.annotated) lines.push("const ids: Array<Array<string>> = [];");

  for (const s of d.body) {
    const b = build(s);
    lines.push(b.text);
    const line = lines.length;
    for (const imp of b.imports) importSites.push({ file: path, line, column: imp.col, form: imp.form });
    for (const c of b.calls) {
      if (c.bound && !binding) continue;
      const member = joinMember(...(c.bound ? [binding!.prefix] : []), ...c.suffix);
      const site: CallSite = {
        file: path, line, column: c.col, callee: c.callee, member,
        argCount: c.args.length, argTexts: c.args.map(collapse), enclosing,
      };
      if (c.consumed) site.consumedAs = "undefined-check";
      if (c.isNew) site.new = true;
      callSites.push(site);
    }
  }

  const segs = path.split("/");
  const skipped = segs.slice(0, -1).some((s) => SKIPPED_DIR_NAMES.has(s));
  const eligible = INELIGIBLE_EXTS.every((e) => !path.endsWith(e));
  return { path, text: lines.join("\n") + "\n", eligible, skipped, enclosing, callSites, importSites };
}

export function buildFiles(model: TreeModel): BuiltFile[] {
  return model.files.map((f, i) => buildFile(f, i));
}

export function filesOf(model: TreeModel): Record<string, string> {
  return Object.fromEntries(buildFiles(model).map((f) => [f.path, f.text]));
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const order = (a: { file: string; line: number; column: number }, b: { file: string; line: number; column: number }): number =>
  byCodeUnit(a.file, b.file) || a.line - b.line || a.column - b.column;

/** What the usage surface must return for this model (warnings are not part of the comparison). */
export function expectedOf(model: TreeModel): Omit<UsageSurfaceResult, "warnings" | "package"> & { package: string } {
  const counted = buildFiles(model).filter((f) => f.eligible && !f.skipped);
  return {
    package: PACKAGE,
    filesScanned: counted.length,
    callSites: counted.flatMap((f) => f.callSites).sort(order),
    importSites: counted.flatMap((f) => f.importSites).sort(order),
  };
}
