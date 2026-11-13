import { describe, it, expect } from "vitest";
import { classifySpecifier, inventory } from "./inventory.js";
import type { InventoryResult } from "./types.js";

const pkg = (o: Record<string, unknown>) => JSON.stringify(o);
const lock = (packages: Record<string, unknown>, lockfileVersion: unknown = 3) =>
  JSON.stringify({ lockfileVersion, packages: { "": {}, ...packages } });

function ok(manifest: string, lockText?: string): InventoryResult {
  const out = inventory(manifest, lockText);
  if (!out.ok) throw new Error(`expected ok, got ${out.error.code}`);
  return out.inventory;
}

describe("classifySpecifier", () => {
  const table: Array<[string, string | undefined]> = [
    ["npm:foo@^1", "npm_alias"],
    ["git:github.com/a/b", "git"],
    ["git+https://github.com/a/b.git", "git"],
    ["git+ssh://git@github.com/a/b.git", "git"],
    ["github:a/b", "git"],
    ["gitlab:a/b", "git"],
    ["bitbucket:a/b", "git"],
    ["gist:abc", "git"],
    ["ssh://git@host/a/b", "git"],
    ["git@github.com:a/b.git", "git"],
    ["a/b", "git"],
    ["a/b#main", "git"],
    ["file:../x", "file"],
    ["./x", "file"],
    ["../x", "file"],
    ["~/x", "file"],
    ["/abs", "file"],
    ["link:../x", "link"],
    ["http://x/y.tgz", "http"],
    ["https://x/y.tgz", "http"],
    ["workspace:*", "workspace"],
    ["portal:../x", "other"],
    ["@scope/other", "other"],
    ["^1.2.3", undefined],
    ["~1.0.0", undefined],
    [">=1 <2", undefined],
    ["1.x", undefined],
    ["*", undefined],
    ["", undefined],
    ["latest", undefined],
    ["next", undefined],
  ];
  it.each(table)("%j -> %s", (spec, reason) => {
    expect(classifySpecifier(spec)).toBe(reason);
  });

  it("checks git+ before http", () => {
    expect(classifySpecifier("git+https://x/y")).toBe("git");
  });

  it("shorthand versus dist-tag", () => {
    expect(classifySpecifier("user/repo")).toBe("git");
    expect(classifySpecifier("beta")).toBeUndefined();
  });
});

describe("inventory: manifest errors", () => {
  it.each([["empty", ""], ["whitespace", "  \n\t"], ["truncated", '{"dependencies": {"a": "1"']])(
    "%s text is malformed_package_json",
    (_n, text) => {
      expect(inventory(text)).toMatchObject({ ok: false, error: { code: "malformed_package_json" } });
    },
  );

  it.each([
    ["array top level", "[]", "package.json"],
    ["null top level", "null", "package.json"],
    ["string top level", '"x"', "package.json"],
    ["dependencies array", pkg({ dependencies: [] }), "dependencies"],
    ["devDependencies null", pkg({ devDependencies: null }), "devDependencies"],
    ["non-string range", pkg({ dependencies: { left: 1 } }), "left"],
  ])("%s is invalid_package_json_shape naming the offender", (_n, text, field) => {
    const out = inventory(text);
    expect(out).toMatchObject({ ok: false, error: { code: "invalid_package_json_shape" } });
    if (!out.ok) expect(out.error.message).toContain(field);
  });
});

describe("inventory: manifest", () => {
  it("strips a leading BOM", () => {
    expect(ok("\uFEFF" + pkg({ dependencies: { a: "^1.0.0" } })).dependencies.map((d) => d.name)).toEqual(["a"]);
  });

  it("zero dependencies is a success", () => {
    const inv = ok("{}");
    expect(inv.dependencies).toEqual([]);
    expect(inv.skipped).toEqual([]);
    expect(inv.lockfile).toBe("absent");
  });

  it("a workspaces field adds exactly one warning", () => {
    const inv = ok(pkg({ workspaces: ["packages/*"], dependencies: { a: "1" } }));
    expect(inv.warnings.filter((w) => w.includes("workspaces"))).toHaveLength(1);
  });

  it("skips an npm: alias, git and workspace: specifier with a reason", () => {
    const inv = ok(
      pkg({ dependencies: { al: "npm:x@1", g: "git+https://github.com/a/b.git", w: "workspace:*", r: "^1.0.0" } }),
    );
    expect(inv.skipped.map((s) => [s.name, s.reason])).toEqual([
      ["al", "npm_alias"],
      ["g", "git"],
      ["w", "workspace"],
    ]);
    expect(inv.dependencies.map((d) => d.name)).toEqual(["r"]);
  });

  it("`*` and empty string are registry specifiers", () => {
    const inv = ok(pkg({ dependencies: { s: "*", e: "" } }));
    expect(inv.dependencies.map((d) => d.declaredRange)).toEqual(["", "*"]);
  });

  it("a name in two kinds yields one entry, the first kind's range, and a warning when ranges differ", () => {
    const inv = ok(pkg({ devDependencies: { a: "^2.0.0" }, dependencies: { a: "^1.0.0" } }));
    expect(inv.dependencies).toEqual([
      { name: "a", kinds: ["dependencies", "devDependencies"], declaredRange: "^1.0.0", versionSource: "range" },
    ]);
    const w = inv.warnings.filter((x) => x.includes('"a"'));
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('using dependencies "^1.0.0"');
    expect(w[0]).toContain('devDependencies "^2.0.0"');
  });

  it("identical ranges in two kinds add no warning", () => {
    const inv = ok(pkg({ devDependencies: { a: "^1.0.0" }, peerDependencies: { a: "^1.0.0" } }), lock({}));
    expect(inv.warnings).toEqual([]);
  });

  it("handles __proto__ and constructor names", () => {
    const text = '{"dependencies": {"__proto__": "^1.0.0", "constructor": "^2.0.0"}}';
    expect(ok(text).dependencies.map((d) => d.name)).toEqual(["__proto__", "constructor"]);
  });

  it("sorts by UTF-16 code units", () => {
    const inv = ok(pkg({ dependencies: { b: "1", B: "1", a: "1", "@s/x": "1" } }));
    expect(inv.dependencies.map((d) => d.name)).toEqual(["@s/x", "B", "a", "b"]);
  });
});

