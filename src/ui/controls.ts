import { asCustom, numericFields, presets, presetGroups, presetLabel, presetShortName, usePreset } from "../rules";
import type { NumericField, ParcelControls } from "../rules";
import type { Ring } from "../geometry";

export function formatNumber(value: number, digits?: number, useGrouping = true): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: digits ?? 0, maximumFractionDigits: digits ?? 15, useGrouping }).format(value);
}
// Keep numerals in mixed prose (source labels, notes, building names) in mono too.
export function styleNumbers(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (/\d/.test(node.data) && !node.parentElement?.closest(".num, select")) nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const part of node.data.split(/(\d+(?:[.,]\d+)*)/)) {
      if (/^\d/.test(part)) { const span = document.createElement("span"); span.className = "num"; span.textContent = part; fragment.append(span); }
      else fragment.append(part);
    }
    node.replaceWith(fragment);
  }
}

export function escapeHtml(value: unknown): string { return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
export function sourceLink(controls: ParcelControls): string {
  try {
    const url = new URL(controls.sourceUrl ?? "");
    if (url.protocol !== "https:") return "";
    return `<a class="pill source" href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml((controls.sourceLabel ?? "Source").replace(/\b(Dubai|Riyadh)\b/g, "").replace(/^\s*·\s*|\s*·\s*$/g, "").trim())} ↗</a>`;
  } catch { return ""; }
}
const fields: { key: NumericField; label: string; step: string }[] = [
  { key: "maxFar", label: "Maximum FAR", step: "0.001" }, { key: "maxCoveragePct", label: "Coverage · %", step: "0.1" },
  { key: "maxHeightM", label: "Height · m", step: "0.01" }, { key: "maxFloors", label: "Floors · incl. ground", step: "1" },
  { key: "setbackNeighbourM", label: "Neighbour · m", step: "0.01" }, { key: "setbackRoadM", label: "Road · m", step: "0.01" },
  { key: "riyadhFrontStreetWidthM", label: "Street width · m", step: "0.01" },
];
export function renderControls(container: HTMLElement, c: ParcelControls, plot: Ring | null): void {
  container.innerHTML = `<div class="preset-heading"><label for="preset">Preset</label><span class="rules-caption">Rules: ${c.jurisdiction === "dubai" ? "Dubai DBC" : "Riyadh MOMAH"}</span></div>
    <label class="preset-label"><select id="preset" name="presetId">${presetGroups.map(group => `<optgroup label="${group.label}">${group.ids.map(id => { const p = presets.find(p => p.id === id)!; return `<option value="${p.id}" ${p.id === c.presetId ? "selected" : ""}>${escapeHtml(p.id === c.presetId ? presetLabel(c) : p.label)}</option>`; }).join("")}</optgroup>`).join("")}</select></label>
    <div class="preset-actions"><button class="text-button" type="button" data-preset-action="load">Load preset…</button><button class="text-button" type="button" data-preset-action="save">Save preset</button></div>
    <p class="caveat" tabindex="0" title="${escapeHtml(c.caveat ?? "Enter controls from the current plot document.")}">${escapeHtml(c.caveat ?? "Enter controls from the current plot document.")}</p>
    <form id="parcel-form" class="field-grid">${fields.filter(f => c.jurisdiction === "riyadh" ? f.key !== "setbackRoadM" : f.key !== "riyadhFrontStreetWidthM").map(f => `<label>${f.label}<input id="${f.key}" name="${f.key}" type="text" inputmode="decimal" min="0" ${f.key === "maxCoveragePct" ? 'max="100"' : ""} step="${f.step}" placeholder="${f.key === "setbackNeighbourM" && c.riyadhApartmentRule ? "Auto: 2 / 3" : "Not set"}" value="${c[f.key] === undefined ? "" : formatNumber(c[f.key]!, undefined, false)}" ${f.key === "riyadhFrontStreetWidthM" ? 'aria-describedby="street-note"' : ""}></label>`).join("")}
    ${c.jurisdiction === "dubai" ? `<label class="check-label"><input id="dubaiHeightRule" type="checkbox" ${c.dubaiHeightRule ? "checked" : ""}> DBC height ≤ 6 × floors</label>` : ""}<label class="check-label"><input id="includeExisting" role="switch" type="checkbox" ${c.includeExisting ? "checked" : ""}> Count existing buildings on plot</label></form>
    ${c.jurisdiction === "riyadh" ? '<p id="street-note" class="small">Select the front road first; one street width applies to all roads.</p>' : ""}
    <details class="edge-classifier"><summary>Plot edges <span class="muted">${formatNumber(plot?.length ?? 0, 0)} edges · classify roads</span></summary>
    <p class="small">E1 starts at the first site-limit vertex (local metres).</p>
    <div class="edges">${plot ? plot.map((a, i) => { const b = plot[(i + 1) % plot.length]; const road = c.roadEdges.includes(i); return `<div class="edge"><span title="(${formatNumber(a[0], 2)}, ${formatNumber(a[1], 2)}) → (${formatNumber(b[0], 2)}, ${formatNumber(b[1], 2)})">E${i + 1} <span class="muted">${formatNumber(Math.hypot(b[0] - a[0], b[1] - a[1]), 1)} m</span></span><button type="button" data-edge="${i}" class="pill edge-toggle ${road ? "selected" : ""}" aria-pressed="${road}" aria-label="E${i + 1}: ${road ? "road" : "neighbour"}; toggle classification">${road ? c.jurisdiction === "riyadh" && c.roadEdges[0] === i ? "Road · front" : "Road" : "Neighbour"}</button></div>`; }).join("") : '<p class="small">Draw a site limit to classify its edges.</p>'}</div></details>`;
  styleNumbers(container.ownerDocument.querySelector("main")!);
}
export function wireControls(container: HTMLElement, current: () => ParcelControls, changed: (c: ParcelControls, presetSelected?: boolean) => void): void {
  container.addEventListener("input", e => {
    const input = e.target as HTMLInputElement;
    if (input.inputMode === "decimal") {
      input.value = input.value.replace(/,/g, ".");
      input.setCustomValidity("");
    }
  });
  container.addEventListener("submit", e => e.preventDefault());
  container.addEventListener("click", e => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!button) return;
    const c = current();
    if (button.dataset.edge !== undefined) {
      const edge = Number(button.dataset.edge);
      changed({ ...asCustom(c), roadEdges: c.roadEdges.includes(edge) ? c.roadEdges.filter(n => n !== edge) : [...c.roadEdges, edge] });
    }
  });
  container.addEventListener("change", e => {
    const input = e.target as HTMLInputElement;
    const c = current();
    if (input.name === "presetId") { changed(usePreset(input.value, c.jurisdiction), true); return; }
    if (input.id === "includeExisting") { changed({ ...c, includeExisting: input.checked }); return; }
    if (input.id === "dubaiHeightRule") { changed({ ...asCustom(c), dubaiHeightRule: input.checked }); return; }
    if (!numericFields.includes(input.name as NumericField)) return;
    input.value = input.value.trim().replace(/,/g, ".");
    const numeric = document.createElement("input");
    numeric.type = "number";
    for (const name of ["min", "max", "step"]) {
      const attribute = input.getAttribute(name);
      if (attribute !== null) numeric.setAttribute(name, attribute);
    }
    numeric.value = input.value;
    input.setCustomValidity(input.value && !numeric.value ? "Enter a number using a dot decimal." : numeric.validationMessage);
    if (!input.checkValidity()) { input.reportValidity(); return; }
    const value = input.value === "" ? undefined : numeric.valueAsNumber;
    if (value !== undefined && !Number.isFinite(value)) return;
    const next = { ...asCustom(c), [input.name]: value };
    if (input.name === "setbackNeighbourM") next.riyadhApartmentRule = false;
    changed(next);
  });
}

export function controlsSummary(c: ParcelControls): string {
  return [presetShortName(c), c.maxFar === undefined ? "" : `FAR ${formatNumber(c.maxFar)}`,
    c.maxFloors === undefined ? "" : `G+${Math.max(0, c.maxFloors - 1)}`,
    c.setbackNeighbourM === undefined && c.setbackRoadM === undefined ? "" : `${c.setbackNeighbourM ?? "—"}/${c.setbackRoadM ?? "—"} m`].filter(Boolean).join(" · ");
}
