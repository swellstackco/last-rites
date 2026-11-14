// The curated Replacement_Map (Requirement 7). Every claim has a source URL a reader can open.
// The Input_Mappings below were filled (task 8.3) from the action.yml manifests recorded on 2026-11-14 in
// src/__fixtures__/nixpacks/http/, never from memory; src/replacements.data.test.ts checks them offline.

export interface ActionReplacement {
  from: string;
  kind: "action";
  to: string;
  /** The ref written by a swap (checked against the recorded manifest at that ref). */
  toRef: string;
  sourceUrl: string;
  replacementUrl: string;
  /** old input -> new input, or null when the input is dropped */
  inputs: Readonly<Record<string, string | null>>;
}

export interface RunReplacement {
  from: string;
  kind: "run";
  command: string;
  sourceUrl: string;
}

export type Replacement = ActionReplacement | RunReplacement;

export const REPLACEMENTS: readonly Replacement[] = [
  {
    from: "actions/create-release",
    kind: "action",
    to: "softprops/action-gh-release",
    toRef: "v2",
    sourceUrl: "https://github.com/actions/create-release",
    replacementUrl: "https://github.com/softprops/action-gh-release",
    // From actions/create-release@v1 to softprops/action-gh-release@v2. `owner` and `repo` have no
    // equivalent (`repository` takes `owner/repo` in one value), so they are dropped: a known limit.
    inputs: {
      tag_name: "tag_name",
      release_name: "name",
      body: "body",
      body_path: "body_path",
      draft: "draft",
      prerelease: "prerelease",
      commitish: "target_commitish",
      owner: null,
      repo: null,
    },
  },
  {
    from: "actions/upload-release-asset",
    kind: "action",
    to: "softprops/action-gh-release",
    toRef: "v2",
    sourceUrl: "https://github.com/actions/upload-release-asset",
    replacementUrl: "https://github.com/softprops/action-gh-release",
    // softprops/action-gh-release uploads `files` to the release of the tag; it has no upload URL, asset
    // name or content type input, so those are dropped (the asset keeps its file name): a known limit.
    inputs: {
      upload_url: null,
      asset_path: "files",
      asset_name: null,
      asset_content_type: null,
    },
  },
  {
    from: "actions-rs/toolchain",
    kind: "action",
    to: "dtolnay/rust-toolchain",
    // `master` is the ref whose manifest takes a `toolchain` input (required there); `@stable` pins the
    // toolchain by ref instead. Every recorded use passes `toolchain`, so `master` is the faithful swap.
    toRef: "master",
    sourceUrl: "https://github.com/actions-rs/toolchain",
    replacementUrl: "https://github.com/dtolnay/rust-toolchain",
    // actions-rs/toolchain@v1 declares toolchain, target, default, override, profile, components.
    // dtolnay/rust-toolchain installs a minimal profile and sets no default or override, so those three
    // are dropped.
    inputs: {
      toolchain: "toolchain",
      target: "targets",
      components: "components",
      default: null,
      override: null,
      profile: null,
    },
  },
  {
    from: "actions-rs/cargo",
    kind: "run",
    command: "cargo",
    sourceUrl: "https://github.com/actions-rs/cargo",
  },
];

/** Case-insensitive on the Action_Name; total (any non-matching input gives `undefined`). */
export function findReplacement(name: string): Replacement | undefined {
  if (typeof name !== "string") return undefined;
  const wanted = name.toLowerCase();
  return REPLACEMENTS.find((r) => r.from.toLowerCase() === wanted);
}
