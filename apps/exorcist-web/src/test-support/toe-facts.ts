// Rendered_Facts for the Toe Tag redesign: what the page shows about a Scan_Report and a Proof_Report,
// read through the Fact_Hooks only (stable classes and attributes). It never reads layout classes,
// Tag_Labels, decorative spans or the markup of the Source column (only its text and anchor attributes).
// Plain objects with null instead of undefined, so JSON.stringify is a faithful deep-equality.

export interface HeaderFacts {
  heading: string;
  /** The scan info line: the last `p.meta` of the header. */
  meta: string;
  counts: Array<{ grade: string; count: string; label: string }>;
  legend: string;
  /** Summary-disagrees notice and ranges-only note, in DOM order. */
  notices: string[];
  warnings: string[];
}

export interface GroupFacts {
  grade: string;
  title: string;
  keys: string[];
}

export interface TagFacts {
  key: string;
  grade: string;
  /** The accessible name (`aria-label`). */
  label: string;
  name: string;
  /** The visible score number (the aria-hidden span). */
  score: string;
  /** The visually hidden score sentence. */
  scoreText: string;
  /** The Band word. */
  gradeWord: string;
  summary: string;
  badge: string | null;
  badgeLabel: string | null;
}

export interface SourceFacts {
  text: string;
  href: string | null;
  target: string | null;
  rel: string | null;
  label: string | null;
}

export interface RowFacts {
  kind: "signal" | "calibration";
  /** Full text of the row header cell (label, explanation, unknown detail). */
  signal: string;
  explanation: string;
  value: string;
  status: string;
  points: string;
  source: SourceFacts;
}

export interface BreakdownFacts {
  caption: string;
  rows: RowFacts[];
  totalLabel: string;
  total: string;
  mismatches: string[];
}

export interface AttemptFacts {
  /** Text nodes of the item itself, for example "Attempt 2: candidate". */
  headline: string;
  badge: string;
  badgeKind: string;
  /** Direct paragraphs: runs and seed, sabotage line, error text. */
  lines: string[];
  heading: string | null;
  /** Each `pre.proof-pre` with the label above it; `text` is byte for byte. */
  blocks: Array<{ label: string; text: string }>;
}

export interface ProofFacts {
  heading: string;
  /** Paragraphs outside the call-site disclosure and the attempts list, in DOM order (not trimmed). */
  lines: string[];
  /** The Stamp text and its kind, or null when no report is loaded. */
  badge: string | null;
  badgeKind: string | null;
  /** The disabled "Start exorcism" control: its text and `aria-disabled`, or null. */
  control: { text: string; ariaDisabled: string | null } | null;
  sitesSummary: string | null;
  sites: string[];
  attempts: AttemptFacts[];
}

export interface ToeFacts {
  header: HeaderFacts | null;
  groups: GroupFacts[];
  tombstones: TagFacts[];
  skipped: string[];
  breakdown: BreakdownFacts | null;
  proof: ProofFacts | null;
}

const trimmed = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();
const raw = (el: Element | null | undefined): string => el?.textContent ?? "";
const all = <T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

export function headerFacts(root: ParentNode): HeaderFacts | null {
  const header = root.querySelector("header.header");
  if (!header) return null;
  const metas = all(header, "p.meta");
  return {
    heading: trimmed(header.querySelector("h1")),
    meta: trimmed(metas[metas.length - 1]),
    counts: all(header, "ul.counts button[data-grade]").map((b) => ({
      grade: b.getAttribute("data-grade") ?? "",
      count: trimmed(b.querySelector(".num")),
      label: b.getAttribute("aria-label") ?? "",
    })),
    legend: trimmed(header.querySelector("p.legend")),
    notices: all(header, "p.notice, p.note").map((p) => trimmed(p)),
    warnings: all(header, ".warnings li").map((li) => trimmed(li)),
  };
}

