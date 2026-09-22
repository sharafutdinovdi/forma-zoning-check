import { normalizeRing } from "./geometry";
export type Jurisdiction = "dubai" | "riyadh" | "serbia" | "germany" | "netherlands" | "spain";
export type EdgeKind = "road" | "neighbour" | "other";
export type RuleForm = { type: "fixed"; value: number } | { type: "maxOfHeightFactor"; factor: number; min: number } | { type: "maxOfStreetWidth"; divisor: number; min: number };
export function evaluateRule(rule: RuleForm, height?: number, streetWidth?: number): number | undefined {
  if (rule.type === "fixed") return rule.value;
  if (rule.type === "maxOfHeightFactor") return height === undefined ? undefined : Math.max(rule.factor * height, rule.min);
  return streetWidth === undefined || streetWidth <= 0 ? undefined : Math.max(streetWidth / rule.divisor, rule.min);
}
export function edgeKind(c: ParcelControls, edge: number): EdgeKind { return c.roadEdges.includes(edge) ? "road" : c.otherEdges?.includes(edge) ? "other" : "neighbour"; }
export function requiredSetback(c: ParcelControls, edge: number, height?: number, floors?: number): number | undefined {
  const kind = edgeKind(c, edge);
  const rule = c.setbackRules?.find(r => r.edgeKind === kind)?.rule;
  if (rule) return evaluateRule(rule, height, c.riyadhFrontStreetWidthM);
  if (kind === "road") {
    if (c.jurisdiction === "riyadh") return evaluateRule({ type: "maxOfStreetWidth", divisor: 5, min: c.roadEdges[0] === edge ? 3 : 2 }, height, c.riyadhFrontStreetWidthM);
    return c.setbackRoadM;
  }
  if (c.riyadhApartmentRule) return floors === undefined ? undefined : floors > 5 ? 3 : 2;
  return c.setbackNeighbourM;
}
export interface ParcelControls {
  jurisdiction: Jurisdiction;
  setbackRules?: { edgeKind: EdgeKind; rule: RuleForm }[];
  floorHeightM?: number;
  bouwvlakPolygon?: [number, number][];
  bouwvlakMode?: boolean;
  otherEdges?: number[];
  roadAxisDistanceM?: number;
  maxEavesM?: number;
  heightDatum?: "cornice";
  secondarySourceUrl?: string;
  presetId: string;
  presetLabel?: string;
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
  preset("rs-general-family-fallback", "General family housing · fallback", "serbia", { maxCoveragePct: 40, maxFar: 1.2, maxFloors: 4, setbackRoadM: 3, setbackNeighbourM: 1.5, setbackRules: [{ edgeKind: "road", rule: { type: "fixed", value: 3 } }, { edgeKind: "neighbour", rule: { type: "fixed", value: 1.5 } }, { edgeKind: "other", rule: { type: "fixed", value: 2.5 } }], sourceLabel: "Rulebook arts. 36, 49–51", sourceUrl: "https://www.mgsi.gov.rs/sites/default/files/Pravilnik%20o%20opstim%20pravilima%20za%20parcelaciju%2C%20regulaciju%20i%20zgradnju.pdf", caveat: "Fallback only; reject as authoritative when the Belgrade plan or location information differs." }),
  preset("de-bauNVO-WA-orientation", "WA · GRZ/GFZ orientation", "germany", { maxCoveragePct: 40, maxFar: 1.2, setbackRules: ["road", "neighbour", "other"].map(edgeKind => ({ edgeKind: edgeKind as EdgeKind, rule: { type: "maxOfHeightFactor", factor: 0.4, min: 3 } })), sourceLabel: "BauNVO §17; BauO Bln §6", sourceUrl: "https://www.gesetze-im-internet.de/baunvo/__17.html", secondarySourceUrl: "https://gesetze.berlin.de/bsbe/document/jlr-NNLBE00004835NN00000000027", caveat: "Orientational upper values, not parcel rights; load the `Bebauungsplan` and full Berlin exceptions." }),
  preset("nl-valkenswaard-buitengebied2-agri", "Valkenswaard · Buitengebied 2 agricultural", "netherlands", { bouwvlakMode: true, roadAxisDistanceM: 18, setbackNeighbourM: 5, maxEavesM: 5.5, maxHeightM: 10, sourceLabel: "Adopted plan arts. 3.2.1–3.2.2", sourceUrl: "https://www.ruimtelijkeplannen.nl/documents/NL.IMRO.0858.BPbuitengebied2-VA01/r_NL.IMRO.0858.BPbuitengebied2-VA01.html", caveat: "Demonstration fixture for one agricultural plan, not a Dutch default." }),
  preset("es-madrid-nz8-grade2", "Madrid · Norma Zonal 8 grade 2", "spain", { maxCoveragePct: 30, maxFar: 0.5, maxHeightM: 10.5, maxFloors: 3, heightDatum: "cornice", setbackRoadM: 7, setbackNeighbourM: 5, setbackRules: [{ edgeKind: "road", rule: { type: "fixed", value: 7 } }, { edgeKind: "neighbour", rule: { type: "fixed", value: 5 } }, { edgeKind: "other", rule: { type: "maxOfHeightFactor", factor: 2 / 3, min: 4 } }], sourceLabel: "Madrid PGOUM arts. 8.8.6–8.8.10", sourceUrl: "https://transparencia.madrid.es/UnidadesDescentralizadas/UDCUrbanismo/PGOUM/CompendioNNUU/ficheros/COMPENDIO_MPG_NNUU_24_09_2025.pdf", caveat: "Only for parcels mapped to Norma Zonal 8 grade 2; consolidated PDF is informative and later/particular planning prevails." }),
  preset("custom", "Custom", "dubai", { caveat: "Enter controls from the current plot document." }),
];
export function usePreset(id: string, current?: ParcelControls): ParcelControls {
  const controls = structuredClone((presets.find(p => p.id === id) ?? presets[4]).controls);
  if (id === "custom") controls.jurisdiction = current?.jurisdiction ?? "dubai";
  if (current) {
    controls.includeExisting = current.includeExisting;
    controls.roadEdges = [...current.roadEdges];
    controls.otherEdges = current.otherEdges ? [...current.otherEdges] : undefined;
  }
  return controls;
}
export function asCustom(controls: ParcelControls): ParcelControls {
  return { ...controls, presetId: "custom", presetLabel: undefined, sourceLabel: controls.sourceLabel?.replace(/^(based on )?/u, "based on ") };
}
export function heightLimit(controls: ParcelControls): number | undefined {
  const rule = controls.jurisdiction === "dubai" && controls.dubaiHeightRule && controls.maxFloors !== undefined ? controls.maxFloors * 6 : undefined;
  return rule === undefined ? controls.maxHeightM : Math.min(rule, controls.maxHeightM ?? Infinity);
}
export const numericFields = ["maxFar", "maxCoveragePct", "maxHeightM", "maxFloors", "setbackNeighbourM", "setbackRoadM", "riyadhFrontStreetWidthM", "floorHeightM"] as const;
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
    if (!validControls(c)) return null;
    return { ...c, otherEdges: stored.plotKey === plotKey ? c.otherEdges : [], roadEdges: stored.plotKey === plotKey ? [...new Set<number>(c.roadEdges)] : [] };
  } catch (error) { console.warn("Zoning Check: saved controls unavailable", error); return null; }
}