describe("inventory: lockfile", () => {
  const manifest = pkg({ dependencies: { a: "^1.0.0" } });

  it("uses the lockfile version (v2 and v3)", () => {
    for (const v of [2, 3]) {
      const inv = ok(manifest, lock({ "node_modules/a": { version: "1.4.0" } }, v));
      expect(inv.lockfile).toBe("used");
      expect(inv.dependencies[0]).toMatchObject({ resolvedVersion: "1.4.0", versionSource: "lockfile" });
      expect(inv.warnings).toEqual([]);
    }
  });

  it("no lockfile: one warning, range source", () => {
    const inv = ok(manifest);
    expect(inv.lockfile).toBe("absent");
    expect(inv.warnings).toEqual(["no lockfile found; results use declared ranges"]);
    expect(inv.dependencies[0]!.versionSource).toBe("range");
    expect(inv.dependencies[0]).not.toHaveProperty("resolvedVersion");
  });

  it("unparseable lockfile", () => {
    const inv = ok(manifest, "{nope");
    expect(inv.lockfile).toBe("absent");
    expect(inv.warnings).toEqual(["lockfile is not valid JSON"]);
  });

  it("non-object lockfile", () => {
    expect(ok(manifest, "[]").warnings).toEqual(["lockfile is not a JSON object"]);
    expect(ok(manifest, "null").warnings).toEqual(["lockfile is not a JSON object"]);
  });

  it("lockfile version 1 is unsupported and named", () => {
    const inv = ok(manifest, JSON.stringify({ lockfileVersion: 1, packages: { "node_modules/a": { version: "1.0.0" } } }));
    expect(inv.lockfile).toBe("absent");
    expect(inv.warnings).toEqual(["lockfile version is unsupported: found 1"]);
    expect(inv.dependencies[0]!.versionSource).toBe("range");
  });

  it("missing and out-of-range lockfile versions are unsupported", () => {
    expect(ok(manifest, JSON.stringify({ packages: {} })).warnings).toEqual(["lockfile version is unsupported: found missing"]);
    expect(ok(manifest, lock({}, 4)).warnings).toEqual(["lockfile version is unsupported: found 4"]);
    expect(ok(manifest, lock({}, "3")).warnings).toEqual(['lockfile version is unsupported: found "3"']);
  });

  it("no packages map", () => {
    const inv = ok(manifest, JSON.stringify({ lockfileVersion: 3 }));
    expect(inv.warnings).toEqual(["lockfile has no packages map"]);
    expect(inv.lockfile).toBe("absent");
  });

  it("link: true, mismatched name and invalid version are unusable with no warning", () => {
    for (const entry of [{ version: "1.0.0", link: true }, { version: "1.0.0", name: "other" }, { version: "not-semver" }, {}]) {
      const inv = ok(manifest, lock({ "node_modules/a": entry }));
      expect(inv.dependencies[0]!.versionSource).toBe("range");
      expect(inv.warnings).toEqual([]);
    }
  });

  it("a lockfile version outside the range still wins, with one warning", () => {
    const inv = ok(manifest, lock({ "node_modules/a": { version: "2.0.0" } }));
    expect(inv.dependencies[0]).toMatchObject({ resolvedVersion: "2.0.0", versionSource: "lockfile" });
    expect(inv.warnings).toHaveLength(1);
    expect(inv.warnings[0]).toContain('"a"');
    expect(inv.warnings[0]).toContain("2.0.0");
    expect(inv.warnings[0]).toContain("^1.0.0");
  });

  it("ignores transitive and nested entries", () => {
    const inv = ok(
      manifest,
      lock({
        "node_modules/a": { version: "1.0.0" },
        "node_modules/zzz": { version: "9.9.9" },
        "node_modules/a/node_modules/b": { version: "3.0.0" },
      }),
    );
    expect(inv.dependencies.map((d) => d.name)).toEqual(["a"]);
    expect(inv.warnings).toEqual([]);
  });

  it("skipped names never touch the lockfile", () => {
    const inv = ok(pkg({ dependencies: { al: "npm:x@1" } }), lock({ "node_modules/al": { version: "1.0.0" } }));
    expect(inv.dependencies).toEqual([]);
    expect(inv.skipped).toHaveLength(1);
  });

  it("scoped names keep their slash", () => {
    const inv = ok(pkg({ dependencies: { "@s/p": "^1.0.0" } }), lock({ "node_modules/@s/p": { version: "1.1.0" } }));
    expect(inv.dependencies[0]!.resolvedVersion).toBe("1.1.0");
  });
});
