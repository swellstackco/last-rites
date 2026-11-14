// Controller: the Phase state machine. Owns requests, the cooldown, focus on phase change,
// the Detail_Panel and document.title. Every dependency (api, timers, clock, location) is injected.
import type { GradeBand } from "@last-rites/skeleton";
import type { Ecosystem } from "@last-rites/skeleton/proof";
import { isProofName, proofNameFor } from "@last-rites/skeleton/proof";
import { buildProofView } from "@last-rites/skeleton/graveyard";
import type { Grave } from "@last-rites/skeleton/graveyard";
import type { ScannedDependency } from "@last-rites/exorcist-npm/report";
import type { ApiClient, ProofLoad } from "../api/client.js";
import { describeError } from "../api/errors.js";
import type { UiError } from "../api/errors.js";
import { PRODUCT_NAME } from "../constants.js";
import { h } from "../dom/h.js";
import { buildReportView } from "../model/report-view.js";
import type { ReportView } from "../model/report-view.js";
import { createDetail } from "../views/detail.js";
import type { DetailHandle, ProofShown } from "../views/detail.js";
import { renderGraveyard } from "../views/graveyard.js";
import type { GraveyardHandle } from "../views/graveyard.js";
import { renderHeader } from "../views/header.js";
import { cooldownText } from "../views/live-form.js";
import type { LiveFormHandle, LiveFormValues } from "../views/live-form.js";
import { renderPicker } from "../views/picker.js";
import type { PickerHandle } from "../views/picker.js";
import { DEMO_REPOS } from "../model/demo-repos.js";
import { renderError, renderLoading } from "../views/status.js";
import { formatRoute, parseRoute } from "./router.js";
import type { Route } from "./router.js";

export type Source = { kind: "demo"; name: string } | { kind: "live"; repo: string; ref?: string };

export type Phase =
  | { tag: "picker"; prefill?: { repo: string; ref?: string }; notice?: string }
  | { tag: "loading"; source: Source }
  | { tag: "report"; source: Source; view: ReportView; openKey?: string; notice?: string }
  | { tag: "error"; error: UiError; source?: Source };

/** The slice of `location` and `history` the controller uses. */
export interface RouteIO {
  getHash(): string;
  /** Push a new history entry. */
  setHash(hash: string): void;
  /** Replace the current entry without adding history. */
  replaceHash(hash: string): void;
  back(): void;
}

export interface ControllerDeps {
  api: ApiClient;
  io: RouteIO;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
  clock: { now(): number };
  /** The page root (becomes inert while the Detail_Panel is open). */
  appRoot: HTMLElement;
  /** Sibling of appRoot that hosts the Detail_Panel. */
  dialogRoot: HTMLElement;
  document: Document;
  /** Defaults to console.error. */
  logError?: (error: unknown) => void;
}

export interface Controller {
  /** Render the route currently in the location. */
  start(): void;
  /** Call from the hashchange listener. */
  onHashChange(): void;
  phase(): Phase;
  destroy(): void;
}

const NOT_RERUN =
  "Live scans are not re-run when a page is reloaded or a link is opened. Press the scan button to run this one again.";

function sameSource(a: Source, b: Source): boolean {
  if (a.kind === "demo") return b.kind === "demo" && a.name === b.name;
  return b.kind === "live" && a.repo === b.repo && (a.ref ?? "") === (b.ref ?? "");
}

function sourceOfRoute(route: Route): Source | undefined {
  if (route.view === "demo") return { kind: "demo", name: route.name };
  if (route.view === "live") {
    return route.ref === undefined ? { kind: "live", repo: route.repo } : { kind: "live", repo: route.repo, ref: route.ref };
  }
  return undefined;
}

function routeOfSource(source: Source, pkg?: string): Route {
  const route: Route =
    source.kind === "demo"
      ? { view: "demo", name: source.name }
      : source.ref === undefined
        ? { view: "live", repo: source.repo }
        : { view: "live", repo: source.repo, ref: source.ref };
  if (pkg !== undefined) route.pkg = pkg;
  return route;
}

