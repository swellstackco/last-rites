// Requirement 7.4: the Replacement_Map is checked offline against the exchanges recorded on 2026-11-14.
// An entry that fails here is removed from REPLACEMENTS, never adjusted to pass.
import { describe, expect, it } from "vitest";
import { loadFixtureCase } from "@last-rites/exorcist-npm/programmatic/testing";
import type { FixtureEntry } from "@last-rites/exorcist-npm/programmatic/testing";
import { parseActionManifest } from "./evidence/manifest.js";
import type { ActionManifest } from "./evidence/manifest.js";
import { rawManifestUrl } from "./evidence/urls.js";
import { REPLACEMENTS } from "./replacements.js";
import type { ActionReplacement } from "./replacements.js";
import { NIXPACKS_FIXTURES } from "./test-support/harness.js";

const FIXTURES: readonly FixtureEntry[] = loadFixtureCase("http", NIXPACKS_FIXTURES);

/** The ref the hero repository uses for every `from` action. */
const OLD_REF = "v1";

function recorded(url: string): FixtureEntry {
  const hit = FIXTURES.find((f) => f.method === "GET" && f.url === url);
  if (hit === undefined) throw new Error(`no recorded exchange for ${url}`);
  return hit;
}

function repoMeta(name: string): { status: number; archived: unknown } {
  const [owner, repo] = name.split("/") as [string, string];
  const e = recorded(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  const body = e.response.status === 200 ? (JSON.parse(e.response.body) as { archived?: unknown }) : {};
  return { status: e.response.status, archived: body.archived };
}

function manifestAt(name: string, ref: string): ActionManifest {
  const yml = recorded(rawManifestUrl(name, ref, undefined, "action.yml"));
  const e = yml.response.status === 404 ? recorded(rawManifestUrl(name, ref, undefined, "action.yaml")) : yml;
  expect(e.response.status, `${name}@${ref} manifest`).toBe(200);
  const parsed = parseActionManifest(e.response.body);
  if (!parsed.ok) throw new Error(`${name}@${ref}: manifest does not parse`);
  return parsed.manifest;
}

const actionEntries = REPLACEMENTS.filter((r): r is ActionReplacement => r.kind === "action");

describe("REPLACEMENTS against the recorded fixtures (Requirement 7.4)", () => {
  it("has entries to check, and the fixtures are present", () => {
    expect(REPLACEMENTS.length).toBeGreaterThan(0);
    expect(FIXTURES.length).toBeGreaterThan(0);
  });

  it.each(REPLACEMENTS.map((r) => [r.from, r] as const))("%s: every URL is https://", (_n, r) => {
    expect(r.sourceUrl).toMatch(/^https:\/\//);
    if (r.kind === "action") expect(r.replacementUrl).toMatch(/^https:\/\//);
  });

  it.each(REPLACEMENTS.map((r) => [r.from] as const))("%s: the recorded repository is archived", (from) => {
    expect(repoMeta(from)).toEqual({ status: 200, archived: true });
  });

  it.each(actionEntries.map((r) => [r.to] as const))("%s: the replacement repository exists and is not archived", (to) => {
    expect(repoMeta(to)).toEqual({ status: 200, archived: false });
  });

  it.each(actionEntries.map((r) => [r.from, r] as const))(
    "%s: every old input is mapped or dropped, and every new input is declared",
    (_n, r) => {
      const oldManifest = manifestAt(r.from, OLD_REF);
      const newManifest = manifestAt(r.to, r.toRef);
      const oldNames = [...oldManifest.inputs.keys()].sort();
      expect(oldNames.length).toBeGreaterThan(0);
      for (const name of oldNames) expect(Object.hasOwn(r.inputs, name), `${r.from}: ${name} not in the mapping`).toBe(true);
      // The mapping names nothing the old action does not declare (no invented inputs).
      expect(Object.keys(r.inputs).sort()).toEqual(oldNames);
      for (const target of Object.values(r.inputs)) {
        if (target !== null) expect(newManifest.inputs.has(target), `${r.to}@${r.toRef}: ${target} not declared`).toBe(true);
      }
    },
  );

  it("actions-rs/toolchain drops override and profile, as the old manifest declares them", () => {
    const r = actionEntries.find((e) => e.from === "actions-rs/toolchain");
    expect(r).toBeDefined();
    const old = manifestAt("actions-rs/toolchain", OLD_REF);
    expect(old.inputs.has("override") && old.inputs.has("profile")).toBe(true);
    expect(r!.inputs["override"]).toBeNull();
    expect(r!.inputs["profile"]).toBeNull();
  });
});
