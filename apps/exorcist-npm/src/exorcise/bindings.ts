// Requirements 3.1, 3.5-3.8: bindings of a package inside one file, and its import sites. No scope model.
import type { ImportForm, ImportSite } from "@graveyard-kit/skeleton/proof";
import ts from "typescript";

/** local name -> member prefix ("" for the whole module, "big" for a named import, "./sub.a" for a subpath). */
export type BindingMap = Map<string, string>;

export interface FileBindings {
  bindings: BindingMap;
  importSites: ImportSite[];
}

/** String literal or substitution-free template literal text. */
export function literalText(node: ts.Node | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) return node.text;
  return undefined;
}

/**
 * `undefined`: the specifier is not this package. Otherwise the member prefix of the whole module:
 * "" for the package itself, "./<subpath>" for a subpath specifier.
 */
export function specifierPrefix(spec: string, pkg: string): string | undefined {
  if (spec === pkg) return "";
  if (spec.startsWith(`${pkg}/`) && spec.length > pkg.length + 1) return `./${spec.slice(pkg.length + 1)}`;
  return undefined;
}

export function joinMember(...parts: string[]): string {
  return parts.filter((p) => p !== "").join(".");
}

/** `require("P")` with a literal specifier: returns that specifier. */
export function requireSpecifier(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "require") return undefined;
  if (node.arguments.length !== 1) return undefined;
  return literalText(node.arguments[0]);
}

function pos(sf: ts.SourceFile, node: ts.Node): { line: number; column: number } {
  const p = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { line: p.line + 1, column: p.character + 1 };
}

function propertyKeyText(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return undefined;
}

export function collectBindings(sf: ts.SourceFile, pkg: string): FileBindings {
  const bindings: BindingMap = new Map();
  const importSites: ImportSite[] = [];

  const bind = (local: string, member: string): void => {
    if (!bindings.has(local)) bindings.set(local, member);
  };
  const site = (node: ts.Node, form: ImportForm): void => {
    importSites.push({ file: sf.fileName, ...pos(sf, node), form });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const prefix = ts.isStringLiteral(node.moduleSpecifier) ? specifierPrefix(node.moduleSpecifier.text, pkg) : undefined;
      if (prefix !== undefined) {
        const clause = node.importClause;
        if (!clause) site(node, "import-side-effect");
        else if (clause.isTypeOnly) site(node, "import-type");
        else {
          if (clause.name) bind(clause.name.text, prefix);
          const nb = clause.namedBindings;
          if (nb && ts.isNamespaceImport(nb)) bind(nb.name.text, prefix);
          else if (nb) {
            for (const el of nb.elements) {
              if (el.isTypeOnly) continue;
              bind(el.name.text, joinMember(prefix, (el.propertyName ?? el.name).text));
            }
          }
          site(node, clause.name ? "import-default" : nb && ts.isNamespaceImport(nb) ? "import-namespace" : "import-named");
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = literalText(node.moduleSpecifier);
      if (spec !== undefined && specifierPrefix(spec, pkg) !== undefined) site(node, "re-export");
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        const spec = literalText(node.moduleReference.expression);
        const prefix = spec === undefined ? undefined : specifierPrefix(spec, pkg);
        if (prefix !== undefined) {
          if (!node.isTypeOnly) bind(node.name.text, prefix);
          site(node, "import-equals");
        }
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = literalText(node.arguments[0]);
        if (spec !== undefined && specifierPrefix(spec, pkg) !== undefined) site(node, "dynamic-import");
      } else {
        const spec = requireSpecifier(node);
        const prefix = spec === undefined ? undefined : specifierPrefix(spec, pkg);
        if (prefix !== undefined) {
          const bound = bindRequire(node, prefix, bind);
          site(node, bound ? "require" : "require-unbound");
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { bindings, importSites };
}

/** Handles `const x = require()`, `const { a, b: c } = require()` and `const x = require().a`. */
function bindRequire(call: ts.CallExpression, prefix: string, bind: (local: string, member: string) => void): boolean {
  let top: ts.Node = call;
  const path: string[] = [];
  for (;;) {
    const parent: ts.Node | undefined = top.parent;
    if (!parent) break;
    if (ts.isParenthesizedExpression(parent)) {
      top = parent;
    } else if (ts.isPropertyAccessExpression(parent) && parent.expression === top) {
      path.push(parent.name.text);
      top = parent;
    } else if (ts.isElementAccessExpression(parent) && parent.expression === top) {
      const key = literalText(parent.argumentExpression);
      if (key === undefined) return false;
      path.push(key);
      top = parent;
    } else break;
  }
  const decl = top.parent;
  if (!decl || !ts.isVariableDeclaration(decl) || decl.initializer !== top) return false;
  const base = joinMember(prefix, ...path);
  if (ts.isIdentifier(decl.name)) {
    bind(decl.name.text, base);
    return true;
  }
  if (ts.isObjectBindingPattern(decl.name)) {
    for (const el of decl.name.elements) {
      if (el.dotDotDotToken || !ts.isIdentifier(el.name)) continue;
      const imported = el.propertyName ? propertyKeyText(el.propertyName) : el.name.text;
      if (imported === undefined) continue;
      bind(el.name.text, joinMember(base, imported));
    }
    return true;
  }
  return false;
}
