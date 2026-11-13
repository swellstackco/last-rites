// Privilege checks over a parsed agent file. Pure and total: any input shape is accepted, unreadable parts count as absent.

const WRITE_SELECTORS = new Set(["write", "shell", "*", "@builtin", "@mcp", "subagent", "web"]);
const POWER_CAPABILITIES = ["fs_write", "shell", "web_fetch", "subagent"] as const;
const MUST_DENY = ["fs_write", "shell", "web_fetch"] as const;
const DANGEROUS_TOOL = "generate_pin_tests";
/** The string a `git push` deny / allow rule is tested against. */
export const PUSH_SAMPLE = "git push origin x";

interface Rule {
  capability: string;
  effect: string;
  match?: string[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function rulesOf(agent: unknown): Rule[] {
  if (!isObject(agent) || !isObject(agent["permissions"])) return [];
  const rules = agent["permissions"]["rules"];
  if (!Array.isArray(rules)) return [];
  const out: Rule[] = [];
  for (const r of rules) {
    if (!isObject(r) || typeof r["capability"] !== "string" || typeof r["effect"] !== "string") continue;
    const m = r["match"];
    const rule: Rule = { capability: r["capability"], effect: r["effect"] };
    if (Array.isArray(m)) rule.match = m.filter((x): x is string => typeof x === "string");
    out.push(rule);
  }
  return out;
}

function toolsOf(agent: unknown): string[] {
  if (!isObject(agent) || !Array.isArray(agent["tools"])) return [];
  return agent["tools"].filter((x): x is string => typeof x === "string");
}

/**
 * Small glob matcher: `*` matches any run of characters (including `/` and spaces), `?` one character, everything
 * else literally. The whole text must match.
 */
export function globMatch(pattern: string, text: string): boolean {
  let regex = "^";
  for (const ch of pattern) {
    if (ch === "*") regex += ".*";
    else if (ch === "?") regex += ".";
    else regex += ch.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
  }
  return new RegExp(`${regex}$`, "s").test(text);
}

function selectorReason(selector: string): string | undefined {
  if (WRITE_SELECTORS.has(selector)) return `tools: ${selector}`;
  if (selector.startsWith("@")) {
    const slash = selector.indexOf("/");
    if (slash === -1) return `tools: ${selector}`;
    const tool = selector.slice(slash + 1);
    if (tool === DANGEROUS_TOOL || tool.includes("*")) return `tools: ${selector}`;
  }
  return undefined;
}

/**
 * The reasons an agent can write, run commands or reach the network. `[]` means read only.
 * Reasons look like `tools: write`, `rule: allow fs_write`, `rule: allow mcp exorcist/*` or `rule: no deny for shell`.
 */
export function writeCapabilities(agent: unknown): string[] {
  try {
    const reasons: string[] = [];
    for (const sel of toolsOf(agent)) {
      const r = selectorReason(sel);
      if (r !== undefined) reasons.push(r);
    }
    const rules = rulesOf(agent);
    for (const rule of rules) {
      if (rule.effect !== "allow" && rule.effect !== "ask") continue;
      if ((POWER_CAPABILITIES as readonly string[]).includes(rule.capability)) {
        reasons.push(`rule: ${rule.effect} ${rule.capability}`);
      } else if (rule.capability === "mcp") {
        if (rule.match === undefined) {
          reasons.push(`rule: ${rule.effect} mcp (all tools)`);
          continue;
        }
        for (const m of rule.match) {
          if (m.includes(DANGEROUS_TOOL) || m.includes("*")) reasons.push(`rule: ${rule.effect} mcp ${m}`);
        }
      }
    }
    for (const cap of MUST_DENY) {
      const denied = rules.some((r) => r.effect === "deny" && r.capability === cap && r.match === undefined);
      if (!denied) reasons.push(`rule: no deny for ${cap}`);
    }
    return reasons;
  } catch {
    return ["agent could not be inspected"];
  }
}

function ruleMatches(rule: Rule, text: string): boolean {
  return rule.match === undefined || rule.match.some((p) => globMatch(p, text));
}

/**
 * True unless every `shell` allow rule that would match `git push origin x` is preceded by a `shell` deny rule that
 * also matches it. An agent with no matching allow rule cannot push, so the answer is false.
 */
export function pushCapabilities(agent: unknown): boolean {
  try {
    const shell = rulesOf(agent).filter((r) => r.capability === "shell");
    let denied = false;
    for (const rule of shell) {
      if (!ruleMatches(rule, PUSH_SAMPLE)) continue;
      if (rule.effect === "deny") denied = true;
      else if (rule.effect === "allow" && !denied) return true;
    }
    return false;
  } catch {
    return true;
  }
}
