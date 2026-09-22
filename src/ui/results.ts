import type { CheckResult, Report, SiteData } from "../metrics";
import type { ParcelControls } from "../rules";
import { outsidePct } from "../csv";
import { escapeHtml as esc, formatNumber } from "./controls";

export function format(value: number | null, unit = "", id = ""): string {
  if (value === null) return "—";
  return formatNumber(value, id === "far" ? 3 : unit === "m" ? 2 : unit === "floors" || unit === "spaces" ? 0 : 1);
}
export function infoTooltip(text: string, label: string): string {
  return `<weave-tooltip text="${esc(text.replace(/[.!?]\s+/g, "; "))}" nub="up-right" width="240"><weave-button class="info" variant="flat"><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7v5m0-8v1"/></svg><span class="sr-only">${esc(label)}</span></weave-button></weave-tooltip>`;
}
export function counts(data: SiteData, controls: ParcelControls): string {
  const excluded = controls.includeExisting ? 0 : data.buildings.filter(b => b.kind === "existing").length;
  return `${formatNumber(data.buildings.length - excluded, 0)} of ${formatNumber(data.buildings.length, 0)} buildings · ${formatNumber(excluded, 0)} existing excluded`;
}
export function boundaryWarning(report: Report, data: SiteData): string {
  const count = report.buildings.filter(({ building }) => building.crossesBoundary || (outsidePct(building, data.plot) ?? 0) > 5).length;
  return count ? `${count} buildings extend beyond the site limit — GFA counts whole buildings; coverage counts only the part inside.` : "";
}
export function isMethodWarning(text: string): boolean {
  return /boundary|site limit|terrain|datum|elevation|floor|large plot|footprint|geometry source/i.test(text) && !/unavailable|could not|failed|omitted/i.test(text);
}
function caveat(c: CheckResult, report: Report, data: SiteData): string {
  const notes: string[] = [];
  if (c.id === "far" || c.id === "coverage") {
    if (boundaryWarning(report, data)) notes.push(c.id === "far" ? "boundary crossings count whole buildings" : "coverage counts only footprints inside the plot");
    if (report.plotArea > 50000) notes.push("verify the site limit follows the parcel boundary");
  }
  if ((c.id === "far" || c.id === "floors") && c.estimated) notes.push("floor counts are estimated where model levels are unavailable");
  if (c.id === "height") notes.push("regulatory road datum is not established", ...data.warnings.filter(w => /terrain|datum|elevation/i.test(w)).map(w => w.replace(/[.!]$/, "")));
  if (c.status === "insufficient" && c.limit !== null) notes.push(c.note);
  return notes.length ? `${notes.join("; ").replace(/^[a-z]/, s => s.toUpperCase())}.` : "";
}
export function metricRow(c: CheckResult, report: Report, data: SiteData, mini = false): string {
  const missingLimit = c.limit === null || /edge limit not set|enter street width/.test(c.note);
  const unavailable = c.value === null;
  const unit = c.unit ? `<span class="unit"> ${esc(c.unit)}</span>` : "";
  const measured = `${format(c.value, c.unit, c.id)}${unavailable ? "" : unit}`;
  const value = missingLimit ? mini ? `${measured} / —` : `${unavailable ? "" : `${measured} `}— not set` : `${format(c.value, c.unit, c.id)} / ${format(c.limit, c.unit, c.id)}${unit}`;
  const margin = c.margin === null ? "" : `${format(Math.abs(c.margin), c.unit, c.id)}${c.unit ? ` ${c.unit}` : ""}`;
  const edge = c.id === "setbacks" ? c.note.match(/^E\d+/)?.[0] : undefined;
  const secondary = c.id === "parking" ? "Add unit counts and parking inventory" : missingLimit ? mini ? "Limit not set" : '<a class="controls-link" href="#controls">Set in Controls</a>' : unavailable ? "Check model geometry and refresh" : c.status === "insufficient" ? "Check data and controls" : `${edge ? `${edge} · ` : ""}${c.margin !== null && c.margin < 0 ? `${margin} ${c.id === "setbacks" ? "short" : "over"}` : `+${margin} remaining`}`;
  const note = mini ? "" : caveat(c, report, data);
  return `<div class="metric ${c.status === "insufficient" ? "unknown" : c.status}" data-check="${c.id}" aria-label="${esc(c.label)}: ${missingLimit ? "limit not set" : c.status}"><span class="dot" aria-hidden="true"></span><span>${esc(c.label)}</span><div class="value"><span class="value-line">${note ? infoTooltip(note, `${c.label} method`) : ""}<span>${value}</span></span><span class="secondary">${secondary}</span></div></div>`;
}
type AlertElement = HTMLElement & { alerts: { id: string; title: string }[]; handleHeaderClick(): void };
export function renderResults(container: HTMLElement, report: Report, data: SiteData, _controls: ParcelControls, _computedAt: number): void {
  if (!container.querySelector(".metrics")) container.innerHTML = '<div class="metrics"></div><forma-alert id="issues" title="Issues" hidden></forma-alert>';
  container.querySelector(".metrics")!.innerHTML = report.checks.map(c => metricRow(c, report, data)).join("");
  const issues = container.querySelector<AlertElement>("#issues")!;
  const alerts = report.checks.filter(c => c.status === "fail").map(c => ({ id: c.id, title: `${c.id === "setbacks" ? `Setback ${c.note.match(/^E\d+/)?.[0] ?? ""} short` : `${c.label} exceeds limit`} by ${format(Math.abs(c.margin ?? 0), c.unit, c.id)}${c.unit ? ` ${c.unit}` : ""}` }));
  issues.hidden = !alerts.length;
  if (customElements.get("forma-alert")) {
    issues.alerts = alerts;
    if (!issues.dataset.initialized) {
      issues.handleHeaderClick(); issues.dataset.initialized = "true";
      // The supplied alert header is a div; expose its native toggle to keyboard users.
      const header = issues.shadowRoot!.querySelector<HTMLElement>(".alert-title")!;
      header.tabIndex = 0; header.setAttribute("role", "button"); header.setAttribute("aria-expanded", "false");
      issues.addEventListener("alerttoggle", () => header.setAttribute("aria-expanded", String(header.getAttribute("aria-expanded") !== "true")));
      header.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); issues.handleHeaderClick(); } });
    }
  } else issues.textContent = alerts.length ? `Issues (${alerts.length}): ${alerts.map(a => a.title).join("; ")}` : "";
}
