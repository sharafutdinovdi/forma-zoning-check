import { difference, intersection, multiArea, normalizeRing, polygonArea, signedArea, triangulate, union } from "./geometry";
import type { Ring, MultiPolygon } from "./geometry";
import { heightLimit, requiredSetback } from "./rules";
import type { ParcelControls } from "./rules";

export interface Envelope {
  footprint: MultiPolygon;
  storeys: number;
  heightM: number;
  grossFloorAreaM2: number;
  binding: string;
  warnings: string[];
}
/** Keep the parts of the parcel at least `distances[i]` from edge segment `i`, in local metric coordinates. */
export function insetPerEdge(plot: Ring, distances: number[]): MultiPolygon {
  // Round end caps are circumscribed polygons, so the approximation only ever widens a setback.
  const sides = 16, capRadius = 1 / Math.cos(Math.PI / sides);
  const disc = (centre: Ring[number], d: number): Ring => Array.from({ length: sides }, (_, k) => {
    const angle = (k + 0.5) * 2 * Math.PI / sides;
    return [centre[0] + Math.cos(angle) * d * capRadius, centre[1] + Math.sin(angle) * d * capRadius];
  });
  const zones: Ring[] = [];
  plot.forEach((a, i) => {
    const b = plot[(i + 1) % plot.length], d = distances[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length || !(d > 0)) return;
    const nx = -(b[1] - a[1]) / length * d, ny = (b[0] - a[0]) / length * d;
    zones.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], disc(a, d), disc(b, d));
  });
  return difference([[plot]], union(zones));
}
export function generateEnvelope(input: Ring, controls: ParcelControls): Envelope {
  const warnings: string[] = [];
  const empty = (binding: string): Envelope => ({ footprint: [], storeys: 0, heightM: 0, grossFloorAreaM2: 0, binding, warnings });
  const plot = normalizeRing(input);
  if (!plot) { warnings.push("Draw a valid parcel polygon."); return empty("unavailable"); }
  const c = controls, bouwvlakMode = !!(c.bouwvlakMode || c.bouwvlakPolygon), floorHeight = c.floorHeightM ?? 3.5;
  if (!Number.isFinite(floorHeight) || floorHeight <= 0) { warnings.push("Enter a positive floor height."); return empty("unavailable"); }
  const cap = heightLimit(c) ?? (c.maxFloors === undefined ? undefined : c.maxFloors * floorHeight);
  if (cap === undefined) { warnings.push("Enter a height or floors cap to generate an envelope."); return empty("unavailable"); }
  if (bouwvlakMode && !c.bouwvlakPolygon) { warnings.push('Load a bouwvlak polygon in a preset or draw a second site limit named "bouwvlak".'); return empty("unavailable"); }
  if (!bouwvlakMode && !c.roadEdges.length && (c.setbackRoadM !== undefined || c.jurisdiction === "riyadh")) warnings.push("Classify road edges before relying on this envelope.");
  if (c.jurisdiction === "serbia") warnings.push("Classify north sides as Neighbour and south sides as Other; verify remaining boundaries against the plot document.");
  if (c.jurisdiction === "spain" && !c.otherEdges?.length) warnings.push("Classify the rear boundary as Other to apply max(2H/3, 4 m).");
  if (bouwvlakMode) warnings.push(`Bouwvlak intersection only: verify road axis${c.roadAxisDistanceM === undefined ? "" : ` (${c.roadAxisDistanceM} m)`}, side/rear${c.setbackNeighbourM === undefined ? "" : ` (${c.setbackNeighbourM} m)`} and eaves${c.maxEavesM === undefined ? "" : ` (${c.maxEavesM} m)`} separately; no road-axis or roof geometry is supplied.`);
  if (c.heightDatum === "cornice") warnings.push("Height uses the cornice cap as a massing approximation; verify roof and access-façade datum separately.");
  const budget = c.maxFar === undefined ? Infinity : c.maxFar * polygonArea(plot);
  const recap = (area: number) => {
    const candidates = [
      { n: Math.floor(cap / floorHeight + 1e-9), name: c.maxHeightM === undefined && !c.dubaiHeightRule ? "floors-limited" : "height-limited" },
      { n: Math.floor(budget / area + 1e-9), name: "FAR-limited" },
      { n: c.maxFloors ?? Infinity, name: "floors-limited" },
    ];
    const n = Math.max(0, Math.min(...candidates.map(v => v.n)));
    return { n, binding: [...new Set(candidates.filter(v => v.n === n).map(v => v.name))].join(", ") };
  };
  const footprintAt = (height: number): MultiPolygon | null => {
    if (bouwvlakMode) return intersection([[plot]], [[c.bouwvlakPolygon!]]);
    const distances = plot.map((_, i) => requiredSetback(c, i, height, Math.floor(height / floorHeight + 1e-9)));
    if (distances.some(d => d === undefined)) return null;
    return insetPerEdge(plot, distances as number[]);
  };
  let height = cap, previousArea = -1, footprint: MultiPolygon = [], converged = false;
  for (let i = 0; i < 5; i++) {
    const next = footprintAt(height);
    if (!next) { warnings.push("Enter setbacks for every edge kind and a positive street width where required."); return empty("unavailable"); }
    footprint = next;
    const area = multiArea(footprint);
    if (area < 1e-8) { warnings.push("setbacks leave no buildable area"); return empty("setbacks-limited"); }
    const nextHeight = recap(area).n * floorHeight;
    if (Math.abs(area - previousArea) < 0.1 && Math.abs(nextHeight - height) < 1e-8) { converged = true; break; }
    previousArea = area; height = nextHeight;
  }
  if (!converged) {
    warnings.push("Height-dependent setbacks did not converge within 5 iterations; showing the conservative footprint at the height cap.");
    footprint = footprintAt(cap)!;
  }
  const area = multiArea(footprint), { n: storeys, binding } = recap(area);
  if (c.maxCoveragePct !== undefined && area > polygonArea(plot) * c.maxCoveragePct / 100 + 1e-8) warnings.push(`coverage-limited: footprint must shrink to ${Number((polygonArea(plot) * c.maxCoveragePct / 100).toFixed(2))} m²; displayed footprint is not a compliant building shape.`);
  if (!storeys) warnings.push("No full storey fits this footprint and floor-height assumption; revise the shape or controls.");
  return { footprint, storeys, heightM: storeys * floorHeight, grossFloorAreaM2: area * storeys, binding, warnings };
}
/** Triangle soup, shared by the temporary overlay and saved element. */
export function envelopeMesh(envelope: Envelope): number[] {
  const vertices: number[] = [], h = envelope.heightM;
  for (const polygon of envelope.footprint) {
    if (polygon.length > 1) throw new Error("Envelope with holes cannot be triangulated; simplify the building-area polygon.");
    const ring = normalizeRing(polygon[0]);
    if (!ring) continue;
    const ccw = signedArea(ring) > 0 ? ring : [...ring].reverse();
    for (const tri of triangulate(ccw)) {
      for (const p of tri) vertices.push(p[0], p[1], h);
      for (const p of [...tri].reverse()) vertices.push(p[0], p[1], 0);
    }
    ccw.forEach((a, i) => {
      const b = ccw[(i + 1) % ccw.length];
      vertices.push(...a, 0, ...b, 0, ...b, h, ...a, 0, ...b, h, ...a, h);
    });
  }
  return vertices;
}