export function tagFacts(button: Element): TagFacts {
  const score = button.querySelector(".tomb-score");
  const badge = button.querySelector(".tomb-badge");
  return {
    key: button.getAttribute("data-key") ?? "",
    grade: button.getAttribute("data-grade") ?? "",
    label: button.getAttribute("aria-label") ?? "",
    name: trimmed(button.querySelector(".tomb-name")),
    score: trimmed(score?.querySelector(":scope > span:not(.visually-hidden)")),
    scoreText: trimmed(score?.querySelector(".visually-hidden")),
    gradeWord: trimmed(button.querySelector(".tomb-grade")),
    summary: trimmed(button.querySelector(".tomb-summary")),
    badge: badge ? trimmed(badge) : null,
    badgeLabel: badge ? badge.getAttribute("aria-label") : null,
  };
}

function sourceFacts(td: Element | null): SourceFacts {
  const a = td?.querySelector("a") ?? null;
  return {
    text: trimmed(td),
    href: a ? a.getAttribute("href") : null,
    target: a ? a.getAttribute("target") : null,
    rel: a ? a.getAttribute("rel") : null,
    label: a ? a.getAttribute("aria-label") : null,
  };
}

export function breakdownFacts(root: ParentNode): BreakdownFacts | null {
  const table = root.querySelector("table.breakdown");
  if (!table) return null;
  const rows = all(table, "tbody > tr").map((tr): RowFacts => {
    const cell = (label: string): Element | null => tr.querySelector(`td[data-label='${label}']`);
    return {
      kind: tr.parentElement?.classList.contains("calibration") ? "calibration" : "signal",
      signal: trimmed(tr.querySelector("th")),
      explanation: trimmed(tr.querySelector("th .muted")),
      value: trimmed(cell("Value")),
      status: trimmed(cell("Status")),
      points: trimmed(cell("Points")),
      source: sourceFacts(cell("Source")),
    };
  });
  const total = table.querySelector("tfoot tr.total");
  return {
    caption: trimmed(table.querySelector("caption")),
    rows,
    totalLabel: trimmed(total?.querySelector("th")),
    total: trimmed(total?.querySelector("td[data-label='Total'] .num")),
    mismatches: all(table, "tfoot tr.mismatch").map((tr) => trimmed(tr)),
  };
}

