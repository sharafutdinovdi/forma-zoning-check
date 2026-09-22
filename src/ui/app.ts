import type { AppState } from "../fixture";
import type { SiteData, Report } from "../metrics";
import type { ParcelControls } from "../rules";
import { counts } from "./results";

export const buildingIcon = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 14V6h5v8M7 14V2h7v12M1 14h14M4 8h1m-1 3h1m4-6h3M9 8h3m-3 3h3"/></svg>';
export const refreshIcon = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13 3v4H9M13 7a5 5 0 1 0-1 5"/></svg>';

export function createApp(root: HTMLElement, _fixture: boolean): void {
  root.innerHTML = `<section id="mini" aria-label="Zoning Check mini panel"></section><div id="full"><header>${buildingIcon}<h1>Zoning Check</h1><weave-button id="refresh" class="icon-button" variant="flat">${refreshIcon}<span class="sr-only">Refresh</span></weave-button><div class="overflow"><weave-button id="overflow-toggle" class="icon-button" aria-expanded="false" aria-controls="overflow-menu" variant="flat"><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="3" cy="8" r=".75"/><circle cx="8" cy="8" r=".75"/><circle cx="13" cy="8" r=".75"/></svg><span class="sr-only">More actions</span></weave-button><div id="overflow-menu" hidden><weave-button id="debug-download" variant="outlined">Debug</weave-button></div></div></header>
    <weave-progress-bar id="progress" aria-label="Measuring proposal" hidden></weave-progress-bar>
    <p id="notice" class="notice" role="status" hidden></p>
    <weave-tabs id="tabs" init="0" gap="8" variant="underlined">
      <weave-tab label="Results" variant="underlined" for="results" hpadding="8"></weave-tab>
      <weave-tab label="Controls" variant="underlined" for="controls-panel" hpadding="8"></weave-tab>
      <weave-tab label="Envelope" variant="underlined" for="envelope" hpadding="8"></weave-tab>
      <section id="results" class="tab-content" slot="content" aria-label="Results" aria-hidden="false"><p id="state-message" class="status-line" role="status" aria-live="polite"></p><div id="results-body"></div></section>
      <section id="controls-panel" class="tab-content" slot="content" aria-label="Controls" aria-hidden="true"><section id="controls"></section><p id="preset-message" class="small" role="status" hidden></p></section>
      <section id="envelope" class="tab-content" slot="content" aria-label="Envelope" aria-hidden="true"></section>
    </weave-tabs></div><input id="preset-file" type="file" accept=".json,application/json" hidden>`;
}
export function selectTab(index: number): void {
  const tabs = document.querySelector<HTMLElement & { init: number }>("#tabs")!;
  tabs.init = index;
}
export function wireTabs(proposalId: () => string): () => void {
  const tabs = document.querySelector<HTMLElement>("#tabs")!;
  let restoredProposal = "";
  const remember = (index: number) => {
    if (!proposalId()) return;
    try { localStorage.setItem(`zc-tab:${proposalId()}`, String(index)); } catch {}
  };
  tabs.addEventListener("change", event => {
    if (event instanceof CustomEvent && (event.target as Element).matches("weave-tab")) remember(Number(event.detail.index));
  });
  document.querySelector("main")!.addEventListener("click", event => {
    if (!(event.target as Element).closest('a[href="#controls"]')) return;
    event.preventDefault(); selectTab(1); remember(1);
  });
  return () => {
    const id = proposalId();
    if (!id || id === restoredProposal) return;
    restoredProposal = id;
    let index = 0;
    try { index = Number(localStorage.getItem(`zc-tab:${id}`) ?? 0); } catch {}
    const focused = document.activeElement as HTMLElement | null;
    selectTab([0, 1, 2].includes(index) ? index : 0);
    (document.activeElement as HTMLElement | null)?.blur();
    if (focused && focused !== document.body) focused.focus({ preventScroll: true });
  };
}
export function renderStatus(container: HTMLElement, state: AppState, data: SiteData | null, c: ParcelControls, _report: Report | null, _computedAt: number, message: string): void {
  container.hidden = false;
  if (state === "ready") container.textContent = data ? counts(data, c) : "";
  else if (state === "loading") container.textContent = "Measuring the proposal…";
  else if (state === "error") container.textContent = message || "Could not read proposal; press Refresh.";
  else if (state === "no-site-limit") container.textContent = "Draw a site limit around your plot to start.";
  else {
    const excluded = c.includeExisting ? 0 : data?.buildings.filter(b => b.kind === "existing").length ?? 0;
    container.innerHTML = excluded ? 'No proposal buildings in plot · <a href="#include-existing" data-action="include-existing">Include existing</a>' : "Add proposal buildings inside the site limit.";
  }
}
export function renderState(state: AppState, data: SiteData | null, c: ParcelControls, report: Report | null, computedAt: number, message = ""): void {
  document.querySelector("main")!.dataset.state = state;
  document.querySelector<HTMLElement>("#progress")!.hidden = state !== "loading";
  document.querySelector("#refresh")!.toggleAttribute("disabled", state === "loading");
  document.querySelector("#results")!.setAttribute("aria-busy", String(state === "loading"));
  if (state !== "ready") document.querySelector("#results-body")!.replaceChildren();
  renderStatus(document.querySelector("#state-message")!, state, data, c, report, computedAt, message);
}
export function showNotice(message: string): void {
  const notice = document.querySelector<HTMLElement>("#notice")!;
  notice.textContent = message; notice.hidden = !message;
}
