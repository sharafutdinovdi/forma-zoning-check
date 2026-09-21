/// <reference types="vite/client" />
import icon from "../../assets/icon-mono.svg?raw";
import type { AppState } from "../fixture";
import type { SiteData, Report } from "../metrics";
import type { ParcelControls } from "../rules";
import { numericFields } from "../rules";
import { sourceLink } from "./controls";

export function createApp(root: HTMLElement, fixture: boolean): void {
  root.innerHTML = `<section id="mini" aria-label="Zoning Check mini panel"></section><div id="full"><header><span class="mini-icon" aria-hidden="true">${icon}</span><div class="heading"><h1>Zoning Check</h1><p id="proposal-name">Current proposal</p></div><button id="refresh" class="icon-button" type="button" title="Refresh" aria-label="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3 2"/></svg></button><div class="overflow"><button id="overflow-toggle" class="icon-button" type="button" title="More actions" aria-label="More actions" aria-expanded="false" aria-controls="overflow-menu">⋯</button><div id="overflow-menu" hidden><button id="export" type="button" disabled>Export CSV</button><button type="button" data-preset-action="save">Save preset</button><button type="button" data-preset-action="load">Load preset…</button><button id="debug-download" type="button">Debug</button></div></div></header>
    <p id="state-message" class="status-line" role="status" aria-live="polite"></p>
    ${fixture ? '<aside class="fixture-bar"><span>Synthetic preview</span><label>State <select id="fixture-state" aria-label="Fixture state"><option>ready</option><option>loading</option><option>no-site-limit</option><option>no-buildings-on-plot</option><option>error</option></select></label></aside>' : ""}
    <p id="notice" class="notice" role="status" hidden></p>
    <p id="preset-message" class="small" role="status" hidden></p>
    <section id="results" class="results" aria-label="Check results"></section>
    <section class="controls surface full-only"><button type="button" id="controls-toggle" class="disclosure" aria-expanded="true" aria-controls="controls-body"><span>Parcel controls<span id="controls-summary"></span></span><span class="chevron" aria-hidden="true">⌄</span></button><div id="controls-body"><section id="controls" aria-label="Parcel controls"></section></div></section>
    <footer><div id="source"></div><p>Estimated massing check — not a compliance statement</p></footer></div><input id="preset-file" type="file" accept=".json,application/json" hidden>`;
}
export function renderStatus(container: HTMLElement, state: AppState, data: SiteData | null, c: ParcelControls, report: Report | null, computedAt: number, message: string): void {
  if (state === "loading") container.textContent = "Measuring the proposal…";
  else if (state === "error") container.textContent = message || "Could not read proposal; press Refresh.";
  else if (state === "no-site-limit") container.textContent = "Draw a site limit around your plot to start.";
  else if (state === "no-buildings-on-plot") {
    const excluded = c.includeExisting ? 0 : data?.buildings.filter(b => b.kind === "existing").length ?? 0;
    container.innerHTML = excluded ? `Add proposal buildings inside the site limit — ${excluded} existing ${excluded === 1 ? "building is" : "buildings are"} excluded (<button type="button" class="text-button" data-action="include-existing">Include existing</button>).` : "Add proposal buildings inside the site limit.";
  } else if (!numericFields.some(k => k !== "riyadhFrontStreetWidthM" && c[k] !== undefined) && !c.riyadhApartmentRule) {
    container.textContent = "Choose a preset or enter your plot controls to get pass/fail.";
  } else {
    const checks = report?.checks.filter(check => check.id !== "parking") ?? [];
    const pass = checks.filter(check => check.status === "pass").length;
    const fail = checks.filter(check => check.status === "fail").length;
    const unknown = checks.filter(check => check.status === "insufficient").length;
    container.innerHTML = `${pass} ${pass === 1 ? "check passes" : "checks pass"} · ${fail} ${fail === 1 ? "fails" : "fail"}${unknown ? ` · ${unknown} incomplete` : ""} · <span data-updated>updated ${Math.max(0, Math.floor((Date.now() - computedAt) / 1000))} s ago</span>`;
  }
}
export function renderState(state: AppState, data: SiteData | null, c: ParcelControls, report: Report | null, computedAt: number, message = ""): void {
  document.querySelector("main")!.dataset.state = state;
  document.querySelector("#proposal-name")!.textContent = data?.proposalName ?? "Current proposal";
  document.querySelector("#source")!.innerHTML = sourceLink(c);
  document.querySelector<HTMLButtonElement>("#refresh")!.disabled = state === "loading";
  document.querySelector<HTMLButtonElement>("#export")!.disabled = state !== "ready";
  document.querySelector("#results")!.setAttribute("aria-busy", String(state === "loading"));
  renderStatus(document.querySelector("#state-message")!, state, data, c, report, computedAt, message);
  const select = document.querySelector<HTMLSelectElement>("#fixture-state");
  if (select) select.value = state;
}
export function showNotice(message: string): void {
  const notice = document.querySelector<HTMLElement>("#notice")!;
  notice.textContent = message; notice.hidden = !message;
}
