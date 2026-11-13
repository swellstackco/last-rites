import fc from "fast-check";
import { AGENT_CAPABILITIES, HOOK_TRIGGERS, RULE_EFFECTS } from "../../kiro-config/index.js";

export type JsonKind = "hook" | "agent" | "mcp-settings" | "plugin" | "power-mcp";
export type KiroKind = JsonKind | "skill";

type Json = Record<string, unknown>;
type Seg = string | number;

// ---------- small generators ----------

const word = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/);
const sentence = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 .,]{0,38}[A-Za-z0-9]$/);
const kebab = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));
const semver = fc
  .tuple(fc.nat({ max: 20 }), fc.nat({ max: 20 }), fc.nat({ max: 20 }))
  .map(([a, b, c]) => `${a}.${b}.${c}`);
const command = fc.constantFrom("npm run hook:scan", "node script.mjs", "npx vitest --run", "ls");
const globish = fc.stringMatching(/^[a-z/*._-]{1,16}$/);
const validMatcher = fc.constantFrom("\\.ts$", "package(-lock)?\\.json$", "^src/.*\\.js$", "weights\\.ts");

function optional<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> {
  return fc.option(arb, { nil: undefined });
}

/** Builds an object from entries, dropping the keys whose value is `undefined`. */
function compact(entries: Record<string, unknown>): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(entries)) if (v !== undefined) out[k] = v;
  return out;
}

// ---------- valid files (as objects) ----------

const hookAction: fc.Arbitrary<Json> = fc.oneof(
  command.map((c) => ({ type: "command", command: c })),
  sentence.map((p) => ({ type: "agent", prompt: p })),
);

const oneHook: fc.Arbitrary<Json> = fc
  .record({
    name: sentence,
    trigger: fc.constantFrom(...HOOK_TRIGGERS),
    description: optional(sentence),
    matcher: optional(validMatcher),
    timeout: optional(fc.integer({ min: 1, max: 600 })),
    enabled: optional(fc.boolean()),
    confirm: optional(fc.boolean()),
    action: hookAction,
  })
  .map(compact);

export const hookFileArb: fc.Arbitrary<Json> = fc
  .array(oneHook, { minLength: 1, maxLength: 3 })
  .map((hooks) => ({ version: "v1", hooks }));

const serverEntry: fc.Arbitrary<Json> = fc
  .record({
    command: command,
    args: optional(fc.array(word, { maxLength: 3 })),
    env: optional(fc.dictionary(word, word, { maxKeys: 2 })),
    disabled: optional(fc.boolean()),
    autoApprove: optional(fc.array(word, { maxLength: 3 })),
  })
  .map(compact);

const rule: fc.Arbitrary<Json> = fc
  .record({
    capability: fc.constantFrom(...AGENT_CAPABILITIES),
    effect: fc.constantFrom(...RULE_EFFECTS),
    match: optional(fc.array(globish, { maxLength: 3 })),
    exclude: optional(fc.array(globish, { maxLength: 2 })),
  })
  .map(compact);

export const agentFileArb: fc.Arbitrary<Json> = fc
  .record({
    name: kebab,
    description: sentence,
    prompt: fc.oneof(sentence, kebab.map((n) => `file://./prompts/${n}.md`)),
    model: optional(word),
    tools: optional(fc.array(fc.constantFrom("read", "write", "shell", "@exorcist", "@exorcist/scan_repo"), { maxLength: 4 })),
    excludedTools: optional(fc.array(word, { maxLength: 2 })),
    includeMcpJson: optional(fc.boolean()),
    includePowers: optional(fc.boolean()),
    welcomeMessage: optional(sentence),
    resources: optional(fc.array(kebab.map((n) => `file://.kiro/steering/${n}.md`), { maxLength: 2 })),
    mcpServers: serverEntry.map((s) => ({ srv: s })),
    permissions: fc.array(rule, { minLength: 1, maxLength: 4 }).map((rules) => ({ rules })),
  })
  .map(compact);

export const mcpSettingsArb: fc.Arbitrary<Json> = serverEntry.map((s) => ({ mcpServers: { s0: s } }));

export const pluginManifestArb: fc.Arbitrary<Json> = fc
  .record({
    $schema: fc.constant("https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"),
    name: kebab,
    version: semver,
    description: sentence,
    author: fc
      .record({ name: sentence, email: optional(word.map((w) => `${w}@example.com`)), url: optional(word.map((w) => `https://example.com/${w}`)) })
      .map(compact),
    keywords: fc.array(word, { minLength: 1, maxLength: 4 }),
    homepage: optional(word.map((w) => `https://example.com/${w}`)),
    repository: optional(word.map((w) => `https://example.com/${w}.git`)),
    license: optional(fc.constantFrom("MIT", "Apache-2.0")),
  })
  .map(compact);

