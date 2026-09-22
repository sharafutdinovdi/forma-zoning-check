import type { AppState } from "../fixture";
import type { SiteData, Report } from "../metrics";
import type { ParcelControls } from "../rules";
import { buildingIcon, refreshIcon, renderStatus } from "./app";
import { metricRow } from "./results";

export function createMini(container: HTMLElement): void {
  container.innerHTML = `<header>${buildingIcon}<h1>Zoning Check</h1><weave-button class="icon-button" data-action="refresh" variant="flat">${refreshIcon}<span class="sr-only">Refresh</span></weave-button><weave-button class="icon-button" data-action="open" variant="flat"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="M9 2h5v5m0-5L7 9M6 3H2v11h11v-4"/></svg><span class="sr-only">Open full panel</span></weave-button></header><div class="mini-content"><p class="mini-status" role="status" aria-live="polite" hidden></p><div class="mini-body" aria-live="polite"></div><p class="mini-notice" role="status" hidden></p></div>`;
}
export function renderMini(container: HTMLElement, state: AppState, data: SiteData | null, controls: ParcelControls, report: Report | null, computedAt: number, message: string): void {
  renderStatus(container.querySelector(".mini-status")!, state, data, controls, report, computedAt, message);
  container.querySelector('[data-action="refresh"]')!.toggleAttribute("disabled", state === "loading");
  const body = container.querySelector<HTMLElement>(".mini-body")!;
  body.setAttribute("aria-busy", String(state === "loading"));
  if (state === "ready" && report && data) body.innerHTML = `<div class="metrics">${report.checks.slice(0, 4).map(c => metricRow(c, report, data, true)).join("")}</div>`;
  else if (state === "loading") body.innerHTML = '<weave-progress-bar aria-label="Measuring proposal"></weave-progress-bar>';
  else body.replaceChildren();
}