function sourceLabel(source: Source): string {
  return source.kind === "demo" ? source.name : source.repo;
}

export function createController(deps: ControllerDeps): Controller {
  const { io, appRoot, dialogRoot } = deps;
  const doc = deps.document;
  const logError = deps.logError ?? ((e: unknown) => console.error(e));

  let phase: Phase = { tag: "picker" };
  let requestId = 0;
  let abort: AbortController | undefined;
  let appliedHash = "";
  let formValues: LiveFormValues = { repo: "", ref: "" };
  let liveForm: LiveFormHandle | undefined;
  let graveyard: GraveyardHandle | undefined;
  let detail: DetailHandle | undefined;
  let phaseHeading: HTMLElement | undefined;
  let openedFromList = false;
  let reportNotice: HTMLElement | undefined;
  let cooldownUntil: number | undefined;
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
  let renderFailed = false;
  let destroyed = false;
  // Proof requests: once per (demo, package) per page session; aborted when the route changes.
  const proofsStarted = new Set<string>();
  const proofsSettled = new Map<string, ProofShown>();
  let proofAbort: AbortController | undefined;
  // Dead_Counts of the demo snapshots shown on the picker's cards: read once per session, painted at once on return.
  const demoDead = new Map<string, number>();
  let demoAbort: AbortController | undefined;
  let pickerHandle: PickerHandle | undefined;

  // One persistent live region; written at the start and at the end of a cooldown only.
  const announce = h("div", { class: "visually-hidden", role: "status", id: "announce" });
  const screen = h("div", { class: "screen" });
  appRoot.replaceChildren(announce, screen);

  // ---- cooldown ---------------------------------------------------------------------------

  const secondsLeft = (): number | undefined => {
    if (cooldownUntil === undefined) return undefined;
    const left = Math.ceil((cooldownUntil - deps.clock.now()) / 1000);
    return left > 0 ? left : undefined;
  };

  const paintCooldown = (): void => {
    const left = secondsLeft();
    liveForm?.setCooldown(left);
    for (const el of Array.from(appRoot.querySelectorAll("[data-countdown='error']"))) {
      el.textContent = left === undefined ? "You can scan again now" : cooldownText(left);
    }
  };

  const stopCooldown = (): void => {
    if (cooldownTimer !== undefined) deps.clearTimeout(cooldownTimer);
    cooldownTimer = undefined;
  };

  const tick = (): void => {
    cooldownTimer = undefined;
    if (destroyed) return;
    if (secondsLeft() === undefined) {
      cooldownUntil = undefined;
      paintCooldown();
      announce.textContent = "You can scan again now";
      return;
    }
    paintCooldown();
    cooldownTimer = deps.setTimeout(tick, 1000);
  };

  const startCooldown = (seconds: number): void => {
    stopCooldown();
    cooldownUntil = deps.clock.now() + seconds * 1000;
    announce.textContent = cooldownText(seconds);
    paintCooldown();
    cooldownTimer = deps.setTimeout(tick, 1000);
  };

  // ---- rendering --------------------------------------------------------------------------

  const setTitle = (text: string): void => {
    doc.title = text === "" ? PRODUCT_NAME : `${text} - ${PRODUCT_NAME}`;
  };

  const captureForm = (): void => {
    if (liveForm) formValues = liveForm.values();
  };

  const teardownScreen = (): void => {
    captureForm();
    demoAbort?.abort();
    demoAbort = undefined;
    pickerHandle = undefined;
    detail?.destroy();
    detail = undefined;
    graveyard = undefined;
    liveForm = undefined;
    reportNotice = undefined;
    openedFromList = false;
  };

  const navigate = (route: Route): void => {
    const hash = formatRoute(route);
    appliedHash = hash;
    if (io.getHash() !== hash) io.setHash(hash);
  };

  const gravesOf = (view: ReportView): Array<Grave<ScannedDependency>> =>
    view.graveyard.groups.flatMap((g) => g.graves);

  const findGrave = (view: ReportView, key: string): Grave<ScannedDependency> | undefined =>
    gravesOf(view).find((g) => g.key === key);

  const closeDetailLocal = (): void => {
    detail?.close();
    if (phase.tag === "report") delete phase.openKey;
  };

  const shownFor = (load: ProofLoad): ProofShown => {
    if (load.ok) return { state: { status: "report", view: buildProofView(load.report) } };
    return load.reason === "invalid"
      ? { state: { status: "coming_soon" }, unreadable: true }
      : { state: { status: "coming_soon" } };
  };

  /** The proof to show when a panel opens, starting the request on the first open. */
  const proofFor = (
    source: Source,
    grave: Grave<ScannedDependency>,
    ecosystem: Ecosystem,
  ): ProofShown | undefined => {
    const grade = grave.record.death.grade;
    if (source.kind !== "demo") return undefined;
    // Ailing and alive packages show a Proof_Section only for a readable report (no placeholder, no loading line).
    const reportOnly = grade === "ailing" || grade === "alive";
    const pkg = proofNameFor(ecosystem, grave.record.name);
    if (!isProofName(source.name) || pkg === undefined) return undefined;
    const key = `${source.name}/${pkg}`;
    const settled = proofsSettled.get(key);
    if (settled) return reportOnly && settled.state.status !== "report" ? undefined : settled;
    if (!proofsStarted.has(key)) {
      proofsStarted.add(key);
      const controller = (proofAbort ??= new AbortController());
      void deps.api.getProof(source.name, pkg, controller.signal).then(
        (result) => {
          if (destroyed) return;
          if (!result.ok && result.reason === "cancelled") return;
          const shown = shownFor(result);
          proofsSettled.set(key, shown);
          if (phase.tag === "report" && phase.source.kind === "demo" && phase.source.name === source.name) {
            detail?.updateProof(grave.key, shown);
          }
        },
        (error: unknown) => {
          logError(error);
          proofsStarted.delete(key);
        },
      );
    }
    return reportOnly ? undefined : { state: { status: "loading" } };
  };

  /** Paints the known counts and reads the other snapshots; a failed or unreadable read is ignored (retried on the next picker). */
  const loadDemoCounts = (picker: PickerHandle): void => {
    pickerHandle = picker;
    const controller = (demoAbort = new AbortController());
    for (const demo of DEMO_REPOS) {
      const known = demoDead.get(demo.name);
      if (known !== undefined) {
        picker.setDemoDead(demo.name, known);
        continue;
      }
      deps.api.getDemo(demo.name, controller.signal).then(
        (result) => {
          if (destroyed || controller.signal.aborted || pickerHandle !== picker || !result.ok) return;
          try {
            const dead = buildReportView(result.report, "demo").header.counts.dead;
            demoDead.set(demo.name, dead);
            picker.setDemoDead(demo.name, dead);
          } catch {
            // An unreadable snapshot adds nothing to the card.
          }
        },
        () => {},
      );
    }
  };

  const syncDetail = (pkg: string | undefined): void => {
    if (phase.tag !== "report" || !detail || !graveyard) return;
    const current = phase;
    if (pkg === undefined) {
      reportNotice?.replaceChildren();
      closeDetailLocal();
      return;
    }
    const grave = findGrave(current.view, pkg);
    if (!grave) {
      closeDetailLocal();
      reportNotice?.replaceChildren(h("p", { class: "notice", role: "status" }, `No package named ${pkg} in this scan`));
      return;
    }
    reportNotice?.replaceChildren();
    if (grave.record.death.grade === "alive") graveyard.expandAlive();
    const gy = graveyard;
    const heading = phaseHeading;
    current.openKey = pkg;
    const ecosystem = current.view.header.ecosystem;
    const proof = proofFor(current.source, grave, ecosystem);
    detail.open(grave, {
      ecosystem,
      ...(proof ? { proof } : {}),
      opener: gy.tombstoneFor(grave.key),
      fallbacks: () => [gy.groupHeading(grave.record.death.grade as GradeBand), heading],
    });
  };

  const requestClose = (): void => {
    if (phase.tag !== "report") return;
    const route = routeOfSource(phase.source);
    if (openedFromList) {
      openedFromList = false;
      closeDetailLocal();
      io.back();
    } else {
      const hash = formatRoute(route);
      appliedHash = hash;
      io.replaceHash(hash);
      closeDetailLocal();
    }
  };

  const openFromList = (grave: Grave<ScannedDependency>): void => {
    if (phase.tag !== "report") return;
    openedFromList = true;
    navigate(routeOfSource(phase.source, grave.key));
    syncDetail(grave.key);
  };

  const renderPhase = (): void => {
    teardownScreen();
    const p = phase;
    switch (p.tag) {
      case "picker": {
        const picker = renderPicker({
          prefill: p.prefill ? { repo: p.prefill.repo, ref: p.prefill.ref ?? "" } : formValues,
          ...(p.notice ? { notice: p.notice } : {}),
          onOpenDemo: (name) => {
            captureForm();
            navigate({ view: "demo", name });
            load({ kind: "demo", name }, undefined);
          },
          onSubmitLive: (input, raw) => {
            formValues = raw;
            const source: Source = input.ref === undefined ? { kind: "live", repo: input.repo } : { kind: "live", repo: input.repo, ref: input.ref };
            load(source, undefined);
          },
        });
        liveForm = picker.form;
        screen.replaceChildren(picker.element);
        phaseHeading = picker.heading;
        setTitle("");
        paintCooldown();
        loadDemoCounts(picker);
        break;
      }
      case "loading": {
        const view = renderLoading({
          label: sourceLabel(p.source),
          kind: p.source.kind,
          onCancel: cancel,
        });
        screen.replaceChildren(view.element);
        phaseHeading = view.heading;
        setTitle(`Loading ${sourceLabel(p.source)}`);
        break;
      }
      case "error": {
        const source = p.source;
        const view = renderError({
          error: p.error,
          ...(p.error.retryable
            ? {
                onRetry: () => {
                  if (p.error.code === "rate_limited" && secondsLeft() !== undefined) return;
                  if (source) load(source, undefined);
                  else goPicker();
                },
              }
            : {}),
          onBack: goPicker,
        });
        if (view.retry && p.error.code === "rate_limited") {
          view.retry.setAttribute("aria-disabled", secondsLeft() === undefined ? "false" : "true");
        }
        screen.replaceChildren(view.element);
        phaseHeading = view.heading;
        setTitle(p.error.title);
        paintCooldown();
        break;
      }
      case "report": {
        const header = renderHeader({
          header: p.view.header,
          onFocusGroup: (grade) => {
            // Tasks 7.3 and 8.7: the alive count control expands the disclosure, then focuses it.
            if (grade === "alive") graveyard?.expandAlive();
            graveyard?.focusGroup(grade);
          },
        });
        graveyard = renderGraveyard({
          view: p.view.graveyard,
          skipped: p.view.skipped,
          onOpen: (grave) => openFromList(grave),
        });
        reportNotice = h("div", null);
        const main = h("main", { class: "stack" }, reportNotice, graveyard.element);
        screen.replaceChildren(h("div", { class: ["app", "stack"] }, header.element, main));
        phaseHeading = header.heading;
        detail = createDetail({ appRoot, host: dialogRoot, onRequestClose: requestClose });
        setTitle(p.view.header.repo);
        break;
      }
    }
    phaseHeading?.focus();
  };

  /** Render with a catch at the phase boundary: a throwing view shows unknown_error, not a blank page. */
  const render = (): void => {
    try {
      renderPhase();
      renderFailed = false;
    } catch (error) {
      logError(error);
      if (renderFailed) return; // do not loop if the error screen itself throws
      renderFailed = true;
      const source = phase.tag === "report" || phase.tag === "loading" ? phase.source : undefined;
      phase = { tag: "error", error: describeError({ status: undefined, body: { error: { code: "unknown" } } }), ...(source ? { source } : {}) };
      render();
    }
  };

  // ---- transitions ------------------------------------------------------------------------

  const abortInFlight = (): void => {
    proofAbort?.abort();
    proofAbort = undefined;
    for (const k of Array.from(proofsStarted)) if (!proofsSettled.has(k)) proofsStarted.delete(k);
    abort?.abort();
    abort = undefined;
    requestId++;
  };

  const goPicker = (): void => {
    abortInFlight();
    captureForm();
    phase = { tag: "picker" };
    navigate({ view: "picker" });
    render();
  };

  const cancel = (): void => {
    abortInFlight();
    phase = { tag: "picker" };
    navigate({ view: "picker" });
    render();
  };

  function load(source: Source, pkg: string | undefined): void {
    abortInFlight();
    const id = requestId;
    const controller = new AbortController();
    abort = controller;
    phase = { tag: "loading", source };
    render();

    const run =
      source.kind === "demo"
        ? deps.api.getDemo(source.name, controller.signal)
        : deps.api.scanRepo(source.ref === undefined ? { repo: source.repo } : { repo: source.repo, ref: source.ref }, controller.signal);

    run.then(
      (result) => {
        if (destroyed || id !== requestId) return;
        abort = undefined;
        try {
          if (result.ok) {
            const view = buildReportView(result.report, source.kind);
            phase = { tag: "report", source, view, ...(pkg !== undefined ? { openKey: pkg } : {}) };
            if (source.kind === "live") navigate(routeOfSource(source, pkg));
            render();
            if (pkg !== undefined) syncDetail(pkg);
          } else if ("cancelled" in result) {
            return;
          } else {
            phase = { tag: "error", error: result.error, source };
            if (result.error.code === "rate_limited" && result.error.retryAfterSeconds !== undefined) {
              startCooldown(result.error.retryAfterSeconds);
            }
            render();
          }
        } catch (error) {
          logError(error);
          phase = { tag: "error", error: describeError({ kind: "parse", parse: { category: "page", message: "could not show the result" } }), source };
          renderFailed = false;
          render();
        }
      },
      (error: unknown) => {
        if (destroyed || id !== requestId) return;
        logError(error);
        phase = { tag: "error", error: describeError({ kind: "network" }), source };
        render();
      },
    );
  }

  const applyRoute = (route: Route): void => {
    if (route.view === "picker") {
      if (phase.tag === "picker" && phase.prefill === undefined && phase.notice === undefined) return;
      abortInFlight();
      phase = { tag: "picker" };
      render();
      return;
    }
    const source = sourceOfRoute(route) as Source;
    if (phase.tag === "report" && sameSource(phase.source, source)) {
      syncDetail(route.pkg);
      return;
    }
    if (phase.tag === "loading" && sameSource(phase.source, source)) return;
    if (route.view === "demo") {
      load(source, route.pkg);
      return;
    }
    // A live route never starts a scan.
    abortInFlight();
    phase = {
      tag: "picker",
      prefill: route.ref === undefined ? { repo: route.repo, ref: "" } : { repo: route.repo, ref: route.ref },
      notice: NOT_RERUN,
    };
    render();
  };

  return {
    start() {
      const hash = io.getHash();
      appliedHash = hash;
      applyRoute(parseRoute(hash));
      if (phase.tag === "picker" && screen.childElementCount === 0) render();
    },
    onHashChange() {
      const hash = io.getHash();
      if (hash === appliedHash) return;
      appliedHash = hash;
      applyRoute(parseRoute(hash));
    },
    phase: () => phase,
    destroy() {
      destroyed = true;
      stopCooldown();
      abortInFlight();
      teardownScreen();
    },
  };
}
