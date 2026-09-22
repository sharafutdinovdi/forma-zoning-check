import "./styles.css";
import { generateEnvelope } from "./envelope";
import { multiArea } from "./geometry";
import { escapeHtml } from "./ui/controls";
import { serializeCsv } from "./csv";
import { checkSite } from "./metrics";
import type { Report, SiteData } from "./metrics";
import { fixtureControls, fixtureData, fixtureStates } from "./fixture";
import type { AppState } from "./fixture";
import { loadControls, saveControls, usePreset, createPresetFile, parsePresetFile, controlsFromPresetFile } from "./rules";
import type { ParcelControls } from "./rules";
import { createApp, renderState, showNotice, wireTabs } from "./ui/app";
import { renderControls, wireControls, formatNumber } from "./ui/controls";
import { infoTooltip, isMethodWarning, renderResults } from "./ui/results";
import { createMini, renderMini } from "./ui/mini";
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
    const dsNames = ["weave-button", "weave-input", "weave-select", "weave-checkbox", "weave-tooltip", "weave-accordion", "weave-progress-bar", "weave-tabs", "weave-badge", "weave-segmented-buttons-group", "forma-alert"];
    await Promise.race([Promise.all(dsNames.map(n => customElements.whenDefined(n))), new Promise(resolve => setTimeout(resolve, 4000))]);
    const designDebug = (window as unknown as { zoningDebug: Record<string, unknown> }).zoningDebug;
    designDebug.components = dsNames.every(n => customElements.get(n)) ? "cdn" : "unavailable";
    const shadowStyle = `:focus-visible { outline: 2px solid var(--border-color-accent-default, #0696d7) !important; outline-offset: 2px; }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }`;
    function styleWeave(): void {
      root.querySelectorAll<HTMLElement>("weave-button,weave-input,weave-select,weave-checkbox,weave-tooltip,weave-accordion,weave-progress-bar,weave-tab,weave-segmented-button,forma-alert").forEach(el => {
        if (!el.shadowRoot || el.shadowRoot.querySelector("[data-zoning-style]")) return;
        const style = document.createElement("style"); style.dataset.zoningStyle = ""; style.textContent = shadowStyle;
        el.shadowRoot.append(style);
        const inner = el.shadowRoot.querySelector("button,input");
        // weave-input does not forward inputmode to its native input.
        if (inner && el.hasAttribute("inputmode")) inner.setAttribute("inputmode", el.getAttribute("inputmode")!);
        if (inner && el.getAttribute("aria-label")) inner.setAttribute("aria-label", el.getAttribute("aria-label")!);
      });
    }
    let showEnvelope = params.get("envelope") !== "0";
    let savingEnvelope = false;
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
    const resultsEl = document.querySelector<HTMLElement>("#results-body")!;
    const miniEl = document.querySelector<HTMLElement>("#mini")!;
    createMini(miniEl);
    const restoreTab = wireTabs(() => activeProposal);
    const plotKey = () => JSON.stringify(data?.plot ?? []);
    new ResizeObserver(([entry]) => { root.classList.toggle("is-mini", entry.contentRect.width < 300); }).observe(document.body);

    function drawControls(): void {
      const active = document.activeElement as HTMLElement | null;
      const focusId = controlsEl.contains(active) ? active?.id : undefined;
      const focusEdge = controlsEl.contains(active) ? active?.closest<HTMLElement>("[data-edge]")?.dataset.edge : undefined;
      const focusValue = active?.getAttribute("value");
      const open = controlsEl.querySelector("#plot-edges")?.hasAttribute("expanded") ?? false;
      renderControls(controlsEl, controls, data?.plot ?? null);
      controlsEl.querySelector("#plot-edges")!.toggleAttribute("expanded", open);
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
      if (focusEdge !== undefined) controlsEl.querySelector<HTMLElement>(`[data-edge="${Number(focusEdge)}"] weave-segmented-button[value="${focusValue}"]`)?.focus({ preventScroll: true });
    }
    function notice(): void {
      const text = [...notices.filter(w => !isMethodWarning(w)), storageWarning].filter(Boolean).join(" ").replace("Check their errors in Buildings and refresh.", "Check model geometry and refresh.");
      showNotice(text);
      const el = miniEl.querySelector<HTMLElement>(".mini-notice")!;
      const empty = state === "ready" && report?.buildings.length === 0 ? "Add a proposal building or include existing buildings in Parcel controls." : "";
      el.textContent = [empty, text].filter(Boolean).join(" "); el.hidden = !el.textContent;
    }
    function draw(): void {
      restoreTab();
      renderState(state, data, controls, report, computedAt, message);
      debugButton.toggleAttribute("disabled", !isHost || !data || state === "loading");
      if (!isHost) debugButton.title = "Debug data is available in Forma";
      controlsEl.inert = state === "loading";
      resultsEl.inert = state !== "ready";
      drawControls();
      if (state === "ready" && data && report) {
        renderResults(resultsEl, report, data, controls, computedAt);
      }
      renderMini(miniEl, state, data, controls, report, computedAt, message);
      drawEnvelope(); styleWeave();
      notice();
      if (debug() && isHost && data && state !== "loading" && !debugStarted) void prepareDebugDump(data);
    }
    async function prepareDebugDump(snapshot: SiteData): Promise<void> {
      debugStarted = true;
      const revision = ++debugRevision;
      const button = debugButton;
      try {
        const { loadDebugDump } = await import("./forma");
        const dump = { ...await loadDebugDump(snapshot), designSystem: designDebug };
        if (disposed || revision !== debugRevision) return;
        if (debug()) console.log("Zoning Check: debug dump", dump);
        const json = JSON.stringify(dump, null, 2);
        button.removeAttribute("disabled"); button.title = `Debug snapshot: ${dump.proposalId}`;
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
    function envelopeControls(): ParcelControls { return { ...controls, bouwvlakPolygon: controls.bouwvlakPolygon ?? data?.bouwvlakPolygon }; }
    function currentEnvelope() { return data?.plot ? generateEnvelope(data.plot, envelopeControls()) : null; }
    function drawEnvelope(): void {
      const el = document.querySelector<HTMLElement>("#envelope")!;
      const envelope = state !== "loading" && state !== "error" ? currentEnvelope() : null;
      if (!envelope) {
        el.innerHTML = `<p class="small">${state === "loading" ? "Measuring the proposal…" : state === "error" ? "Refresh to calculate the envelope." : "Draw a site limit to calculate the envelope."}</p>`;
        return;
      }
      designDebug.envelope = envelope;
      const available = envelope.binding !== "unavailable";
      const warnings = [...envelope.warnings, ...notices.filter(isMethodWarning)].map(w => w.replace(/[.!]$/, "")).join("; ");
      const metric = (label: string, value: string, unit = "", tooltip = "") => `<div class="metric"><span>${label}</span><span class="value"><span class="value-line">${tooltip ? infoTooltip(tooltip, `${label} method`) : ""}<span>${value}${unit ? `<span class="unit"> ${unit}</span>` : ""}</span></span></span></div>`;
      el.innerHTML = `<div class="checkbox-row"><weave-checkbox id="show-envelope" showlabel label="Show permitted envelope" ${showEnvelope ? "checked" : ""}></weave-checkbox></div>
        <div id="envelope-block" ${showEnvelope ? "" : "hidden"}><div class="metrics envelope-metrics">
          ${metric("Buildable area", available ? formatNumber(multiArea(envelope.footprint), 0) : "—", "m²", warnings ? `${warnings}.` : "")}
          ${metric("Storeys", available ? String(envelope.storeys) : "—")}
          ${metric("Height", available ? formatNumber(envelope.heightM, 1) : "—", "m")}
          ${metric("Permitted GFA", available ? formatNumber(envelope.grossFloorAreaM2, 0) : "—", "m²")}
          ${metric("Limited by", available ? escapeHtml(envelope.binding.replaceAll("-limited", "").replace(/height/g, "Height").replace(/floors/g, "Floors").replace(/setbacks/g, "Setbacks")) : '<a class="controls-link" href="#controls">Set in Controls</a>')}
        </div><div class="actions"><weave-tooltip text="${!isHost ? "Open in Forma to save to the library." : !envelope.storeys ? "Set envelope controls before saving." : "Save the calculated envelope to the library."}" nub="up-right"><weave-button id="save-envelope" variant="solid" ${!isHost || !envelope.storeys || savingEnvelope ? "disabled" : ""}>${savingEnvelope ? "Saving…" : "Save envelope to library"}</weave-button></weave-tooltip><weave-button id="export" variant="outlined" ${!report ? "disabled" : ""}>Export report (CSV)</weave-button></div></div><p id="envelope-save-status" class="small" role="status"></p>`;
    }
    root.addEventListener("change", event => {
      if ((event.target as HTMLElement).id !== "show-envelope" || !(event instanceof CustomEvent)) return;
      showEnvelope = !!event.detail.checked;
      document.querySelector<HTMLElement>("#envelope-block")!.hidden = !showEnvelope;
      void updateOverlays();
    });
    root.addEventListener("click", async event => {
      if (!(event.target as Element).closest("#save-envelope") || savingEnvelope || !isHost || !data) return;
      const envelope = currentEnvelope(); if (!envelope?.storeys) return;
      const snapshot = data;
      savingEnvelope = true; drawEnvelope(); styleWeave();
      let status = "";
      try { const { saveEnvelopeToLibrary } = await import("./render"); await saveEnvelopeToLibrary(envelope, snapshot.proposalId); status = "Envelope saved to library."; }
      catch (error) { status = `Could not save envelope: ${errorMessage(error)}`; }
      finally { savingEnvelope = false; drawEnvelope(); styleWeave(); document.querySelector("#envelope-save-status")!.textContent = status; }
    });
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
      request++; overlayRevision++;
      ({ state, data, report, message } = incoming.results);
      controls = incoming.controls; computedAt = incoming.computedAt;
      notices = data.warnings; persist();
      sync.remember(incoming); draw();
      // The computing view owns meshes; avoid stacking translucent copies from peers.
      void clearLocalOverlays().catch(error => console.warn("Zoning Check: peer overlay cleanup", error));
    }
    let sync = createSync(receiveSync);
    async function updateOverlays(): Promise<void> {
      if (!isHost || (state !== "ready" && state !== "no-buildings-on-plot") || !data || !report || disposed) return;
      const revision = ++overlayRevision;
      const snapshot = data, settings = structuredClone(controls), results = report;
      try {
        const { renderOverlays } = await import("./render");
        if (revision !== overlayRevision || disposed) return;
        const warnings = await renderOverlays(snapshot, settings, results, showEnvelope ? currentEnvelope() : null);
        if (revision === overlayRevision && !disposed) {
          notices = [...snapshot.warnings, ...warnings]; notice();
          const focused = document.activeElement as HTMLElement | null;
          const envelopeFocus = focused?.closest("#envelope") ? focused.id : "";
          drawEnvelope(); styleWeave();
          if (envelopeFocus) document.getElementById(envelopeFocus)?.focus({ preventScroll: true });
        }
      } catch (error) {
        console.error("Zoning Check: overlays failed", error);
        if (revision === overlayRevision && !disposed) { notices = [...snapshot.warnings, "3D overlays unavailable; refresh to retry or read the numeric results."]; notice(); }
      }
    }
    async function load(target?: AppState): Promise<void> {
      const token = ++request;
      debugRevision++; debugStarted = false;
      debugButton.setAttribute("disabled", ""); debugButton.onclick = null;
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
        if (sameProposal && oldPlot !== plotKey()) { controls.roadEdges = []; controls.otherEdges = []; }
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
      report = data.plot && state !== "error" ? checkSite(data, controls) : null;
    }
    function changeControls(next: ParcelControls): void {
      controls = next; persist();
      if (state === "ready" || state === "no-buildings-on-plot") recompute();
      publish(); draw();
      if (state === "ready" || state === "no-buildings-on-plot") void updateOverlays();
      else {
        overlayRevision++;
        void clearLocalOverlays().catch(error => console.warn("Zoning Check: overlay cleanup", error));
      }
    }
    wireControls(controlsEl, () => controls, next => changeControls(next));
    root.addEventListener("click", event => {
      if ((event.target as Element).closest('[data-action="include-existing"]')) {
        event.preventDefault();
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
      if (!overflowMenu.hidden) overflowMenu.querySelector<HTMLButtonElement>('weave-button:not([disabled]), button:not(:disabled)')?.focus();
    });
    document.addEventListener("click", event => { if (!(event.target as Element).closest(".overflow")) closeOverflow(); });
    overflowMenu.addEventListener("click", event => { if ((event.target as Element).closest("weave-button,button")) { closeOverflow(); overflowToggle.focus(); } });
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
        changeControls({ ...controlsFromPresetFile(parsed), includeExisting: controls.includeExisting, roadEdges: [...controls.roadEdges], otherEdges: controls.otherEdges ? [...controls.otherEdges] : undefined });
        presetMessage.textContent = "Preset loaded; existing-building and plot-edge settings kept.";
      } catch {
        presetMessage.textContent = "Could not load preset; choose a valid preset@1 or preset@2 JSON file when the proposal is ready.";
      }
      presetMessage.hidden = false;
      presetInput.value = "";
    });
    function refresh(): void {
      if (reloadRequired) { window.location.reload(); return; }
      void load(fixture ? "ready" : undefined).catch(renderStartupError);
    }
    document.querySelector("#refresh")!.addEventListener("click", refresh);
    document.querySelector("#fixture-state")?.addEventListener("change", e => void load((e.target as HTMLSelectElement).value as AppState));
    root.addEventListener("click", event => {
      if (!(event.target as Element).closest("#export")) return;
      if (!data || !report || state === "loading" || state === "error") return;
      try {
        const csv = serializeCsv({ ...data, warnings: [...new Set([...data.warnings, ...notices])] }, envelopeControls(), report);
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
    window.addEventListener("pagehide", () => {
      disposed = true; lifecycle++; request++; overlayRevision++; stopWatching(); sync.close();
      void clearLocalOverlays().catch(error => console.warn("Zoning Check: unload cleanup", error));
    });
    window.addEventListener("pageshow", event => {
      if (!event.persisted || !disposed) return;
      disposed = false;
      sync = createSync(receiveSync);
      void start(true).catch(renderStartupError);
    });
    async function start(restored = false): Promise<void> {
      const generation = lifecycle;
      draw();
      if (designDebug.components === "unavailable") { storageWarning = "Forma controls could not load. Reconnect and refresh to edit controls."; }
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
