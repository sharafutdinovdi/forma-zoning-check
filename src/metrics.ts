import clipping from "polygon-clipping";
import { intersection, multiArea, normalizeRing, pointInPolygon, polygonArea, segmentDistance } from "./geometry";
import type { Ring, Polygon, MultiPolygon } from "./geometry";
import { heightLimit, requiredSetback } from "./rules";
import type { ParcelControls } from "./rules";

export type Status = "pass" | "fail" | "insufficient";
export interface Building {
  path: string;
  name: string;
  kind: "proposal" | "existing";
  urn?: string;
  footprint: Ring;
  // Full geometry; the legacy ring remains for simple-footprint consumers.
  footprintPolygons?: MultiPolygon;
  geometrySource: "floorstack" | "footprint" | "children" | "triangles" | null;
  geometryError?: string;
  height: number | null;
  baseZ: number | null;
  floors: number | null;
  floorsEstimated: boolean;
  floorPlates?: { polygon: Polygon; elevation: number }[];
  crossesBoundary: boolean;
  note: string;
}
export interface SiteData {
  proposalId: string;
  rootUrn?: string;
  proposalName: string;
  plot: Ring | null;
  bouwvlakPolygon?: Ring;
  plotBaseZ?: number;
  buildings: Building[];
  incompleteGeometry: boolean;
  incompleteExistingGeometry?: boolean;
  warnings: string[];
}
export interface CheckResult {
  id: string; label: string; value: number | null; limit: number | null; unit: string;
  status: Status; margin: number | null; note: string; estimated: boolean;
}
export interface EdgeCheck { edge: number; building: string; value: number; limit: number | null; status: Status; margin: number | null }
export interface BuildingResult { building: Building; status: Status; checks: CheckResult[] }
export interface Report { plotArea: number; gfa: number | null; checks: CheckResult[]; edges: EdgeCheck[]; buildings: BuildingResult[] }

