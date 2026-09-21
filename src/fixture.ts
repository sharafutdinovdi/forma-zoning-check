import type { SiteData, Building } from "./metrics";
import type { Ring } from "./geometry";
import { usePreset } from "./rules";
// Synthetic tree mirrors the live base-group ancestry; identifiers are fixture-only.
export const fixtureRootTree = {
  element: {
    urn: "urn:adsk-forma-elements:proposal:fixture:proposal:1",
    properties: { category: "proposal", flags: { "fixture-base": { base: true, scenario: true, fixed: true, lock: true } } },
    children: [{ key: "fixture-base", urn: "urn:adsk-forma-elements:group:fixture:base:1" }, { key: "fixture-native", urn: "urn:adsk-forma-elements:basicbuilding:fixture:native:1" }],
  },
  elements: {
    "urn:adsk-forma-elements:group:fixture:base:1": {
      urn: "urn:adsk-forma-elements:group:fixture:base:1",
      properties: { category: "group" },
      children: [{ key: "existing", urn: "urn:adsk-forma-elements:basic:fixture:hash+uuid:1" }],
    },
  },
};
export const fixtureStates = ["ready", "no-site-limit", "no-buildings-on-plot", "loading", "error"] as const;
export type AppState = typeof fixtureStates[number];
function rectangle(x: number, y: number, w: number, h: number): Ring { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
export function fixtureData(state: AppState, existing = false, existingOnly = false): SiteData {
  const buildings: Building[] = [
    { kind: "proposal", geometrySource: "floorstack", path: "fixture/a", name: "01 · Courtyard", footprint: rectangle(10, 12, 15, 12), height: 21, baseZ: 0, floors: 6, floorsEstimated: false, crossesBoundary: false, note: "Synthetic floor plates", floorPlates: Array.from({ length: 6 }, (_, i) => ({ polygon: [rectangle(10, 12, 15, 12)], elevation: i * 3.5 })) },
    { kind: "proposal", geometrySource: "footprint", path: "fixture/b", name: "02 · Tower", footprint: rectangle(34, 12, 12, 14), height: 91, baseZ: 0, floors: 26, floorsEstimated: true, crossesBoundary: false, note: "Synthetic height; floor count estimated" },
    { kind: "proposal", geometrySource: "footprint", path: "fixture/c", name: "03 · Street pavilion", footprint: rectangle(14, 2, 14, 6), height: 10.5, baseZ: 0, floors: 3, floorsEstimated: true, crossesBoundary: false, note: "Synthetic height; floor count estimated" },
  ];
  buildings.push({ kind: "proposal", urn: fixtureBasicBuilding.urn, path: "root/fixture-native", name: "05 · Forma native stack", geometrySource: "floorstack", footprint: fixtureFloorStack[0].polygon, footprintPolygons: [[fixtureFloorStack[0].polygon]],
    height: fixtureFloorStack.reduce((sum, f) => sum + f.height, 0), baseZ: 0, floors: fixtureFloorStack.length, floorsEstimated: false, crossesBoundary: false,
    floorPlates: fixtureFloorStack.map((f, i) => ({ polygon: [f.polygon], elevation: fixtureFloorStack.slice(0, i).reduce((sum, floor) => sum + floor.height, 0) })),
    note: "Geometry source: floorstack; synthetic basicbuilding, three exact model floors" });
  for (const building of buildings) if (!building.note.startsWith("Geometry source:")) building.note = `Geometry source: ${building.geometrySource}; ${building.note}`;
  if (existingOnly) buildings.length = 0;
  if (existing || existingOnly) buildings.push({ kind: "existing", geometrySource: "footprint", urn: "urn:adsk-forma-elements:basic:fixture:hash+uuid:1", path: "root/fixture-base/existing", name: "04 · Existing context", footprint: rectangle(48, 26, 8, 8), height: 105, baseZ: 0, floors: 30, floorsEstimated: true, crossesBoundary: false, note: "Geometry source: footprint; synthetic existing building; excluded by default" });
  return { proposalId: existingOnly ? "fixture-al-jadaf-existing-only" : "fixture-al-jadaf", rootUrn: fixtureRootTree.element.urn, proposalName: "Proposal 1", plot: state === "no-site-limit" ? null : rectangle(0, 0, 60, 40), buildings: state === "no-site-limit" ? [] : state === "no-buildings-on-plot" ? buildings.filter(b => b.kind === "existing") : buildings, incompleteGeometry: false, warnings: [] };
}
export function fixtureControls() {
  const c = usePreset("dda-3261507");
  c.roadEdges = [0];
  return c;
}

// Declared graphBuilding shape: ordered levels, surface loops and level heights.
// The throwaway SDK test feeds this representation through the real provider.
export const fixtureFloorStack = [
  { polygon: rectangle(4, 27, 12, 10), height: 3 },
  { polygon: rectangle(5, 28, 10, 8), height: 4 },
  { polygon: rectangle(6, 29, 8, 6), height: 2.5 },
];
export const fixtureGraphBuilding = {
  units: [],
  levels: fixtureFloorStack.map(({ polygon, height }, floor) => ({
    height,
    points: Object.fromEntries(polygon.map((p, i) => [`p${i}`, p])),
    surfaces: polygon.map((_, i) => ({ id: `s${i}`, pointA: `p${i}`, pointB: `p${(i + 1) % polygon.length}` })),
    spaces: [{ id: `floor${floor}`, outerLoop: polygon.map((_, i) => ({ id: `c${i}`, partnerId: null, surfaceId: `s${i}`, directionAToB: true })) }],
  })),
};
export const fixtureBasicBuilding = {
  urn: "urn:adsk-forma-elements:basicbuilding:fixture:native:1" as const,
  properties: { category: "building" },
  representations: { graphBuilding: { type: "embedded-json" as const, data: fixtureGraphBuilding } },
};
