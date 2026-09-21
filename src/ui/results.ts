import type { CheckResult, Report, SiteData, Status } from "../metrics";
import type { ParcelControls } from "../rules";
import { boundaryWarning, counts, relativeTime } from "./mini";
import { buildingFootprintArea } from "../metrics";
import { outsidePct } from "../csv";
import { escapeHtml as esc, formatNumber, styleNumbers } from "./controls";
const statusText: Record<Status, string> = { pass: "Pass", fail: "Fail", insufficient: "Insufficient data" };
export function format(value: number | null, unit = "", id = ""): string {
  if (value === null) return "—";
  const digits = id === "far" ? 3 : unit === "m" ? 2 : unit === "floors" ? 0 : 1;
  return formatNumber(value, digits);
}
function updateCard(card: HTMLElement, c: CheckResult): void {
  const missingLimit = c.status === "insufficient" && (c.limit === null || /edge limit not set|enter street width/.test(c.note));
  const missingGeometry = c.status === "insufficient" && (c.value === null || /unavailable|no building geometry/.test(c.note));
  card.className = `result-card ${c.status}${missingLimit ? " missing-limit" : ""}${missingGeometry ? " missing-geometry" : ""}`;
  card.querySelector(".status")!.textContent = missingLimit ? "Limit not set" : statusText[c.status];
  card.querySelector(".estimate")!.textContent = c.estimated ? "est." : "model";
  card.querySelector(".metric-value")!.textContent = format(c.value, c.unit, c.id);
  card.querySelector(".metric-unit")!.textContent = c.unit;
  card.querySelector(".limit")!.textContent = missingLimit ? `Enter ${{ far: "Maximum FAR", coverage: "Coverage %", height: "Height", setbacks: "Setbacks" }[c.id] ?? c.label} in Parcel controls` : c.limit === null ? "Limit not set" : `${c.id === "setbacks" ? "Minimum" : "Maximum"} ${format(c.limit, c.unit, c.id)} ${c.unit}`;
  card.querySelector<HTMLElement>(".margin-track")!.hidden = missingLimit;
  card.querySelector<HTMLElement>(".margin")!.hidden = missingLimit;
  const bar = card.querySelector<HTMLElement>(".bar-fill")!;
  const fraction = c.value === null || c.limit === null ? 0 : c.limit === 0 ? c.value === 0 ? 0 : 1 : Math.min(1, Math.max(0, c.value / c.limit));
  bar.style.width = `${fraction * 100}%`;
  const margin = c.margin;
  card.querySelector(".margin")!.textContent = margin === null ? "Margin unavailable" : `${margin < 0 ? "−" : "+"}${format(Math.abs(margin), c.unit, c.id)} ${c.unit} ${c.id === "setbacks" ? "clearance" : "remaining"}`;
  card.querySelector<HTMLElement>(".check-note")!.hidden = missingLimit;
  card.querySelector(".check-note")!.textContent = missingGeometry && !/geometry|floor data|footprints/.test(c.note) ? `${c.note}; geometry or floor data unavailable` : c.note;
}
export function renderResults(container: HTMLElement, report: Report, data: SiteData, controls: ParcelControls, computedAt: number): void {
  if (!container.querySelector(".result-grid")) container.innerHTML = `<div class="section-top"><h2>Results</h2><span class="eyebrow">02</span></div><p class="small boundary-summary" role="status" style="border-left:3px solid var(--warn);padding-left:8px" hidden></p><p class="small" data-updated></p><p class="small result-counts"></p><div class="plot-info"></div><p class="small large-plot" hidden>Large plot — make sure the site limit follows the parcel boundary, not the neighbourhood.</p><p class="small no-proposal" hidden>No proposal buildings on plot. Add a proposal volume, or enable existing buildings in Parcel controls.</p><div class="result-grid">${["far", "coverage", "height", "setbacks"].map((id, i) => `<article class="result-card" data-check="${id}"><div class="card-heading"><h3>${["FAR", "Coverage", "Height", "Setbacks"][i]}</h3><span class="estimate pill"></span></div><span class="status"></span><div class="metric"><span class="metric-value"></span><span class="metric-unit"></span></div><p class="limit"></p><div class="margin-track" aria-hidden="true"><div class="bar-fill"></div></div><p class="margin"></p><p class="check-note"></p></article>`).join("")}</div><div class="other-checks full-only"></div><section class="buildings full-only"><button type="button" class="disclosure" id="buildings-toggle" aria-expanded="false" aria-controls="buildings-body"><span>Buildings</span><span class="building-count"></span></button><div id="buildings-body" class="buildings-body" inert><div class="building-rows"></div></div></section>`;
  container.querySelector("[data-updated]")!.textContent = relativeTime(computedAt);
  container.querySelector(".result-counts")!.textContent = counts(data, controls);
  const warning = container.querySelector<HTMLElement>(".boundary-summary")!;
  warning.textContent = boundaryWarning(report, data);
  warning.hidden = !warning.textContent;
  container.querySelector<HTMLElement>(".large-plot")!.hidden = report.plotArea <= 50000;
  container.querySelector<HTMLElement>(".no-proposal")!.hidden = report.buildings.length > 0;
  for (const c of report.checks.slice(0, 4)) updateCard(container.querySelector(`[data-check="${c.id}"]`)!, c);
  container.querySelector(".plot-info")!.textContent = `Plot ${format(report.plotArea, "m²")} m² · GFA ${format(report.gfa, "m²")} m² · estimated massing`;
  container.querySelector(".other-checks")!.innerHTML = report.checks.slice(4).map(c => `<div><span class="dot ${c.status}" aria-hidden="true"></span><span>${c.label}: ${c.value === null ? statusText[c.status] : `${format(c.value, c.unit, c.id)} / ${format(c.limit, c.unit, c.id)} ${c.unit} · ${statusText[c.status]}${c.estimated ? " · est." : ""}`}</span><p class="small">${esc(c.note)}</p></div>`).join("");
  container.querySelector(".building-count")!.textContent = `${formatNumber(report.buildings.length, 0)} · ${container.querySelector("#buildings-toggle")!.getAttribute("aria-expanded") === "true" ? "collapse" : "expand"}`;
  const rows = container.querySelector<HTMLElement>(".building-rows")!;
  rows.innerHTML = `<p class="small">Colours describe height, floors, setbacks and boundary checks per building. FAR and coverage apply to the whole plot. All geometry is an estimate of regulatory measurements.</p>` + report.buildings.map(({ building: b, status, checks }) => {
    const outside = outsidePct(b, data.plot);
    return `<article class="building-row"><div class="building-name"><span class="dot ${status}"></span><h3>${esc(b.name)}</h3><span class="small">${statusText[status]}</span></div><p class="building-values">${format(b.floors, "floors")} floors${b.floorsEstimated ? " (est.)" : ""} · ${format(buildingFootprintArea(b), "m²")} m² footprint · ${format(b.height, "m")} m height</p>${outside !== null && outside > 5 ? `<p><span class="pill outside-chip" style="border-color:var(--warn);background:color-mix(in srgb, var(--warn) 15%, var(--bg));color:var(--text)">⚠ ${formatNumber(outside, 0)} % outside plot</span></p>` : ""}${b.crossesBoundary ? '<p class="boundary-warning">crosses plot boundary</p>' : ""}<p class="small">${esc(checks.filter(c => c.status !== "pass").map(c => `${c.label}: ${c.status === "fail" ? "exceeds control" : c.note}`).join(" · "))}</p><p class="small">${esc(b.note)}</p></article>`;
  }).join("");
  styleNumbers(container);
  if (container.querySelector("#buildings-toggle")!.getAttribute("aria-expanded") === "true") rows.parentElement!.style.height = `${rows.scrollHeight}px`;
}
export function wireResults(container: HTMLElement): void {
  const resize = () => {
    const body = container.querySelector<HTMLElement>(".buildings-body");
    if (body && container.querySelector("#buildings-toggle")?.getAttribute("aria-expanded") === "true") body.style.height = `${body.firstElementChild!.scrollHeight}px`;
  };
  new ResizeObserver(resize).observe(container);
  container.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("#buildings-toggle");
    if (!button) return;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    const body = container.querySelector<HTMLElement>(".buildings-body")!;
    body.inert = !open;
    body.style.height = open ? `${body.firstElementChild!.scrollHeight}px` : "0px";
    body.style.opacity = open ? "1" : "0";
    container.querySelector(".building-count")!.textContent = `${formatNumber(container.querySelectorAll(".building-row").length, 0)} · ${open ? "collapse" : "expand"}`;
  });
}
