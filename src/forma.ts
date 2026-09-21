import { Forma } from "forma-embedded-view-sdk/auto";
import clipping from "polygon-clipping";
import { normalizeRing, multiArea } from "./geometry";
import type { Point, Polygon, MultiPolygon } from "./geometry";
import { onPlot } from "./metrics";
import type { SiteData, Building } from "./metrics";

export { Forma };
type ElementTree = Awaited<ReturnType<typeof Forma.elements.get>>;
// One resolver per snapshot: child keys are path segments, not URN fragments.
export function buildingKind(rootTree: ElementTree, getElement = (urn: ElementTree["element"]["urn"]) => Forma.elements.get({ urn })) {
  const { element: root } = rootTree;
  const elements: ElementTree["elements"] = { ...rootTree.elements, [root.urn]: root };
  const pending = new Map<string, Promise<ElementTree["element"]>>();
  const flags = root.properties?.flags;
  return async (path: string): Promise<Building["kind"]> => {
    const keys = path.split("/").slice(1, -1);
    if (/:group:[^:]+:base:/.test(root.urn) || keys.some(key => flags?.[key]?.base === true)) return "existing";
    let ancestor = root;
    for (const key of keys) {
      const child = ancestor.children?.find(child => child.key === key);
      if (!child) throw new Error(`Cannot resolve building ancestor: ${path}`);
      if (/:group:[^:]+:base:/.test(child.urn)) return "existing";
      if (!elements[child.urn]) {
        if (!pending.has(child.urn)) pending.set(child.urn, getElement(child.urn).then(response => {
          Object.assign(elements, response.elements, { [child.urn]: response.element });
          return response.element;
        }));
        await pending.get(child.urn);
      }
      ancestor = elements[child.urn];
    }
    return "proposal";
  };
}
export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try { return JSON.stringify(error) ?? String(error); } catch { return String(error); }
}
function shape(value: unknown): unknown {
  if (value === undefined) return { type: "undefined" };
  if (value === null) return { type: "null" };
  if (ArrayBuffer.isView(value)) return { type: value.constructor.name, byteLength: value.byteLength };
  if (Array.isArray(value)) return { type: "array", length: value.length, sample: value.length ? shape(value[0]) : null };
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  return { type: typeof value, value };
}
export interface GeometryAttempt { method: string; path: string; resultShape?: unknown; acceptedShape?: unknown; error?: string }
export interface GeometryDiagnostics {
  attempts: GeometryAttempt[];
  children: { key: string; urn: string; path: string; category: string | null; error?: string }[];
  triangles?: { vertexCount: number; zMin: number | null; zMax: number | null };
}
// This is a read-only subset of the installed SDK, also used by the synthetic fixture.
export type GeometryApi = {
  geometry: Pick<typeof Forma.geometry, "getFootprint" | "getTriangles">;
  elements: Pick<typeof Forma.elements, "get" | "getWorldTransform"> & {
    representations: Pick<typeof Forma.elements.representations, "graphBuilding" | "grossFloorAreaPolygons">;
  };
};
export async function buildingGeometry(path: string, rootUrn: string, tree: ElementTree, api: GeometryApi = Forma) {
  const { element } = tree;
  const diagnostics: GeometryDiagnostics = { attempts: [], children: [] };
  async function attempt<T, R>(method: string, target: string, read: () => Promise<T>, accept: (value: T) => R): Promise<R | null> {
    const entry: GeometryAttempt = { method, path: target };
    diagnostics.attempts.push(entry);
    try { const raw = await read(); entry.resultShape = shape(raw); const result = accept(raw); entry.acceptedShape = shape(result); return result; }
    catch (error) { entry.error = errorText(error); return null; }
  }
  const footprintAt = (target: string) => attempt("getFootprint", target, () => api.geometry.getFootprint({ path: target, urn: rootUrn }), raw => {
    const ring = raw?.type === "Polygon" ? normalizeRing(raw.coordinates) : null;
    if (!ring) throw new Error(raw === undefined ? "getFootprint returned undefined" : `getFootprint returned invalid polygon (${raw?.type ?? "null"})`);
    return [ring] as Polygon;
  });
  // Preserve the old call's exact result/error even if a better representation succeeds.
  const direct = await footprintAt(path);
  for (const child of element.children ?? []) {
    const target = `${path}/${child.key}`;
    const record: GeometryDiagnostics["children"][number] = { key: child.key, urn: child.urn, path: target, category: null };
    try { record.category = (tree.elements[child.urn] ?? (await api.elements.get({ urn: child.urn })).element).properties?.category ?? null; }
    catch (error) { record.error = errorText(error); }
    diagnostics.children.push(record);
  }
  let polygons: MultiPolygon = [], source: Building["geometrySource"] = null;
  let plates: Building["floorPlates"], floors: number | null = null, height: number | null = null, baseZ: number | null = null;
  let transform: number[] | undefined;
  async function worldTransform() {
    if (transform) return transform;
    const { transform: t } = await api.elements.getWorldTransform({ path });
    if (t.length !== 16 || t.some(n => !Number.isFinite(n)) || Math.abs(t[2]) + Math.abs(t[6]) + Math.abs(t[8]) + Math.abs(t[9]) + Math.abs(t[3]) + Math.abs(t[7]) + Math.abs(t[11]) > 1e-8 || t[10] <= 0 || Math.abs(t[15] - 1) > 1e-8) throw new Error("Invalid or tilted floor transform");
    transform = t;
    return t;
  }
  function worldPolygon(polygon: Polygon, t: number[]): Polygon {
    const rings = polygon.map(ring => {
      const normalized = normalizeRing(ring.map(([x, y]) => [t[0] * x + t[4] * y + t[12], t[1] * x + t[5] * y + t[13]] as Point));
      if (!normalized) throw new Error("Invalid floor polygon");
      return normalized;
    });
    if (!rings.length || multiArea([rings]) <= 0) throw new Error("Empty floor polygon");
    return rings;
  }
  // floorStack itself is creation-only in 0.96.0. graphBuilding is the declared
  // read-side representation with ordered levels, polygons and per-level heights.
  const native = /:basicbuilding:/.test(element.urn);
  if (native || element.representations?.graphBuilding) {
    const graph = await attempt("representations.graphBuilding", path, () => api.elements.representations.graphBuilding({ urn: element.urn }), raw => {
      if (!raw?.data.levels.length) throw new Error("graphBuilding returned no levels");
      return raw.data;
    });
    if (graph) {
      const stack = await attempt("graphBuilding.floorStack", path, worldTransform, t => {
        let elevation = t[14];
        const stackPlates: NonNullable<Building["floorPlates"]> = [];
        for (const level of graph.levels) {
          if (!Number.isFinite(level.height) || level.height <= 0 || !level.spaces.length) throw new Error("Invalid or empty graphBuilding level");
          const surfaces = new Map(level.surfaces.map(surface => [surface.id, surface]));
          const loop = (edges: typeof level.spaces[number]["outerLoop"]) => {
            const segments = edges.map(edge => {
              const surface = surfaces.get(edge.surfaceId);
              if (!surface) throw new Error(`Missing graphBuilding surface: ${edge.surfaceId}`);
              return edge.directionAToB ? [surface.pointA, surface.pointB] : [surface.pointB, surface.pointA];
            });
            return segments.map(([start, end], i) => {
              if (end !== segments[(i + 1) % segments.length][0] || !level.points[start]) throw new Error("Disconnected graphBuilding loop");
              return level.points[start]!;
            });
          };
          const spaces = level.spaces.map(space => worldPolygon([loop(space.outerLoop), ...(space.innerLoops ?? []).map(loop)], t));
          for (const polygon of clipping.union(spaces)) stackPlates.push({ polygon, elevation });
          elevation += level.height * t[10];
        }
        return { plates: stackPlates, polygons: clipping.union(stackPlates.map(f => f.polygon)), base: t[14], height: elevation - t[14], floors: graph.levels.length };
      });
      if (stack) { polygons = stack.polygons; plates = stack.plates; height = stack.height; baseZ = stack.base; floors = stack.floors; source = "floorstack"; }
    }
  }
  if (!source && (native || element.representations?.grossFloorAreaPolygons)) {
    const gfa = await attempt("representations.grossFloorAreaPolygons", path, () => api.elements.representations.grossFloorAreaPolygons({ urn: element.urn }), raw => {
      if (!raw?.data.length) throw new Error("grossFloorAreaPolygons returned no floors");
      return raw.data;
    });
    if (gfa) {
      const stack = await attempt("grossFloorAreaPolygons.floorStack", path, worldTransform, t => {
        const floorPlates = gfa.map(f => {
          if (!Number.isFinite(f.elevation)) throw new Error("Invalid floor elevation");
          return { polygon: worldPolygon(f.grossFloorPolygon, t), elevation: t[14] + f.elevation * t[10] };
        });
        return { plates: floorPlates, polygons: clipping.union(floorPlates.map(f => f.polygon)), floors: new Set(floorPlates.map(f => f.elevation)).size };
      });
      if (stack) { plates = stack.plates; polygons = stack.polygons; floors = stack.floors; source = "floorstack"; }
    }
  }
  // The direct call remains the proven path for Overture/basic elements.
  if (!source && !native && direct) { polygons = [direct]; source = "footprint"; }
  if (!source && diagnostics.children.length) {
    const childPolygons: Polygon[] = [];
    for (const child of diagnostics.children) {
      const polygon = await footprintAt(child.path);
      if (polygon) childPolygons.push(polygon);
    }
    // A partial child union must not masquerade as the complete building.
    const children = await attempt("children.union", path, async () => childPolygons, values => {
      if (values.length !== diagnostics.children.length) throw new Error("Some child footprints are unavailable");
      return clipping.union(values);
    });
    if (children?.length) { polygons = children; source = "children"; }
  }
  const mesh = await attempt("getTriangles", path, () => api.geometry.getTriangles({ path, urn: rootUrn }), raw => {
    let min = Infinity, max = -Infinity;
    for (let i = 2; i < raw.length; i += 3) if (Number.isFinite(raw[i])) { min = Math.min(min, raw[i]); max = Math.max(max, raw[i]); }
    diagnostics.triangles = { vertexCount: raw.length / 3, zMin: Number.isFinite(min) ? min : null, zMax: Number.isFinite(max) ? max : null };
    if (!raw.length || raw.length % 9 || raw.some(n => !Number.isFinite(n))) throw new Error("Invalid or empty triangle array");
    return { vertices: raw, min, max };
  });
  if (mesh && height === null && mesh.max > mesh.min) { height = mesh.max - mesh.min; baseZ = mesh.min; }
  if (!source && mesh) {
    const projected = await attempt("triangles.xyUnion", path, async () => mesh.vertices, vertices => {
      // Union batches avoid an argument-count limit on large meshes. Vertical faces
      // have zero projected area and contribute no area to the ground projection.
      let merged: MultiPolygon = [], batch: Polygon[] = [];
      for (let i = 0; i < vertices.length; i += 9) {
        const ring = normalizeRing([[vertices[i], vertices[i + 1]], [vertices[i + 3], vertices[i + 4]], [vertices[i + 6], vertices[i + 7]]]);
        if (ring) batch.push([ring]);
        if (batch.length === 256) { merged = clipping.union(merged, batch); batch = []; }
      }
      if (batch.length) merged = clipping.union(merged, batch);
      if (!merged.length) throw new Error("Triangles have no non-zero XY projection");
      return merged;
    });
    if (projected) { polygons = projected; source = "triangles"; }
  }
  // Preserve a readable direct footprint if all preferred native methods fail.
  if (!source && direct) { polygons = [direct]; source = "footprint"; }
  if (height === null) {
    const value: unknown = element.properties?.height;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) height = value;
  }
  const floorsEstimated = floors === null && height !== null;
  if (floorsEstimated) floors = Math.ceil(height! / 3.5);
  const geometryError = source ? undefined : diagnostics.attempts.filter(a => a.error).map(a => `${a.method} (${a.path}): ${a.error}`).join("; ");
  const geometry: Pick<Building, "footprint" | "footprintPolygons" | "geometrySource" | "geometryError" | "height" | "baseZ" | "floors" | "floorsEstimated" | "floorPlates" | "note"> = {
    footprint: polygons[0]?.[0] ?? [], footprintPolygons: polygons, geometrySource: source, geometryError,
    height, baseZ, floors, floorsEstimated, floorPlates: plates,
    note: source ? `Geometry source: ${source}${plates ? "; GFA from model floor polygons; exact model floor count" : ""}${floorsEstimated ? "; floors estimated as ceil(height / 3.5)" : ""}${height !== null && baseZ === null ? "; height from unverified properties.height (metres assumed)" : ""}` : `${geometryError}; plot membership unknown; check model geometry and refresh`,
  };
  return { geometry, diagnostics };
}
// Retain load-time diagnostics, including buildings outside the plot, for this revision.
let geometrySnapshot: { rootUrn: string; entries: Map<string, Awaited<ReturnType<typeof buildingGeometry>>> } | undefined;
export async function loadDebugDump(snapshot: SiteData) {
  if (!snapshot.rootUrn) throw new Error("Debug snapshot has no root URN");
  const rootUrn = snapshot.rootUrn as Awaited<ReturnType<typeof Forma.proposal.getRootUrn>>;
  const [rootResponse, paths, sitePaths] = await Promise.all([
    Forma.elements.get({ urn: rootUrn }),
    Forma.geometry.getPathsByCategory({ category: "building", urn: rootUrn }),
    Forma.geometry.getPathsByCategory({ category: "site_limit", urn: rootUrn }),
  ]);
  const classify = buildingKind(rootResponse);
  const children = await Promise.all((rootResponse.element.children ?? []).map(async ({ key, urn }) => {
    try {
      const element = rootResponse.elements[urn] ?? (await Forma.elements.get({ urn })).element;
      const properties = element.properties ?? {};
      return { key, urn, category: properties.category ?? null, name: properties.name ?? null, propertyKeys: Object.keys(properties) };
    } catch (error) { return { key, urn, error: errorText(error) }; }
  }));
  async function inspect(path: string, building = false) {
    try {
      const parentPath = path.split("/").slice(0, -1).join("/");
      const [tree, parent] = await Promise.all([
        Forma.elements.getByPath({ path, rootUrn }),
        parentPath && parentPath !== "root" ? Forma.elements.getByPath({ path: parentPath, rootUrn }) : Promise.resolve(parentPath ? rootResponse : null),
      ]);
      const { element } = tree, properties = element.properties ?? {};
      const result = building ? (geometrySnapshot?.rootUrn === rootUrn ? geometrySnapshot.entries.get(path) : undefined) ?? await buildingGeometry(path, rootUrn, tree) : undefined;
      return { path, urn: element.urn, propertyKeys: Object.keys(properties), properties, representations: shape(element.representations), parentUrn: parent?.element.urn ?? null, parentCategory: parent?.element.properties?.category ?? null,
        ...(result ? { geometrySource: result.geometry.geometrySource, geometryError: result.geometry.geometryError, ...result.diagnostics } : {}) };
    } catch (error) { return { path, error: errorText(error) }; }
  }
  const [buildings, siteLimit] = await Promise.all([
    Promise.all([...new Set(paths)].map(path => inspect(path, true))),
    sitePaths.length ? inspect(sitePaths[0]) : Promise.resolve(null),
  ]);
  if (await Forma.proposal.getRootUrn() !== rootUrn) throw new Error("Proposal changed while collecting debug data; refresh");
  return { sdkVersion: "0.96.0", rootUrn, proposalId: snapshot.proposalId, rootElement: { ...rootResponse, children }, buildings, siteLimit,
    discriminator: await Promise.all(buildings.map(async ({ path }) => {
      try { return { path, kind: await classify(path) }; } catch (error) { return { path, error: errorText(error) }; }
    })),
  };
}
export async function loadSite(): Promise<SiteData> {
  await Forma.proposal.awaitProposalPersisted();
  const [rootUrn, proposalId] = await Promise.all([Forma.proposal.getRootUrn(), Forma.proposal.getId()]);
  const [rootTree, sitePaths] = await Promise.all([
    Forma.elements.get({ urn: rootUrn }),
    Forma.geometry.getPathsByCategory({ category: "site_limit", urn: rootUrn }),
  ]);
  const { element: root } = rootTree;
  const classify = buildingKind(rootTree);
  const entries = new Map<string, Awaited<ReturnType<typeof buildingGeometry>>>();
  const data: SiteData = { proposalId, rootUrn, proposalName: typeof root.properties?.name === "string" ? root.properties.name : proposalId, plot: null, buildings: [], incompleteGeometry: false, warnings: [] };
  if (sitePaths.length > 1) throw new Error("Multiple site limits found; keep one parcel site limit, then refresh.");
  if (sitePaths.length) {
    const footprint = await Forma.geometry.getFootprint({ path: sitePaths[0], urn: rootUrn });
    data.plot = footprint?.type === "Polygon" ? normalizeRing(footprint.coordinates) : null;
    if (!data.plot) throw new Error("Site limit is not a valid polygon; redraw it, then refresh.");
  }
  if (data.plot) {
    const paths = [...new Set(await Forma.geometry.getPathsByCategory({ category: "building", urn: rootUrn }))];
    // A building's nested floor elements must not become extra counted buildings.
    for (const path of paths.filter(path => !paths.some(parent => path.startsWith(`${parent}/`)))) {
      const kind = await classify(path);
      let building: Building;
      try {
        const tree = await Forma.elements.getByPath({ path, rootUrn });
        const result = await buildingGeometry(path, rootUrn, tree);
        entries.set(path, result);
        building = { path, kind, urn: tree.element.urn, name: typeof tree.element.properties?.name === "string" ? tree.element.properties.name : path.split("/").at(-1) ?? path, crossesBoundary: false, ...result.geometry };
      } catch (error) {
        const text = errorText(error);
        building = { path, kind, name: path.split("/").at(-1) ?? path, footprint: [], footprintPolygons: [], geometrySource: null, geometryError: text, height: null, baseZ: null, floors: null, floorsEstimated: false, crossesBoundary: false, note: `${text}; plot membership unknown; check model geometry and refresh` };
      }
      if (building.footprintPolygons?.length) {
        const match = onPlot(building.footprintPolygons, data.plot);
        if (!match.counted) continue;
        building.crossesBoundary = match.crossesBoundary;
      } else if (kind === "existing") data.incompleteExistingGeometry = true;
      else data.incompleteGeometry = true;
      data.buildings.push(building);
    }
  }
  if (data.incompleteExistingGeometry) data.warnings.push("Some existing footprints are unavailable; unresolved buildings are listed and counted when included, but plot membership is unknown.");
  if (data.incompleteGeometry) data.warnings.push("Some building footprints are unavailable. Unresolved buildings remain in N; plot membership and totals are incomplete. Check their errors in Buildings and refresh.");
  if (await Forma.proposal.getRootUrn() !== rootUrn || await Forma.proposal.getId() !== proposalId) throw new Error("Proposal changed while loading; refresh to read one snapshot.");
  geometrySnapshot = { rootUrn, entries };
  return data;
}
export async function openFullPanel(): Promise<void> {
  const url = new URL(window.location.href);
  url.searchParams.delete("fixture"); url.searchParams.delete("state");
  await Forma.openFloatingPanel({ embeddedViewId: "zoning-check-full", url: url.href, title: "Zoning Check", preferredSize: { width: 440, height: 720 }, minimumWidth: 360, placement: { type: "center" } });
}

export async function siteFingerprint(): Promise<string> {
  const [rootUrn, proposalId] = await Promise.all([Forma.proposal.getRootUrn(), Forma.proposal.getId()]);
  const [sites, buildings] = await Promise.all([
    Forma.geometry.getPathsByCategory({ category: "site_limit", urn: rootUrn }),
    Forma.geometry.getPathsByCategory({ category: "building", urn: rootUrn }),
  ]);
  const source = JSON.stringify([proposalId, rootUrn, sites.length, [...sites].sort().join(), buildings.length, [...buildings].sort().join()]);
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return String(hash >>> 0);
}
