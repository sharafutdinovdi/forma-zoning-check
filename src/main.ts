import "./styles.css";
import { serializeCsv } from "./csv";
import { buildingFootprintArea, checkSite } from "./metrics";
import type { Report, SiteData } from "./metrics";
import { fixtureControls, fixtureData, fixtureStates } from "./fixture";
import type { AppState } from "./fixture";
import { loadControls, saveControls, usePreset, createPresetFile, parsePresetFile, controlsFromPresetFile } from "./rules";
import type { ParcelControls } from "./rules";
import { createApp, renderState, showNotice } from "./ui/app";
import { renderControls, wireControls, styleNumbers, controlsSummary } from "./ui/controls";
import { format, renderResults, wireResults } from "./ui/results";
import { createMini, renderMini, relativeTime } from "./ui/mini";
import { createSync, autoRefresh } from "./sync";
import type { SyncMessage } from "./sync";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function renderStartupError(error: unknown): void {
  console.error("Zoning Check: bootstrap failed", error);
  const root = document.querySelector("main") ?? document.body.appendChild(document.createElement("main"));
  root.dataset.state = "error";
  const line = document.createElement("p");
  line.id = "state-message"; line.className = "status-line"; line.setAttribute("role", "status");
  line.textContent = `Could not read proposal — ${errorMessage(error)}`;
  const retry = document.createElement("button");
  retry.type = "button"; retry.textContent = "Refresh";
  retry.addEventListener("click", () => window.location.reload());
  // Independent of either view's markup: even partial initialization stays visible.
  root.replaceChildren(line, retry);
}
async function bootstrap(): Promise<void> {
  try {
    const params = new URLSearchParams(window.location.search);
    const fixture = params.get("fixture") === "1";
    const isHost = window.self !== window.top && !fixture;
    const urlDebug = params.get("debug") === "1";
    let storedDebug = false;
    try { storedDebug = localStorage.getItem("zc-debug") === "1"; } catch {}
    const debug = () => urlDebug || storedDebug;
    let debugStarted = false, debugRevision = 0;
    // Preview styling never decides whether the real SDK is loaded.
    document.documentElement.dataset.host = isHost || (fixture && (params.get("embedded") === "1" || params.get("host") === "forma")) ? "forma" : "standalone";
    if (fixture && params.get("host") === "forma") document.documentElement.dataset.checkerboard = "true";
    const existingOnly = fixture && params.get("existingOnly") === "1";
    let state: AppState = "loading";
    let data: SiteData | null = null;
    let report: Report | null = null;
    let controls = fixture ? fixtureControls() : usePreset("dubai-master");
    let request = 0, overlayRevision = 0, computedAt = 0;
    let activeProposal = "", activeRoot: string | undefined;
    let message = "", notices: string[] = [], storageWarning = "";
    let disposed = false, openSupported = true, reloadRequired = false;
    let lifecycle = 0;
    let stopWatching = () => {};
    const root = document.querySelector("main") ?? document.body.appendChild(document.createElement("main"));
    root.classList.toggle("is-mini", document.body.clientWidth < 300);
    createApp(root, fixture);
    const debugButton = document.querySelector<HTMLButtonElement>("#debug-download")!;
    debugButton.addEventListener("click", async () => {
      if (!isHost || !data || debugButton.onclick) return;
      await prepareDebugDump(data);
      if (debugButton.onclick) debugButton.click();
    });
    const controlsEl = document.querySelector<HTMLElement>("#controls")!;
    const resultsEl = document.querySelector<HTMLElement>("#results")!;
    const miniEl = document.querySelector<HTMLElement>("#mini")!;
    createMini(miniEl);
    const controlsToggle = document.querySelector<HTMLButtonElement>("#controls-toggle")!;
    const controlsBody = document.querySelector<HTMLElement>("#controls-body")!;
    let controlsOpen = true;
    function setControlsOpen(open: boolean, animate = true): void {
      if (!animate) controlsBody.style.transition = "none";
      controlsOpen = open;
      controlsToggle.setAttribute("aria-expanded", String(open));
      controlsBody.inert = !open;
      controlsBody.style.height = open ? `${controlsEl.scrollHeight}px` : "0px";
      if (!animate) { void controlsBody.offsetHeight; controlsBody.style.transition = ""; }
    }
    controlsToggle.addEventListener("click", () => setControlsOpen(!controlsOpen));
    new ResizeObserver(() => { if (controlsOpen) controlsBody.style.height = `${controlsEl.scrollHeight}px`; }).observe(controlsEl);
    const plotKey = () => JSON.stringify(data?.plot ?? []);
    new ResizeObserver(([entry]) => { root.classList.toggle("is-mini", entry.contentRect.width < 300); }).observe(document.body);

    function drawControls(): void {
      const active = document.activeElement as HTMLElement | null;
      const focusId = controlsEl.contains(active) ? active?.id : undefined;
      const focusEdge = controlsEl.contains(active) ? active?.dataset.edge : undefined;
      const open = controlsEl.querySelector<HTMLDetailsElement>("details")?.open ?? false;
      renderControls(controlsEl, controls, data?.plot ?? null);
      document.querySelector("#controls-summary")!.textContent = controlsSummary(controls);
      setControlsOpen(controlsOpen, false);
      controlsEl.querySelector<HTMLDetailsElement>("details")!.open = open;
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
      if (focusEdge !== undefined) controlsEl.querySelector<HTMLElement>(`[data-edge="${Number(focusEdge)}"]`)?.focus({ preventScroll: true });
    }
    function notice(): void {
      const text = [...notices, storageWarning].filter(Boolean).join(" ");
      showNotice(text);
      const el = miniEl.querySelector<HTMLElement>(".mini-notice")!;
      const empty = state === "ready" && report?.buildings.length === 0 ? "Add a proposal building or include existing buildings in Parcel controls." : "";
      el.textContent = [empty, text].filter(Boolean).join(" "); el.hidden = !el.textContent;
    }
    function draw(): void {
      renderState(state, data, controls, report, computedAt, message);
      debugButton.disabled = !isHost || !data || state === "loading";
      if (!isHost) debugButton.title = "Debug data is available in Forma";
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
    function receiveSync(incoming: SyncMessage): void {
      if (disposed || incoming.proposalId !== activeProposal || incoming.results.data.rootUrn !== activeRoot || incoming.computedAt <= computedAt) return;
      const firstSnapshot = !computedAt;
      request++; overlayRevision++;
      ({ state, data, report, message } = incoming.results);
      controls = incoming.controls; computedAt = incoming.computedAt;
      notices = data.warnings; persist();
      if (firstSnapshot && !storageWarning) controlsOpen = false;
      sync.remember(incoming); draw();
      // The computing view owns meshes; avoid stacking translucent copies from peers.
      void clearLocalOverlays().catch(error => console.warn("Zoning Check: peer overlay cleanup", error));
    }
    let sync = createSync(receiveSync);
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
        if (revision === overlayRevision && !disposed) { notices = [...snapshot.warnings, "3D overlays unavailable; refresh to retry or read the numeric results."]; notice(); }
      }
    }
    async function load(target?: AppState): Promise<void> {
      const token = ++request;
      debugRevision++; debugStarted = false;
      debugButton.disabled = true; debugButton.onclick = null;
      debugButton.title = "Waiting for real Forma element data";
      overlayRevision++;
      try {
        state = "loading"; report = null; message = ""; notices = []; draw();
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
        const saved = loadControls(data.proposalId, plotKey());
        controls = saved ?? (sameProposal ? controls : fixture ? fixtureControls() : usePreset("dubai-master"));
        if (!sameProposal) controlsOpen = !saved;
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
        const reason = errorMessage(error);
        // Browsers cache rejected module imports (including Vite's outdated deps).
        // Refresh must reload the iframe to get a fresh module graph in that case.
        reloadRequired = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(reason);
        message = !isHost && !fixture ? reason : `Could not read proposal — ${reason}`;
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
    wireControls(controlsEl, () => controls, (next, selectingPreset) => {
      changeControls(next);
      if (selectingPreset && next.presetId !== "custom" && data && !storageWarning) {
        setControlsOpen(false); controlsToggle.focus({ preventScroll: true });
      }
    });
    root.addEventListener("click", event => {
      if ((event.target as Element).closest('[data-action="include-existing"]')) {
        changeControls({ ...controls, includeExisting: true });
        document.getElementById("includeExisting")?.focus({ preventScroll: true });
      }
    });
    const overflowToggle = document.querySelector<HTMLButtonElement>("#overflow-toggle")!;
    const overflowMenu = document.querySelector<HTMLElement>("#overflow-menu")!;
    function closeOverflow(): void { overflowMenu.hidden = true; overflowToggle.setAttribute("aria-expanded", "false"); }
    overflowToggle.addEventListener("click", () => {
      overflowMenu.hidden = !overflowMenu.hidden;
      overflowToggle.setAttribute("aria-expanded", String(!overflowMenu.hidden));
      if (!overflowMenu.hidden) overflowMenu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    document.addEventListener("click", event => { if (!(event.target as Element).closest(".overflow")) closeOverflow(); });
    overflowMenu.addEventListener("click", event => { if ((event.target as Element).closest("button")) { closeOverflow(); overflowToggle.focus(); } });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !overflowMenu.hidden) { closeOverflow(); overflowToggle.focus(); } });
    const presetInput = document.querySelector<HTMLInputElement>("#preset-file")!;
    const presetMessage = document.querySelector<HTMLElement>("#preset-message")!;
    root.addEventListener("click", event => {
      const action = (event.target as Element).closest<HTMLElement>("[data-preset-action]")?.dataset.presetAction;
      if (action === "load") presetInput.click();
      if (action === "save") {
        const file = createPresetFile(controls);
        const slug = file.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom";
        const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `zoning-preset-${slug}.json`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
    presetInput.addEventListener("change", async () => {
      const file = presetInput.files?.[0];
      if (!file) return;
      const proposal = activeProposal;
      try {
        const parsed = parsePresetFile(await file.text());
        if (proposal !== activeProposal || state === "loading") throw new Error("Proposal changed");
        changeControls(controlsFromPresetFile(parsed));
        setControlsOpen(false);
        presetMessage.textContent = "Preset loaded; classify road edges for this plot in Parcel controls.";
      } catch {
        presetMessage.textContent = "Could not load preset; choose a valid preset@1 JSON file when the proposal is ready.";
      }
      presetMessage.hidden = false;
      presetInput.value = "";
    });
    wireResults(resultsEl);
    function refresh(): void {
      if (reloadRequired) { window.location.reload(); return; }
      void load(fixture ? "ready" : undefined).catch(renderStartupError);
    }
    document.querySelector("#refresh")!.addEventListener("click", refresh);
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
    miniEl.addEventListener("click", event => {
      const action = (event.target as Element).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "refresh") refresh();
      if (action === "open") void openFull();
    });
    const updateAge = () => document.querySelectorAll("[data-updated]").forEach(el => { el.textContent = relativeTime(computedAt); });
    let ageTimer = setInterval(updateAge, 10000);
    window.addEventListener("pagehide", () => {
      disposed = true; lifecycle++; request++; overlayRevision++; stopWatching(); sync.close(); clearInterval(ageTimer);
      void clearLocalOverlays().catch(error => console.warn("Zoning Check: unload cleanup", error));
    });
    window.addEventListener("pageshow", event => {
      if (!event.persisted || !disposed) return;
      disposed = false;
      sync = createSync(receiveSync);
      ageTimer = setInterval(updateAge, 10000);
      void start(true).catch(renderStartupError);
    });
    async function start(restored = false): Promise<void> {
      const generation = lifecycle;
      draw();
      if (fixture) { const initial = fixtureData("ready", params.get("existing") === "1", existingOnly); activeProposal = initial.proposalId; activeRoot = initial.rootUrn; }
      else if (isHost) {
        try {
          const { Forma, siteFingerprint } = await import("./forma");
          const [proposal, rootUrn] = await Promise.all([Forma.proposal.getId(), Forma.proposal.getRootUrn()]);
          if (disposed || generation !== lifecycle) return;
          [activeProposal, activeRoot] = [proposal, rootUrn];
          const stop = await autoRefresh({
            subscribe: changed => Forma.proposal.subscribe(({ rootUrn }) => { if (disposed || generation !== lifecycle) return; activeRoot = rootUrn; changed(rootUrn); }, { debouncedPersistedOnly: true }),
            fingerprint: siteFingerprint,
            changed: rootUrn => {
              if (disposed || generation !== lifecycle) return;
              if (rootUrn && data?.rootUrn === rootUrn && state !== "error") return;
              void load();
            },
          });
          if (disposed || generation !== lifecycle) { stop(); return; } stopWatching = stop;
        } catch (error) { console.warn("Zoning Check: automatic refresh unavailable", error); }
      }
      if (disposed || generation !== lifecycle) return;
      if (restored) { await load(); return; }
      // Explicit fixture states remain deterministic for screenshots.
      if (!params.has("state") && !existingOnly) {
        sync.request(activeProposal, activeRoot);
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      if (!disposed && generation === lifecycle && !computedAt) await load();
    }
    await start();
  } catch (error) {
    renderStartupError(error);
  }
}
void bootstrap();
