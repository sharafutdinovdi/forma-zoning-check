import "./styles.css";
import { serializeCsv } from "./csv";
import { buildingFootprintArea, checkSite } from "./metrics";
import type { Report, SiteData } from "./metrics";
import { fixtureControls, fixtureData, fixtureStates } from "./fixture";
import type { AppState } from "./fixture";
import { loadControls, saveControls, usePreset } from "./rules";
import type { ParcelControls } from "./rules";
import { createApp, renderState, showNotice } from "./ui/app";
import { renderControls, wireControls, styleNumbers } from "./ui/controls";
import { format, renderResults, wireResults } from "./ui/results";
import { createMini, renderMini, relativeTime } from "./ui/mini";
import { createSync, autoRefresh } from "./sync";
import type { SyncMessage } from "./sync";

const isHost = window.self !== window.top;
const params = new URLSearchParams(window.location.search);
const urlDebug = params.get("debug") === "1";
let storedDebug = false;
try { storedDebug = localStorage.getItem("zc-debug") === "1"; } catch {}
const debug = () => urlDebug || storedDebug;
let debugStarted = false, debugRevision = 0;
const fixture = !isHost && params.get("fixture") === "1";
const existingOnly = fixture && params.get("existingOnly") === "1";
let state: AppState = "loading";
let data: SiteData | null = null;
let report: Report | null = null;
let controls = fixture ? fixtureControls() : usePreset("dubai-master");
let request = 0, overlayRevision = 0, computedAt = 0;
let activeProposal = "", activeRoot: string | undefined;
let message = "", notices: string[] = [], storageWarning = "";
let disposed = false, openSupported = true;
let stopWatching = () => {};
const root = document.querySelector("main")!;
createApp(root, fixture, debug());
const debugButton = document.querySelector<HTMLButtonElement>("#debug-download")!;
let titleClicks: number[] = [];
root.querySelector("header h1")!.addEventListener("click", () => {
  const now = performance.now();
  titleClicks = titleClicks.filter(time => now - time <= 2000);
  titleClicks.push(now);
  if (titleClicks.length < 5) return;
  titleClicks = [];
  storedDebug = !storedDebug;
  try {
    if (storedDebug) localStorage.setItem("zc-debug", "1");
    else localStorage.removeItem("zc-debug");
  } catch {}
  debugButton.hidden = !debug();
  if (debug() && isHost && data && state !== "loading" && !debugStarted) void prepareDebugDump(data);
});
const controlsEl = document.querySelector<HTMLElement>("#controls")!;
const resultsEl = document.querySelector<HTMLElement>("#results")!;
const miniEl = document.querySelector<HTMLElement>("#mini")!;
createMini(miniEl);
const plotKey = () => JSON.stringify(data?.plot ?? []);
new ResizeObserver(([entry]) => { root.classList.toggle("is-mini", entry.contentRect.width < 300); }).observe(document.body);

