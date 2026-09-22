import { asCustom, numericFields, presets, presetLabel, usePreset } from "../rules";
import type { NumericField, ParcelControls } from "../rules";
import type { Ring } from "../geometry";

export function formatNumber(value: number, digits?: number, useGrouping = true): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 15, useGrouping }).format(value);
}
// Spaces inside a number and grouping separators are deliberately not accepted.
export function parseDecimal(raw: string): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) ? Number(value.replace(",", ".")) : NaN;
}
export function escapeHtml(value: unknown): string { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const fields: { key: NumericField; label: string }[] = [
  { key: "maxFar", label: "Maximum FAR" }, { key: "maxCoveragePct", label: "Coverage %" },
  { key: "maxHeightM", label: "Height m" }, { key: "maxFloors", label: "Floors" },
  { key: "setbackNeighbourM", label: "Neighbour m" }, { key: "setbackRoadM", label: "Road m" },
  { key: "riyadhFrontStreetWidthM", label: "Street width m" }, { key: "floorHeightM", label: "Floor height m" },
];
const markets = [
  { label: "Project", ids: ["custom"] },
  { label: "Gulf", ids: ["dbc-g4", "dbc-g9", "dda-3261507", "dda-3262935", "dubai-master", "riyadh-apartment", "riyadh-villa", "riyadh-special"] },
  { label: "Europe", ids: ["de-bauNVO-WA-orientation", "es-madrid-nz8-grade2", "rs-general-family-fallback", "nl-valkenswaard-buitengebied2-agri"] },
];
const labels: Record<string, string> = {
  custom: "Custom limits", "dda-3261507": "Dubai · DDA plot 3261507 example", "dda-3262935": "Dubai · DDA plot 3262935 example",
  "dubai-master": "Dubai · Master-developer plot", "riyadh-apartment": "Riyadh · Apartment", "riyadh-villa": "Riyadh · Villa", "riyadh-special": "Riyadh · KAFD / Qiddiya",
  "de-bauNVO-WA-orientation": "Germany · BauNVO", "es-madrid-nz8-grade2": "Madrid · NZ8", "rs-general-family-fallback": "Serbia · Family housing", "nl-valkenswaard-buitengebied2-agri": "Netherlands · Valkenswaard",
};
export function renderControls(container: HTMLElement, c: ParcelControls, plot: Ring | null): void {
  const reference = !!c.caveat && /^(dbc-|dda-|riyadh-(villa|apartment)$|de-|es-|rs-|nl-)/.test(c.presetId);
  const other = c.setbackRules?.some(r => r.edgeKind === "other") || !!c.otherEdges?.length;
  container.innerHTML = `<div class="preset-row"><span>Preset</span><div class="preset-field">
    <weave-select id="preset" name="presetId" label="Preset" aria-label="Preset" value="${escapeHtml(c.presetId)}" modal>${markets.map((group, index) => `${index ? "<weave-select-divider></weave-select-divider>" : ""}<span class="market">${group.label}</span>${group.ids.map(id => `<weave-select-option value="${id}">${escapeHtml(id === "custom" && id === c.presetId && c.presetLabel ? presetLabel(c) : labels[id] ?? presets.find(p => p.id === id)!.label)}</weave-select-option>`).join("")}`).join("")}</weave-select>
    ${reference ? '<weave-badge id="preset-reference" variant="text" color="orange">Reference values</weave-badge>' : ""}</div></div>
    <form id="parcel-form">${fields.filter(f => c.jurisdiction === "riyadh" ? f.key !== "setbackRoadM" : f.key !== "riyadhFrontStreetWidthM").map(f => `<div class="field-row"><span>${f.label}</span><weave-input id="${f.key}" name="${f.key}" label="${f.label}" variant="box" type="text" inputmode="decimal" placeholder="${f.key === "setbackNeighbourM" && c.riyadhApartmentRule ? "Auto: 2 / 3" : "Not set"}" value="${c[f.key] === undefined ? f.key === "floorHeightM" ? "3.5" : "" : formatNumber(c[f.key]!, undefined, false)}"></weave-input></div>`).join("")}
    ${c.dubaiHeightRule !== undefined ? `<div class="checkbox-row"><weave-checkbox id="dubaiHeightRule" showlabel label="DBC height ≤ 6 × floors" ${c.dubaiHeightRule ? "checked" : ""}></weave-checkbox></div>` : ""}
    <div class="checkbox-row"><weave-checkbox id="includeExisting" showlabel label="Count existing buildings on plot" ${c.includeExisting ? "checked" : ""}></weave-checkbox></div></form>
    <div class="edges"><weave-accordion id="plot-edges" label="Plot edges" indicatorposition="right" aria-describedby="edge-count">
    ${plot ? plot.map((a, i) => { const b = plot[(i + 1) % plot.length]; return `<div class="edge-row"><span>E${i + 1} · ${formatNumber(Math.hypot(b[0] - a[0], b[1] - a[1]), 1)} m</span><weave-segmented-buttons-group data-edge="${i}" value="${c.roadEdges.includes(i) ? "road" : c.otherEdges?.includes(i) ? "other" : "neighbour"}" aria-label="E${i + 1} classification"><weave-segmented-button value="road" density="high">Road</weave-segmented-button><weave-segmented-button value="neighbour" density="high">Neighbour</weave-segmented-button>${other ? '<weave-segmented-button value="other" density="high">Other</weave-segmented-button>' : ""}</weave-segmented-buttons-group></div>`; }).join("") : '<p class="small">Draw a site limit to classify its edges.</p>'}</weave-accordion><span id="edge-count" class="edge-count">${formatNumber(plot?.length ?? 0, 0)} edges</span></div>
    <div class="actions"><weave-button variant="outlined" data-preset-action="load">Load preset…</weave-button><weave-button variant="outlined" data-preset-action="save">Save preset</weave-button></div>`;
}
export function wireControls(container: HTMLElement, current: () => ParcelControls, changed: (c: ParcelControls, presetSelected?: boolean) => void): void {
  container.addEventListener("submit", e => e.preventDefault());
  container.addEventListener("change", e => {
    if (!(e instanceof CustomEvent)) return;
    const input = e.target as HTMLElement;
    const group = input.closest<HTMLElement>("weave-segmented-buttons-group[data-edge]");
    if (group) {
      const c = current(), edge = Number(group.dataset.edge), value = e.detail.value;
      if (value === (c.roadEdges.includes(edge) ? "road" : c.otherEdges?.includes(edge) ? "other" : "neighbour")) return;
      changed({ ...asCustom(c), roadEdges: [...c.roadEdges.filter(n => n !== edge), ...(value === "road" ? [edge] : [])], otherEdges: [...(c.otherEdges ?? []).filter(n => n !== edge), ...(value === "other" ? [edge] : [])] });
      return;
    }
    const c = current(), name = input.getAttribute("name");
    if (input.id === "preset") { changed(usePreset(String(e.detail.value), c), true); return; }
    if (input.id === "includeExisting") { changed({ ...c, includeExisting: !!e.detail.checked }); return; }
    if (input.id === "dubaiHeightRule") { changed({ ...asCustom(c), dubaiHeightRule: !!e.detail.checked }); return; }
    if (!numericFields.includes(name as NumericField)) return;
    const native = input.shadowRoot?.querySelector<HTMLInputElement>("input");
    const raw = native?.value ?? String(e.detail.value ?? "");
    const value = parseDecimal(raw);
    const invalid = value !== undefined && (!Number.isFinite(value) || value < 0
      || name === "floorHeightM" && value < 0.01
      || name === "maxCoveragePct" && value > 100
      || name === "maxFloors" && !Number.isSafeInteger(value));
    native?.setCustomValidity(invalid ? "Enter a valid number using . or , for decimals; check the field range." : "");
    if (invalid) { native?.reportValidity(); return; }
    const next = { ...asCustom(c), [name!]: value };
    if (name === "setbackNeighbourM") next.riyadhApartmentRule = false;
    if (name === "setbackNeighbourM" || name === "setbackRoadM") next.setbackRules = c.setbackRules?.filter(r => r.edgeKind !== (name === "setbackRoadM" ? "road" : "neighbour"));
    changed(next);
  });
}
