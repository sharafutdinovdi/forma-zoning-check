export type Jurisdiction = "dubai" | "riyadh";
export interface ParcelControls {
  jurisdiction: Jurisdiction;
  presetId: string;
  includeExisting?: boolean;
  maxFar?: number;
  maxCoveragePct?: number;
  maxHeightM?: number;
  maxFloors?: number;
  dubaiHeightRule?: boolean;
  setbackNeighbourM?: number;
  setbackRoadM?: number;
  riyadhFrontStreetWidthM?: number;
  roadEdges: number[];
  sourceUrl?: string;
  sourceLabel?: string;
  // Preserve this preset behaviour when unrelated fields are customised.
  riyadhApartmentRule?: boolean;
  caveat?: string;
}
export interface Preset { id: string; label: string; controls: ParcelControls }
// Values and URLs: compass-brain/research/oss/zoning-rules-dubai-riyadh-2026-09-20.md.
const dbc = "https://dmpmedia.dm.gov.ae/uploads/2021/12/Dubai%20Building%20Code_English_2021%20Edition_compressed.pdf";
const momah = "https://momah.gov.sa/sites/default/files/2025-11/ashtratat%20ansha%20almbany%20alsknyt9%20ywlyh%202024.pdf";
function preset(id: string, label: string, jurisdiction: Jurisdiction, controls: Omit<ParcelControls, "jurisdiction" | "presetId" | "roadEdges">): Preset {
  return { id, label, controls: { jurisdiction, presetId: id, roadEdges: [], includeExisting: false, ...controls } };
}
export const presets: Preset[] = [
  preset("dbc-g4", "Dubai · DBC fallback G+4", "dubai", { maxFloors: 5, dubaiHeightRule: true, setbackNeighbourM: 3.75, setbackRoadM: 0, sourceLabel: "DBC 2021 · B.4.2", sourceUrl: dbc, caveat: "fallback only; plot DCR/affection plan prevails" }),
  preset("dbc-g9", "Dubai · DBC fallback G+9", "dubai", { maxFloors: 10, dubaiHeightRule: true, setbackNeighbourM: 7.5, setbackRoadM: 0, sourceLabel: "DBC 2021 · B.4.2", sourceUrl: dbc, caveat: "fallback only; plot DCR/affection plan prevails" }),
  preset("dda-3261507", "Dubai · DDA plot 3261507 (Al Jadaf) example", "dubai", { maxFar: 6.972, maxFloors: 21, maxHeightM: 85, setbackNeighbourM: 4, setbackRoadM: 7.5, sourceLabel: "DDA · plot 3261507", sourceUrl: "https://gis.dda.gov.ae/DIS?PlotNumber=3261507&handler=PlotInfo", caveat: "Example only: 4 / 7.5 / 4 / 4 m approximated as neighbour 4 m, road 7.5 m; podium controls excluded." }),
  preset("dda-3262935", "Dubai · DDA plot 3262935 (Al Jadaf) example", "dubai", { maxFar: 2.161, maxFloors: 16, setbackNeighbourM: 5, setbackRoadM: 10, sourceLabel: "DDA · plot 3262935", sourceUrl: "https://gis.dda.gov.ae/DIS?PlotNumber=3262935&handler=PlotInfo", caveat: "Example only: 5 / 10 / 5 / 5 m approximated as neighbour 5 m, road 10 m." }),
  preset("dubai-master", "Dubai · master-developer plot (Downtown / Emaar)", "dubai", { sourceLabel: "Emaar · Downtown Dubai", sourceUrl: "https://www.emaar.com/en/our-communities/downtown-dubai", caveat: "controls not public; enter from plot document" }),
  preset("riyadh-villa", "Riyadh · MOMAH 2024 villa (R3)", "riyadh", { maxFloors: 2, maxCoveragePct: 75, setbackNeighbourM: 1.5, sourceLabel: "MOMAH 2024 · §§3.1, 4.1 (Arabic)", sourceUrl: momah, caveat: "2 floors + roof annex; annex and basement classification not checked. Enter street width and classify road edges; plot system prevails." }),
  preset("riyadh-apartment", "Riyadh · MOMAH 2024 apartment (R2)", "riyadh", { maxHeightM: 23, maxCoveragePct: 65, riyadhApartmentRule: true, sourceLabel: "MOMAH 2024 · §§3.2, 4.2 (Arabic)", sourceUrl: momah, caveat: "Ground coverage only; neighbour 2 m for ≤5 floors, 3 m for >5. Roof annex excluded; enter street width. Above 23 m is outside this preset’s scope." }),
  preset("riyadh-special", "Riyadh · KAFD / Qiddiya parcel", "riyadh", { sourceLabel: "Riyadh · plot building-system service", sourceUrl: "https://www.alriyadh.gov.sa/ar/services/40?mainServiceCode=2", caveat: "controls not public; enter from plot document; special-authority parcel controls prevail" }),
  preset("custom", "Custom", "dubai", { caveat: "Enter controls from the current plot document." }),
];
export function usePreset(id: string, jurisdiction: Jurisdiction = "dubai"): ParcelControls {
  const controls = structuredClone((presets.find(p => p.id === id) ?? presets[4]).controls);
  if (id === "custom") controls.jurisdiction = jurisdiction;
  return controls;
}
export function asCustom(controls: ParcelControls): ParcelControls {
  return { ...controls, presetId: "custom", sourceLabel: controls.sourceLabel?.replace(/^(based on )?/u, "based on ") };
}
export function heightLimit(controls: ParcelControls): number | undefined {
  const rule = controls.jurisdiction === "dubai" && controls.dubaiHeightRule && controls.maxFloors !== undefined ? controls.maxFloors * 6 : undefined;
  return rule === undefined ? controls.maxHeightM : Math.min(rule, controls.maxHeightM ?? Infinity);
}
export const numericFields = ["maxFar", "maxCoveragePct", "maxHeightM", "maxFloors", "setbackNeighbourM", "setbackRoadM", "riyadhFrontStreetWidthM"] as const;
export type NumericField = typeof numericFields[number];
function storageKey(proposalId: string): string { return `forma-zoning-check:v2:${proposalId}`; }
export function saveControls(proposalId: string, controls: ParcelControls, plotKey: string): boolean {
  try { localStorage.setItem(storageKey(proposalId), JSON.stringify({ controls, plotKey })); return true; }
  catch (error) { console.warn("Zoning Check: controls could not be saved", error); return false; }
}
export function loadControls(proposalId: string, plotKey: string): ParcelControls | null {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(proposalId)) ?? "null");
    const c = stored?.controls;
    if (!c || !["dubai", "riyadh"].includes(c.jurisdiction) || typeof c.presetId !== "string" || !Array.isArray(c.roadEdges)) return null;
    if (numericFields.some(k => c[k] !== undefined && (typeof c[k] !== "number" || !Number.isFinite(c[k]) || c[k] < 0))) return null;
    if (c.maxCoveragePct > 100 || (c.maxFloors !== undefined && !Number.isSafeInteger(c.maxFloors))) return null;
    if (!c.roadEdges.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
    if (["sourceUrl", "sourceLabel", "caveat"].some(k => c[k] !== undefined && typeof c[k] !== "string")) return null;
    if (["dubaiHeightRule", "riyadhApartmentRule", "includeExisting"].some(k => c[k] !== undefined && typeof c[k] !== "boolean")) return null;
    return { ...c, roadEdges: stored.plotKey === plotKey ? [...new Set<number>(c.roadEdges)] : [] };
  } catch (error) { console.warn("Zoning Check: saved controls unavailable", error); return null; }
}