export const powerMcpArb: fc.Arbitrary<Json> = fc
  .record({
    command: command,
    args: optional(fc.array(word, { maxLength: 3 })),
    env: optional(fc.dictionary(word, word, { maxKeys: 2 })),
  })
  .map((s) => ({
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: { s0: { type: "stdio", ...compact(s) } },
  }));

export interface SkillSample {
  folder: string;
  name: string;
  description: string;
  body: string;
}

export const skillArb: fc.Arbitrary<SkillSample> = fc
  .record({ folder: kebab, description: sentence, body: sentence })
  .map((s) => ({ ...s, name: s.folder }));

// ---------- canonical text ----------

export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function skillText(s: SkillSample): string {
  return `---\nname: ${s.name}\ndescription: ${s.description}\n---\n${s.body}\n`;
}

// ---------- faults ----------

export type FaultName =
  | "delete-required"
  | "wrong-type"
  | "unknown-field"
  | "unknown-trigger"
  | "bad-matcher"
  | "drop-command"
  | "drop-prompt"
  | "bad-kebab"
  | "bad-semver"
  | "name-mismatch"
  | "bad-effect";

export const FAULTS: Record<KiroKind, readonly FaultName[]> = {
  hook: ["delete-required", "wrong-type", "unknown-field", "unknown-trigger", "bad-matcher", "drop-command", "drop-prompt"],
  agent: ["delete-required", "wrong-type", "unknown-field", "bad-effect"],
  "mcp-settings": ["delete-required", "wrong-type", "unknown-field"],
  plugin: ["delete-required", "wrong-type", "unknown-field", "bad-kebab", "bad-semver"],
  "power-mcp": ["delete-required", "wrong-type", "unknown-field"],
  skill: ["delete-required", "unknown-field", "name-mismatch"],
};

interface Targets {
  del: Seg[][];
  wrong: [Seg[], unknown][];
  unknown: Seg[][];
}

const SRV = ["mcpServers", "s0"];

const TARGETS: Record<JsonKind, Targets> = {
  hook: {
    del: [["version"], ["hooks"], ["hooks", 0, "name"], ["hooks", 0, "trigger"], ["hooks", 0, "action"]],
    wrong: [
      [["version"], 5],
      [["hooks"], "x"],
      [["hooks", 0, "name"], 5],
      [["hooks", 0, "trigger"], 5],
      [["hooks", 0, "description"], 5],
      [["hooks", 0, "matcher"], 5],
      [["hooks", 0, "timeout"], "60"],
      [["hooks", 0, "enabled"], "yes"],
      [["hooks", 0, "confirm"], 1],
      [["hooks", 0, "action", "type"], 5],
    ],
    unknown: [["zzUnknown"], ["hooks", 0, "zzUnknown"], ["hooks", 0, "action", "zzUnknown"]],
  },
  agent: {
    del: [
      ["name"],
      ["description"],
      ["prompt"],
      ["permissions", "rules"],
      ["permissions", "rules", 0, "capability"],
      ["permissions", "rules", 0, "effect"],
      ["mcpServers", "srv", "command"],
    ],
    wrong: [
      [["name"], 5],
      [["description"], 5],
      [["prompt"], 5],
      [["model"], 5],
      [["tools"], "x"],
      [["excludedTools"], "x"],
      [["includeMcpJson"], "no"],
      [["includePowers"], "no"],
      [["welcomeMessage"], 5],
      [["resources"], "x"],
      [["hooks"], 5],
      [["mcpServers"], []],
      [["mcpServers", "srv", "command"], 5],
      [["mcpServers", "srv", "args"], "x"],
      [["permissions"], "x"],
      [["permissions", "rules"], "x"],
      [["permissions", "rules", 0, "capability"], 5],
      [["permissions", "rules", 0, "match"], "x"],
    ],
    unknown: [
      ["zzUnknown"],
      ["allowedTools"],
      ["toolsSettings"],
      ["toolAliases"],
      ["permissions", "zzUnknown"],
      ["permissions", "rules", 0, "zzUnknown"],
      ["mcpServers", "srv", "type"],
    ],
  },
  "mcp-settings": {
    del: [["mcpServers"], [...SRV, "command"]],
    wrong: [
      [["mcpServers"], []],
      [[...SRV, "command"], 5],
      [[...SRV, "args"], "x"],
      [[...SRV, "env"], []],
      [[...SRV, "disabled"], "no"],
      [[...SRV, "autoApprove"], "x"],
    ],
    unknown: [["zzUnknown"], [...SRV, "type"], [...SRV, "zzUnknown"]],
  },
  plugin: {
    del: [["$schema"], ["name"], ["version"], ["description"], ["author"], ["keywords"], ["author", "name"]],
    wrong: [
      [["$schema"], 5],
      [["name"], 5],
      [["version"], 5],
      [["description"], 5],
      [["author"], "x"],
      [["author", "name"], 5],
      [["keywords"], "x"],
      [["keywords", 0], 5],
      [["homepage"], 5],
    ],
    unknown: [["zzUnknown"], ["author", "zzUnknown"]],
  },
  "power-mcp": {
    del: [["$schema"], ["mcpServers"], [...SRV, "type"], [...SRV, "command"]],
    wrong: [
      [["$schema"], 5],
      [["mcpServers"], []],
      [[...SRV, "type"], "http"],
      [[...SRV, "command"], 5],
      [[...SRV, "args"], "x"],
      [[...SRV, "env", "a"], 1],
    ],
    unknown: [["zzUnknown"], [...SRV, "zzUnknown"]],
  },
};

