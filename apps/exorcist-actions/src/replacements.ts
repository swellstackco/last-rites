// The curated Replacement_Map (Requirement 7). Every claim has a source URL a reader can open.
// The seed entries below were written with empty Input_Mappings on purpose: while `inputs` is empty
// every swap of a use that has a `with` key refuses with `unmapped_input`, so nothing wrong can ship.

export interface ActionReplacement {
  from: string;
  kind: "action";
  to: string;
  /** The ref written by a swap. Provisional until task 8.3 checks it against the recording. */
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
    // 8.3 fills `inputs` from the recorded action.yml manifests, never from memory.
    inputs: {},
  },
  {
    from: "actions/upload-release-asset",
    kind: "action",
    to: "softprops/action-gh-release",
    toRef: "v2",
    sourceUrl: "https://github.com/actions/upload-release-asset",
    replacementUrl: "https://github.com/softprops/action-gh-release",
    // 8.3 fills `inputs` from the recorded action.yml manifests, never from memory.
    inputs: {},
  },
  {
    from: "actions-rs/toolchain",
    kind: "action",
    to: "dtolnay/rust-toolchain",
    toRef: "stable",
    sourceUrl: "https://github.com/actions-rs/toolchain",
    replacementUrl: "https://github.com/dtolnay/rust-toolchain",
    // 8.3 fills `inputs` from the recorded action.yml manifests, never from memory.
    inputs: {},
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