export function validControls(value: unknown): value is ParcelControls {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as ParcelControls;
  if (!["dubai", "riyadh", "serbia", "germany", "netherlands", "spain"].includes(c.jurisdiction) || typeof c.presetId !== "string" || !Array.isArray(c.roadEdges)) return false;
  if (numericFields.some(k => c[k] !== undefined && (typeof c[k] !== "number" || !Number.isFinite(c[k]) || c[k] < 0))) return false;
  if ((c.maxCoveragePct ?? 0) > 100 || (c.maxFloors !== undefined && !Number.isSafeInteger(c.maxFloors))) return false;
  if (!c.roadEdges.every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return false;
  if (["sourceUrl", "sourceLabel", "caveat", "presetLabel"].some(k => c[k as keyof ParcelControls] !== undefined && typeof c[k as keyof ParcelControls] !== "string")) return false;
  if (["dubaiHeightRule", "riyadhApartmentRule", "includeExisting"].some(k => c[k as keyof ParcelControls] !== undefined && typeof c[k as keyof ParcelControls] !== "boolean")) return false;
  if (c.floorHeightM !== undefined && c.floorHeightM <= 0) return false;
  if (c.otherEdges !== undefined && (!Array.isArray(c.otherEdges) || !c.otherEdges.every(n => Number.isSafeInteger(n) && n >= 0 && !c.roadEdges.includes(n)))) return false;
  if (c.bouwvlakPolygon !== undefined && (!Array.isArray(c.bouwvlakPolygon) || !c.bouwvlakPolygon.every(p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === "number" && Number.isFinite(v))) || !normalizeRing(c.bouwvlakPolygon))) return false;
  if (c.bouwvlakMode !== undefined && typeof c.bouwvlakMode !== "boolean") return false;
  if (c.secondarySourceUrl !== undefined && typeof c.secondarySourceUrl !== "string") return false;
  if (c.heightDatum !== undefined && c.heightDatum !== "cornice") return false;
  if ([c.roadAxisDistanceM, c.maxEavesM].some(n => n !== undefined && (typeof n !== "number" || !Number.isFinite(n) || n < 0))) return false;
  if (c.setbackRules !== undefined) {
    if (!Array.isArray(c.setbackRules) || new Set(c.setbackRules.map(r => r?.edgeKind)).size !== c.setbackRules.length) return false;
    if (!c.setbackRules.every(r => {
      if (!r || !["road", "neighbour", "other"].includes(r.edgeKind) || !r.rule) return false;
      const rule = r.rule;
      const nonnegative = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
      return rule.type === "fixed" ? nonnegative(rule.value) : rule.type === "maxOfHeightFactor" ? nonnegative(rule.factor) && nonnegative(rule.min) : rule.type === "maxOfStreetWidth" && nonnegative(rule.divisor) && rule.divisor > 0 && nonnegative(rule.min);
    })) return false;
  }
  return true;
}
export const presetGroups = [
  { label: "United Arab Emirates", ids: ["dbc-g4", "dbc-g9", "dda-3261507", "dda-3262935", "dubai-master"] },
  { label: "Saudi Arabia", ids: ["riyadh-villa", "riyadh-apartment", "riyadh-special"] },
  { label: "Serbia", ids: ["rs-general-family-fallback"] },
  { label: "Germany", ids: ["de-bauNVO-WA-orientation"] },
  { label: "Netherlands", ids: ["nl-valkenswaard-buitengebied2-agri"] },
  { label: "Spain", ids: ["es-madrid-nz8-grade2"] },
  { label: "Custom", ids: ["custom"] },
];
export function presetLabel(c: ParcelControls): string {
  return c.presetLabel ?? presets.find(p => p.id === c.presetId)?.label ?? "Custom";
}
export function presetShortName(c: ParcelControls): string {
  return presetLabel(c).replace(/^(Dubai|Riyadh) · /, "").replace(/ \(.*$/, "").replace(/ example$/, "");
}
export interface PresetFile {
  schema: "forma-zoning-check/preset@2";
  label: string;
  controls: ParcelControls;
  source: { label: string; url: string };
  notes: string;
}
export function createPresetFile(c: ParcelControls, label = presetLabel(c)): PresetFile {
  return { schema: "forma-zoning-check/preset@2", label, controls: structuredClone(c), source: { label: c.sourceLabel ?? "", url: c.sourceUrl ?? "" }, notes: c.caveat ?? "" };
}
export function parsePresetFile(text: string): PresetFile {
  const file = JSON.parse(text);
  if (!file || !["forma-zoning-check/preset@1", "forma-zoning-check/preset@2"].includes(file.schema) || typeof file.label !== "string" || !file.label.trim()
    || !validControls(file.controls) || !file.source || typeof file.source.label !== "string"
    || typeof file.source.url !== "string" || typeof file.notes !== "string") throw new Error("Invalid preset");
  return { ...file, schema: "forma-zoning-check/preset@2", controls: { ...file.controls, floorHeightM: file.controls.floorHeightM ?? 3.5 } };
}
export function controlsFromPresetFile(file: PresetFile): ParcelControls {
  const builtin = presets.find(p => p.id === file.controls.presetId);
  const c = structuredClone(file.controls);
  // A shared file has no plot identity; edge indices must be selected on this plot.
  c.roadEdges = [];
  delete c.otherEdges;
  for (const [key, value] of [["sourceLabel", file.source.label], ["sourceUrl", file.source.url], ["caveat", file.notes]] as const) {
    if (value) c[key] = value;
    else delete c[key];
  }
  if (!builtin || Object.keys({ ...c, ...builtin.controls }).some(key => (key !== "presetLabel" && !(key === "floorHeightM" && (c.floorHeightM ?? 3.5) === (builtin.controls.floorHeightM ?? 3.5)))
    && JSON.stringify(c[key as keyof ParcelControls]) !== JSON.stringify(builtin.controls[key as keyof ParcelControls]))) c.presetId = "custom";
  c.presetLabel = file.label;
  return c;
}