/** Path text as the validators print it: `hooks[0].action.command`, `""` never occurs for these faults. */
export function formatPath(segs: readonly Seg[]): string {
  let out = "";
  for (const s of segs) out += typeof s === "number" ? `[${s}]` : out === "" ? s : `.${s}`;
  return out;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setAt(root: Json, segs: readonly Seg[], value: unknown): void {
  let cur: any = root; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const s of segs.slice(0, -1)) {
    if (cur[s] === undefined || cur[s] === null || typeof cur[s] !== "object") cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1] as Seg] = value;
}

function deleteAt(root: Json, segs: readonly Seg[]): void {
  let cur: any = root; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const s of segs.slice(0, -1)) cur = cur[s];
  delete cur[segs[segs.length - 1] as Seg];
}

const at = <T>(list: readonly T[], pick: number): T => list[pick % list.length] as T;

export interface Faulted {
  text: string;
  /** The `path` the validator must report. */
  path: string;
  /** For skills: the folder name to validate against. */
  folder?: string;
}

/**
 * Applies exactly one fault to a valid sample and returns the faulted text and the path the validator must name.
 * `pick` selects among the possible targets of the fault. Returns `undefined` when the fault does not apply to `kind`.
 */
export function injectFault(kind: JsonKind, fault: FaultName, value: Json, pick: number): Faulted | undefined;
export function injectFault(kind: "skill", fault: FaultName, value: SkillSample, pick: number): Faulted | undefined;
export function injectFault(kind: KiroKind, fault: FaultName, value: Json | SkillSample, pick: number): Faulted | undefined {
  if (!FAULTS[kind].includes(fault)) return undefined;
  if (kind === "skill") return injectSkillFault(fault, value as SkillSample, pick);
  const v = clone(value as Json);
  const t = TARGETS[kind];
  let path: Seg[];
  switch (fault) {
    case "delete-required":
      path = at(t.del, pick);
      deleteAt(v, path);
      break;
    case "wrong-type": {
      const [p, bad] = at(t.wrong, pick);
      path = p;
      setAt(v, p, bad);
      break;
    }
    case "unknown-field":
      path = at(t.unknown, pick);
      setAt(v, path, true);
      break;
    case "unknown-trigger":
      path = ["hooks", 0, "trigger"];
      setAt(v, path, "OnEverything");
      break;
    case "bad-matcher":
      path = ["hooks", 0, "matcher"];
      setAt(v, path, "(unclosed");
      break;
    case "drop-command":
      setAt(v, ["hooks", 0, "action"], { type: "command", command: "ls" });
      path = ["hooks", 0, "action", "command"];
      deleteAt(v, path);
      break;
    case "drop-prompt":
      setAt(v, ["hooks", 0, "action"], { type: "agent", prompt: "look" });
      path = ["hooks", 0, "action", "prompt"];
      deleteAt(v, path);
      break;
    case "bad-kebab":
      path = ["name"];
      setAt(v, path, at(["Bad_Name", "two words", "UPPER", "-lead", "trail-"], pick));
      break;
    case "bad-semver":
      path = ["version"];
      setAt(v, path, at(["1.0", "v1.2.3", "1.2.3.4", "latest", "01.2.3"], pick));
      break;
    case "bad-effect":
      path = ["permissions", "rules", 0, "effect"];
      setAt(v, path, at(["maybe", "ALLOW", "block"], pick));
      break;
    default:
      return undefined;
  }
  return { text: jsonText(v), path: formatPath(path) };
}

function injectSkillFault(fault: FaultName, s: SkillSample, pick: number): Faulted | undefined {
  switch (fault) {
    case "delete-required": {
      const field = at(["name", "description"] as const, pick);
      const text =
        field === "name"
          ? `---\ndescription: ${s.description}\n---\n${s.body}\n`
          : `---\nname: ${s.name}\n---\n${s.body}\n`;
      return { text, path: field, folder: s.folder };
    }
    case "unknown-field":
      return {
        text: `---\nname: ${s.name}\ndescription: ${s.description}\nauthor: someone\n---\n${s.body}\n`,
        path: "author",
        folder: s.folder,
      };
    case "name-mismatch":
      return { text: skillText(s), path: "name", folder: `${s.folder}-other` };
    default:
      return undefined;
  }
}