// Reused v1 shoelace entrypoint, with validation in the shared geometry module.
export function footprintArea(points: Ring): number | null {
  const ring = normalizeRing(points);
  return ring ? polygonArea(ring) : null;
}
export function grossFloorArea(values: readonly (number | "UNABLE_TO_CALCULATE")[]): number | null {
  return values.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0) ? null : (values as number[]).reduce((sum, v) => sum + v, 0);
}
export function buildingGfa(building: Building): number | null {
  if (building.floorPlates?.length) return building.floorPlates.reduce((sum, f) => sum + multiArea([f.polygon]), 0);
  const area = buildingFootprintArea(building);
  return building.floors === null || area === null ? null : area * building.floors;
}
export function buildingPolygons(building: Building): MultiPolygon {
  return building.footprintPolygons ?? (building.footprint.length ? [[building.footprint]] : []);
}
export function buildingFootprintArea(building: Building): number | null {
  const polygons = buildingPolygons(building);
  return polygons.length ? multiArea(polygons) : null;
}
// Keep the shared CSV format while correcting the legacy single-ring footprint cell.
export function geometryCsv(csv: string, buildings: Building[]): string {
  let index = 0;
  return csv.replace(/(^"Buildings";"(?:[^"]|"")* · Footprint";)"[^"]*"/gm, (_, prefix: string) => {
    const area = buildingFootprintArea(buildings[index++]);
    return `${prefix}"${area === null ? "" : String(area)}"`;
  });
}
export function statusOf(checks: { status: Status }[]): Status {
  if (checks.some(c => c.status === "fail")) return "fail";
  return !checks.length || checks.some(c => c.status === "insufficient") ? "insufficient" : "pass";
}
function maxKnown(values: (number | null)[]): number | null {
  return !values.length || values.some(v => v === null) ? null : Math.max(...values as number[]);
}
function upper(id: string, label: string, value: number | null, limit: number | undefined, unit: string, estimated: boolean, note = ""): CheckResult {
  return { id, label, value, limit: limit ?? null, unit, estimated, margin: value === null || limit === undefined ? null : limit - value,
    status: value === null || limit === undefined ? "insufficient" : value > limit ? "fail" : "pass",
    note: limit === undefined ? "limit not set" : value === null ? "geometry or floor data unavailable" : note };
}
export function edgeLimit(controls: ParcelControls, edge: number, building: Building): number | undefined {
  return requiredSetback(controls, edge, building.height ?? undefined, building.floors ?? undefined);
}
export function setbackChecks(plot: Ring, buildings: Building[], controls: ParcelControls): EdgeCheck[] {
  return plot.flatMap((a, edge) => buildings.filter(b => buildingPolygons(b).length).map(building => {
    const end = plot[(edge + 1) % plot.length];
    const value = Math.min(...buildingPolygons(building).map(polygon => {
      const contains = (p: Ring[number]) => pointInPolygon(p, polygon[0]) && !polygon.slice(1).some(hole => pointInPolygon(p, hole));
      if (contains(a) || contains(end)) return 0;
      return Math.min(...polygon.flatMap(ring => ring.map((p, i) => segmentDistance(p, ring[(i + 1) % ring.length], a, end))));
    }));
    const limit = edgeLimit(controls, edge, building);
    return { edge, building: building.path, value, limit: limit ?? null, margin: limit === undefined ? null : value - limit,
      status: limit === undefined ? "insufficient" : value < limit - 0.05 ? "fail" : "pass" };
  }));
}
function setbackResult(edges: EdgeCheck[], buildings: Building[], controls: ParcelControls): CheckResult {
  const worst = [...edges].sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity))[0];
  const missingRoad = controls.jurisdiction === "riyadh" && (!controls.roadEdges.length || controls.riyadhFrontStreetWidthM === undefined || controls.riyadhFrontStreetWidthM <= 0);
  const building = buildings.find(b => b.path === worst?.building);
  const note = !worst ? "no building geometry" : `E${worst.edge + 1} · ${building?.name ?? worst.building}`;
  return { id: "setbacks", label: "Setbacks", value: worst?.value ?? null, limit: worst?.limit ?? null, unit: "m", margin: worst?.margin ?? null,
    status: missingRoad ? "insufficient" : statusOf(edges), estimated: true,
    note: `${note}${missingRoad ? "; enter street width and classify road edges" : edges.some(e => e.limit === null) ? "; edge limit not set" : "; tolerance 0.05 m"}` };
}
export function checkSite(data: SiteData, controls: ParcelControls): Report {
  const plot = data.plot ?? [], buildings = data.buildings.filter(b => controls.includeExisting || b.kind !== "existing");
  const incomplete = data.incompleteGeometry || (!!controls.includeExisting && !!data.incompleteExistingGeometry) || buildings.some(b => !buildingPolygons(b).length);
  const area = polygonArea(plot);
  const values = buildings.map(buildingGfa);
  const gfa = !buildings.length || incomplete || values.some(v => v === null) ? null : grossFloorArea(values as number[]);
  const edges = setbackChecks(plot, buildings, controls);
  const footprints = buildings.flatMap(buildingPolygons);
  const checks: CheckResult[] = [
    upper("far", "FAR", gfa === null || !area ? null : gfa / area, controls.maxFar, "", buildings.some(b => !b.floorPlates?.length || b.floorsEstimated), "GFA / plot area; whole buildings counted, including boundary crossings"),
    upper("coverage", "Coverage", area && footprints.length && !incomplete ? multiArea(intersection(clipping.union(footprints), [[plot]])) / area * 100 : null, controls.maxCoveragePct, "%", false, "Union of footprints inside plot; upper-floor projections and annex coverage not separately checked"),
    upper("height", "Height", maxKnown(buildings.map(b => b.height)), heightLimit(controls), "m", false, "Floor-stack top minus base, or mesh max Z − min Z; regulatory road datum not established"),
    setbackResult(edges, buildings, controls),
  ];
  if (controls.maxFloors !== undefined) checks.push(upper("floors", "Floors", maxKnown(buildings.map(b => b.floors)), controls.maxFloors, "floors", buildings.some(b => b.floorsEstimated), "Model levels; height / 3.5 rounded up when estimated; annex/basement classification not checked"));
  checks.push({ id: "parking", label: "Parking", value: null, limit: null, unit: "spaces", status: "insufficient", margin: null, note: "needs unit counts and parking inventory", estimated: false });
  // A known exceedance is still a failure even if another building has missing data.
  for (const id of ["height", "floors"] as const) {
    const check = checks.find(c => c.id === id);
    const limit = id === "height" ? heightLimit(controls) : controls.maxFloors;
    const known = buildings.map(b => id === "height" ? b.height : b.floors).filter((n): n is number => n !== null);
    if (check && limit !== undefined && known.length && Math.max(...known) > limit) {
      check.value = Math.max(...known); check.margin = limit - check.value; check.status = "fail";
      if (known.length < buildings.length) check.note = "Known exceedance; other buildings have unavailable data";
    }
  }
  if (incomplete) for (const check of checks.filter(c => c.id !== "parking")) {
    if (check.status !== "fail") check.status = "insufficient";
    check.note += "; buildings with unavailable footprints could not be classified";
  }
  return { plotArea: area, gfa, checks, edges, buildings: buildings.map(building => {
    if (!buildingPolygons(building).length) return { building, status: "insufficient", checks: [{ id: "geometry", label: "Geometry", value: null, limit: null, unit: "", status: "insufficient", margin: null, estimated: false, note: building.geometryError ?? "Geometry unavailable; refresh or check the model" }] };
    const local = [
      upper("height", "Height", building.height, heightLimit(controls), "m", true),
      setbackResult(edges.filter(e => e.building === building.path), [building], controls),
    ];
    if (controls.maxFloors !== undefined) local.push(upper("floors", "Floors", building.floors, controls.maxFloors, "floors", building.floorsEstimated));
    if (building.crossesBoundary) local.push({ id: "boundary", label: "Plot boundary", value: null, limit: null, unit: "", status: "fail", margin: null, estimated: true, note: "crosses plot boundary" });
    return { building, status: statusOf(local), checks: local };
  }) };
}
export function onPlot(footprint: Ring | MultiPolygon, plot: Ring): { counted: boolean; crossesBoundary: boolean } {
  const polygons: MultiPolygon = typeof footprint[0]?.[0] === "number" ? [[footprint as Ring]] : footprint as MultiPolygon;
  const inside = multiArea(intersection(polygons, [[plot]]));
  return { counted: inside > 1, crossesBoundary: multiArea(polygons) - inside > 1e-6 };
}
