/// <reference types="vite/client" />
import icon from "../../assets/icon-mono.svg?raw";
import type { AppState } from "../fixture";
import type { SiteData, Report } from "../metrics";
import { presetShortName } from "../rules";
import { renderStatus } from "./app";
import type { ParcelControls } from "../rules";
import { escapeHtml as esc } from "./controls";
import { format } from "./results";
import { outsidePct } from "../csv";

export function relativeTime(computedAt: number): string {
  return computedAt ? `updated ${Math.max(0, Math.floor((Date.now() - computedAt) / 1000))} s ago` : "";
}
export function counts(data: SiteData, controls: ParcelControls, short = false): string {
  const existing = data.buildings.filter(b => b.kind === "existing").length;
  return `${data.buildings.length - existing} proposal · ${existing} existing ${short ? controls.includeExisting ? "incl." : "excl." : controls.includeExisting ? "(included)" : "(excluded)"}`;
}
export function boundaryWarning(report: Report, data: SiteData): string {
  const count = report.buildings.filter(({ building }) => (outsidePct(building, data.plot) ?? 0) > 5).length;
  return count ? `${count} buildings extend beyond the site limit — GFA counts whole buildings; coverage counts only the part inside.` : "";
}
export function createMini(container: HTMLElement): void {
  container.innerHTML = `<div class="mini-header"><span class="mini-icon" aria-hidden="true">${icon}</span><h1>Zoning Check</h1><button type="button" class="icon-button" data-action="refresh" title="Refresh" aria-label="Refresh"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7l-3 2"/></svg></button><button type="button" class="icon-button" data-action="open" title="Open full panel" aria-label="Open full panel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6m0-6L10 14M10 5H5v15h15v-5"/></svg></button></div><p class="mini-status status-line" role="status" aria-live="polite"></p><div class="mini-body" role="status" aria-live="polite"></div><p class="mini-footer"><span class="mini-counts"></span><span class="mini-context"></span><span class="mini-boundary" style="flex-basis:100%;border-left:3px solid var(--warn);padding-left:8px" hidden></span></p><p class="mini-notice" hidden></p>`;
}
export function renderMini(container: HTMLElement, state: AppState, data: SiteData | null, controls: ParcelControls, report: Report | null, computedAt: number, message: string): void {
  renderStatus(container.querySelector(".mini-status")!, state, data, controls, report, computedAt, message);
  const context = container.querySelector<HTMLElement>(".mini-context")!;
  context.textContent = presetShortName(controls);
  context.title = context.textContent;
  container.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.disabled = state === "loading";
  const body = container.querySelector<HTMLElement>(".mini-body")!;
  body.setAttribute("aria-busy", String(state === "loading"));
  if (state === "ready" && report) {
    // Keep row nodes between updates so width transitions and keyboard focus survive sync.
    if (!body.querySelector(".mini-score")) body.innerHTML = report.checks.slice(0, 4).map(c => `<button type="button" class="mini-score" data-action="open" data-mini-check="${c.id}"><span class="mini-label"><i class="dot" aria-hidden="true"></i>${esc(c.label)}</span><span class="mini-value"></span><span class="mini-track" aria-hidden="true"><span class="bar-fill"></span></span></button>`).join("");
    for (const c of report.checks.slice(0, 4)) {
      const row = body.querySelector<HTMLElement>(`[data-mini-check="${c.id}"]`)!;
      row.className = `mini-score ${c.status}`;
      row.querySelector(".dot")!.className = `dot ${c.status}`;
      const unit = c.unit ? ` ${c.unit}` : "";
      const value = (n: number | null) => n === null ? "—" : `${format(n, c.id === "height" ? "" : c.unit, c.id)}${unit}`;
      row.querySelector(".mini-value")!.textContent = `${value(c.value)} / ${value(c.limit)}`;
      row.setAttribute("aria-label", `${c.label}: ${value(c.value)} / ${value(c.limit)}; ${c.status}. Open full panel`);
      row.querySelector<HTMLElement>(".mini-track")!.hidden = c.status === "insufficient";
      row.querySelector<HTMLElement>(".bar-fill")!.style.width = `${c.value === null || c.limit === null ? 0 : c.limit === 0 ? c.value === 0 ? 0 : 100 : Math.min(100, Math.max(0, c.value / c.limit * 100))}%`;
    }
  } else if (state === "loading") body.innerHTML = '<div class="mini-skeleton" aria-label="Measuring proposal"><i></i><i></i><i></i></div>';
  else body.replaceChildren();
  const warning = container.querySelector<HTMLElement>(".mini-boundary")!;
  warning.textContent = state === "ready" && report && data ? boundaryWarning(report, data) : "";
  warning.hidden = !warning.textContent;
  container.querySelector(".mini-counts")!.textContent = data && state === "ready" ? counts(data, controls, true) : "";
  container.querySelector<HTMLElement>(".mini-footer")!.hidden = state !== "ready";
}