function drawControls(): void {
  const active = document.activeElement as HTMLElement | null;
  const focusId = controlsEl.contains(active) ? active?.id : undefined;
  const focusEdge = controlsEl.contains(active) ? active?.dataset.edge : undefined;
  const open = controlsEl.querySelector<HTMLDetailsElement>("details")?.open ?? false;
  renderControls(controlsEl, controls, data?.plot ?? null);
  controlsEl.querySelector<HTMLDetailsElement>("details")!.open = open;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  if (focusEdge !== undefined) controlsEl.querySelector<HTMLElement>(`[data-edge="${Number(focusEdge)}"]`)?.focus({ preventScroll: true });
}
function notice(): void {
  const text = [...notices, storageWarning].filter(Boolean).join(" ");
  showNotice(text);
  const el = miniEl.querySelector<HTMLElement>(".mini-notice")!;
  const empty = state === "ready" && report?.buildings.length === 0 ? "No proposal buildings on plot. Add a proposal volume, or count existing buildings in the full panel." : "";
  el.textContent = [empty, text].filter(Boolean).join(" "); el.hidden = !el.textContent;
}
function draw(): void {
  renderState(state, data, controls, message);
  controlsEl.inert = state === "loading";
  resultsEl.inert = state !== "ready";
  drawControls();
  if (state === "ready" && data && report) {
    renderResults(resultsEl, report, data, controls, computedAt);
    // Adapt the existing results component without changing its layout or motion.
    resultsEl.querySelectorAll<HTMLElement>(".building-values").forEach((el, index) => {
      const b = report!.buildings[index].building;
      el.textContent = `${format(b.floors, "floors")} floors${b.floorsEstimated ? " (est.)" : ""} · ${format(buildingFootprintArea(b), "m²")} m² footprint · ${format(b.height, "m")} m height · ${b.geometrySource ?? "unavailable"}`;
    });
    resultsEl.querySelectorAll<HTMLElement>(".estimate").forEach(el => {
      const id = el.closest<HTMLElement>("[data-check]")?.dataset.check;
      const check = report!.checks.find(c => c.id === id);
      el.textContent = id === "far" && report!.buildings.some(b => b.building.floorsEstimated) ? "est." : check?.value === null ? "unavailable" : "model";
    });
    styleNumbers(resultsEl);
  }
  renderMini(miniEl, state, data, controls, report, computedAt, message);
  notice();
  if (debug() && isHost && data && state !== "loading" && !debugStarted) void prepareDebugDump(data);
}
async function prepareDebugDump(snapshot: SiteData): Promise<void> {
  debugStarted = true;
  const revision = ++debugRevision;
  const button = debugButton;
  try {
    const { loadDebugDump } = await import("./forma");
    const dump = await loadDebugDump(snapshot);
    if (disposed || revision !== debugRevision) return;
    if (debug()) console.log("Zoning Check: debug dump", dump);
    const json = JSON.stringify(dump, null, 2);
    button.disabled = false; button.title = `Debug snapshot: ${dump.proposalId}`;
    button.onclick = () => {
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = `zoning-check-debug-${dump.proposalId}.json`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      storedDebug = false;
      try { localStorage.removeItem("zc-debug"); } catch {}
      button.hidden = !debug();
    };
  } catch (error) {
    if (disposed || revision !== debugRevision) return;
    console.error("Zoning Check: debug dump failed", error);
    button.title = "Debug data unavailable; press Refresh to retry";
    debugStarted = false;
  }
}
function publish(): void {
  if (!data || state === "loading") return;
  computedAt = Math.max(Date.now(), computedAt + 1);
  sync.publish({ proposalId: data.proposalId, computedAt, results: { state, data, report, message }, controls });
}
function persist(): void {
  if (data) storageWarning = saveControls(data.proposalId, controls, plotKey()) ? "" : "Controls are kept for this session only; browser storage is unavailable.";
}
async function clearLocalOverlays(): Promise<void> {
  if (isHost) { const { clearOverlays } = await import("./render"); await clearOverlays(); }
}
const sync = createSync((incoming: SyncMessage) => {
  if (disposed || incoming.proposalId !== activeProposal || incoming.results.data.rootUrn !== activeRoot || incoming.computedAt <= computedAt) return;
  request++; overlayRevision++;
  ({ state, data, report, message } = incoming.results);
  controls = incoming.controls; computedAt = incoming.computedAt;
  notices = data.warnings; persist(); sync.remember(incoming); draw();
  // The computing view owns meshes; avoid stacking translucent copies from peers.
  void clearLocalOverlays().catch(error => console.warn("Zoning Check: peer overlay cleanup", error));
});
async function updateOverlays(): Promise<void> {
  if (!isHost || state !== "ready" || !data || !report || disposed) return;
  const revision = ++overlayRevision;
  const snapshot = data, settings = structuredClone(controls), results = report;
  try {
    const { renderOverlays } = await import("./render");
    if (revision !== overlayRevision || disposed) return;
    const warnings = await renderOverlays(snapshot, settings, results);
    if (revision === overlayRevision && !disposed) { notices = [...snapshot.warnings, ...warnings]; notice(); }
  } catch (error) {
    console.error("Zoning Check: overlays failed", error);
    if (revision === overlayRevision && !disposed) { notices = [...snapshot.warnings, "3D overlays unavailable; refresh to retry. Numeric results remain available."]; notice(); }
  }
}
async function load(target?: AppState): Promise<void> {
  const token = ++request;
  debugRevision++; debugStarted = false;
  debugButton.disabled = true; debugButton.onclick = null;
  debugButton.title = "Waiting for real Forma element data";
  overlayRevision++;
  state = "loading"; report = null; message = ""; notices = []; draw();
  try {
    await clearLocalOverlays();
    let loaded: SiteData;
    if (fixture) {
      const requested = target ?? params.get("state") ?? "ready";
      const next = fixtureStates.includes(requested as AppState) ? requested as AppState : "ready";
      loaded = fixtureData(next, params.get("existing") === "1", existingOnly);
      if (next === "loading") { data = loaded; draw(); return; }
      if (next === "error") throw new Error("Synthetic fixture error");
    } else if (isHost) {
      const { loadSite } = await import("./forma"); loaded = await loadSite();
    } else throw new Error("Open Zoning Check in Forma, or use ?fixture=1 for the synthetic preview.");
    if (token !== request || disposed) return;
    const sameProposal = data?.proposalId === loaded.proposalId;
    const oldPlot = plotKey();
    data = loaded; activeProposal = data.proposalId; activeRoot = data.rootUrn;
    controls = loadControls(data.proposalId, plotKey()) ?? (sameProposal ? controls : fixture ? fixtureControls() : usePreset("dubai-master"));
    if (sameProposal && oldPlot !== plotKey()) controls.roadEdges = [];
    if (data.plot) controls.roadEdges = controls.roadEdges.filter(n => n < data!.plot!.length);
    notices = data.warnings;
    if (existingOnly && !sameProposal) controls.includeExisting = false;
    recompute();
    publish(); draw(); await updateOverlays();
  } catch (error) {
    if (token !== request || disposed) return;
    console.error("Zoning Check: could not load proposal", error);
    state = "error"; data = null; report = null;
    message = fixture ? "Preview error: could not read proposal. Choose Ready to retry." : error instanceof Error && /site limit|Site limit|Proposal changed|Open Zoning Check/.test(error.message) ? error.message : "Could not read proposal; press Refresh.";
    draw();
  }
}
function recompute(): void {
  if (!data) return;
  const counted = data.buildings.filter(b => controls.includeExisting || b.kind !== "existing");
  const excluded = data.buildings.length - counted.length;
  state = !data.plot ? "no-site-limit" : counted.length ? "ready" : excluded ? "no-buildings-on-plot" : data.incompleteGeometry ? "error" : "no-buildings-on-plot";
  message = state === "no-buildings-on-plot" && excluded
    ? `${excluded} existing buildings on the plot are excluded — enable 'Count existing buildings on plot' to include them`
    : state === "error" ? "Building footprints could not be read; check model geometry and refresh." : "";
  report = state === "ready" ? checkSite(data, controls) : null;
}
function changeControls(next: ParcelControls): void {
  controls = next; persist();
  if (state === "ready" || state === "no-buildings-on-plot") recompute();
  publish(); draw();
  if (state === "ready") void updateOverlays();
  else {
    overlayRevision++;
    void clearLocalOverlays().catch(error => console.warn("Zoning Check: overlay cleanup", error));
  }
}
wireControls(controlsEl, () => controls, changeControls);
document.querySelector("#state-message")!.addEventListener("click", event => {
  if ((event.target as Element).closest("#include-existing")) {
    changeControls({ ...controls, includeExisting: true });
    document.getElementById("includeExisting")?.focus({ preventScroll: true });
  }
});
wireResults(resultsEl);
document.querySelector("#refresh")!.addEventListener("click", () => void load(fixture ? "ready" : undefined));
document.querySelector("#fixture-state")?.addEventListener("change", e => void load((e.target as HTMLSelectElement).value as AppState));
document.querySelector("#export")!.addEventListener("click", () => {
  if (!data || !report || state !== "ready") return;
  try {
    const csv = serializeCsv(data, controls, report);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `zoning-check-${data.proposalId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.csv`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  catch (error) { console.error("Zoning Check: CSV export failed", error); notices.push("Could not export CSV; try again."); notice(); }
});
async function openFull(): Promise<void> {
  if (!openSupported) return;
  try {
    if (fixture) { window.open(window.location.href, "zoning-check-preview", "width=440,height=720"); return; }
    if (!isHost) throw new Error("No host");
    const { openFullPanel } = await import("./forma"); await openFullPanel();
  } catch (error) {
    console.warn("Zoning Check: could not open floating panel", error);
    openSupported = false;
    const hint = "Use the Zoning Check button in the toolbar";
    miniEl.querySelectorAll<HTMLElement>('[data-action="open"]').forEach(el => { el.title = hint; el.setAttribute("aria-label", hint); });
    notices.push(hint); notice();
  }
}
document.querySelector("#open-full")!.addEventListener("click", () => void openFull());
miniEl.addEventListener("click", event => {
  const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
  if (action === "refresh") void load(fixture ? "ready" : undefined);
  if (action === "open") void openFull();
});
const ageTimer = setInterval(() => document.querySelectorAll("[data-updated]").forEach(el => { el.textContent = relativeTime(computedAt); }), 10000);
window.addEventListener("pagehide", () => {
  disposed = true; request++; overlayRevision++; stopWatching(); sync.close(); clearInterval(ageTimer);
  void clearLocalOverlays().catch(error => console.warn("Zoning Check: unload cleanup", error));
});
async function start(): Promise<void> {
  draw();
  if (fixture) { const initial = fixtureData("ready", params.get("existing") === "1", existingOnly); activeProposal = initial.proposalId; activeRoot = initial.rootUrn; }
  else if (isHost) {
    try {
      const { Forma, siteFingerprint } = await import("./forma");
      [activeProposal, activeRoot] = await Promise.all([Forma.proposal.getId(), Forma.proposal.getRootUrn()]);
      const stop = await autoRefresh({
        subscribe: changed => Forma.proposal.subscribe(({ rootUrn }) => { activeRoot = rootUrn; changed(rootUrn); }, { debouncedPersistedOnly: true }),
        fingerprint: siteFingerprint,
        changed: rootUrn => {
          if (rootUrn && data?.rootUrn === rootUrn && state !== "error") return;
          void load();
        },
      });
      if (disposed) { stop(); return; } stopWatching = stop;
    } catch (error) { console.warn("Zoning Check: automatic refresh unavailable", error); }
  }
  if (disposed) return;
  // Explicit fixture states remain deterministic for screenshots.
  if (!params.has("state") && !existingOnly) {
    sync.request(activeProposal, activeRoot);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  if (!disposed && !computedAt) await load();
}
void start();