function attemptFacts(li: Element): AttemptFacts {
  const badge = li.querySelector(":scope > .proof-badge");
  const headline = Array.from(li.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
  return {
    headline,
    badge: raw(badge),
    badgeKind: kindOf(badge),
    lines: all(li, ":scope > p").map((p) => raw(p)),
    heading: li.querySelector("h4") ? trimmed(li.querySelector("h4")) : null,
    blocks: all(li, "pre.proof-pre").map((pre) => ({
      label: trimmed(pre.previousElementSibling),
      text: raw(pre),
    })),
  };
}

function kindOf(badge: Element | null): string {
  if (!badge) return "";
  return (
    Array.from(badge.classList)
      .find((c) => c.startsWith("proof-badge-"))
      ?.slice("proof-badge-".length) ?? ""
  );
}

export function proofFacts(root: ParentNode): ProofFacts | null {
  const section = root.querySelector("section.proof");
  if (!section) return null;
  const lines = all(section, "p")
    .filter((p) => !p.closest("ol.proof-attempts") && !p.closest("details.proof-sites"))
    .map((p) => raw(p));
  const topBadge = all(section, ".proof-badge").find((b) => !b.closest("ol.proof-attempts")) ?? null;
  const control = section.querySelector("button");
  const sites = section.querySelector("details.proof-sites");
  return {
    heading: trimmed(section.querySelector("h3")),
    lines,
    badge: topBadge ? raw(topBadge) : null,
    badgeKind: topBadge ? kindOf(topBadge) : null,
    control: control ? { text: trimmed(control), ariaDisabled: control.getAttribute("aria-disabled") } : null,
    sitesSummary: sites ? trimmed(sites.querySelector("summary")) : null,
    sites: sites ? all(sites, "li").map((li) => raw(li)) : [],
    attempts: all(section, "ol.proof-attempts > li").map(attemptFacts),
  };
}

export function toeFacts(root: ParentNode): ToeFacts {
  return {
    header: headerFacts(root),
    groups: all(root, "section.group").map((s) => ({
      grade: s.id.replace(/^group-/, ""),
      title: trimmed(s.querySelector("h2")),
      keys: all(s, "button.tombstone").map((b) => b.getAttribute("data-key") ?? ""),
    })),
    tombstones: all(root, "button.tombstone").map(tagFacts),
    skipped: all(root, "details.skipped li").map((li) => trimmed(li)),
    breakdown: breakdownFacts(root),
    proof: proofFacts(root),
  };
}

// ---- toe-tag-polish: panel proof presence and the Repo_Picker -------------------------------------------

/** True when the open panel (or any part of `root`) has a Proof_Section. */
export function proofPresent(root: ParentNode): boolean {
  return root.querySelector("section.proof") !== null;
}

export interface DemoCardFacts {
  demo: string;
  name: string;
  repo: string;
  blurb: string;
  snapshot: string;
  /** The "N dead" text, or null when the card shows no count. */
  dead: string | null;
}

export interface LiveFormFacts {
  title: string;
  labels: Array<{ for: string; text: string }>;
  inputs: Array<{ id: string; name: string; placeholder: string; value: string; describedBy: string | null }>;
  summary: string | null;
  detailsOpen: boolean | null;
  submit: string;
  submitAriaDisabled: string | null;
  /** Every `p.muted` of the form, in DOM order (hints and limits). */
  hints: string[];
}

export interface PickerFacts {
  /** The text of the one `h1` and its tabindex. */
  heading: { text: string; tabindex: string | null } | null;
  demoNote: string;
  notice: string | null;
  cards: DemoCardFacts[];
  form: LiveFormFacts | null;
}

export function pickerFacts(root: ParentNode): PickerFacts {
  const h1 = root.querySelector("h1");
  const form = root.querySelector("form.live-form");
  const notice = root.querySelector("main > p.notice");
  return {
    heading: h1 ? { text: trimmed(h1), tabindex: h1.getAttribute("tabindex") } : null,
    demoNote: trimmed(root.querySelector("section[aria-labelledby='demo-title'] > p.muted")),
    notice: notice ? trimmed(notice) : null,
    cards: all(root, "ul.demo-cards button.demo-card").map((button): DemoCardFacts => {
      const spans = all(button, ":scope > span:not(.tag-hole):not(.demo-dead)");
      const dead = button.querySelector(":scope > .demo-dead");
      return {
        demo: button.getAttribute("data-demo") ?? "",
        name: trimmed(spans[0]),
        repo: trimmed(spans[1]),
        blurb: trimmed(spans[2]),
        snapshot: trimmed(spans[3]),
        dead: dead ? trimmed(dead) : null,
      };
    }),
    form: form
      ? {
          title: trimmed(form.querySelector("h2")),
          labels: all(form, "label").map((l) => ({ for: l.getAttribute("for") ?? "", text: trimmed(l) })),
          inputs: all<HTMLInputElement>(form, "input").map((i) => ({
            id: i.id,
            name: i.getAttribute("name") ?? "",
            placeholder: i.getAttribute("placeholder") ?? "",
            value: i.value,
            describedBy: i.getAttribute("aria-describedby"),
          })),
          summary: form.querySelector("details > summary") ? trimmed(form.querySelector("details > summary")) : null,
          detailsOpen: form.querySelector("details") ? (form.querySelector("details") as HTMLDetailsElement).open : null,
          submit: trimmed(form.querySelector("button[type='submit']")),
          submitAriaDisabled: form.querySelector("button[type='submit']")?.getAttribute("aria-disabled") ?? null,
          hints: all(form, "p.muted").map((p) => trimmed(p)),
        }
      : null,
  };
}
