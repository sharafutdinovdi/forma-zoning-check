import { envelopeMesh } from "./envelope";
import type { Envelope } from "./envelope";
import { Forma } from "./forma";
import { setbackBand, triangulate } from "./geometry";
import type { Ring } from "./geometry";
import type { Report, SiteData, Status } from "./metrics";
import { buildingPolygons, edgeLimit } from "./metrics";
import { heightLimit } from "./rules";
import type { ParcelControls } from "./rules";

const colors: Record<Status, number[]> = { pass: [106, 151, 40], fail: [221, 34, 34], insufficient: [128, 128, 128] };
let generation = 0;
let pending: Promise<unknown> = Promise.resolve();

/** Small local mesh coordinates preserve precision; translation uses Forma's metric frame. */
async function prism(ring: Ring, bottom: number, top: number, rgb: number[], alpha = 115): Promise<void> {
  const ox = ring[0][0], oy = ring[0][1], positions: number[] = [];
  const vertex = (p: [number, number], z: number) => positions.push(p[0] - ox, p[1] - oy, z - bottom);
  for (const triangle of triangulate(ring)) {
    triangle.forEach(p => vertex(p, top));
    [...triangle].reverse().forEach(p => vertex(p, bottom));
  }
  if (top > bottom) ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    // Double-sided walls, independent of footprint winding.
    for (const tri of [[a, b, b], [a, b, a]]) {
      const zs = tri[2] === a ? [bottom, top, top] : [bottom, bottom, top];
      tri.forEach((p, j) => vertex(p, zs[j]));
      [...tri].reverse().forEach((p, j) => vertex(p, zs[2 - j]));
    }
  });
  const color = new Uint8Array(positions.length / 3 * 4);
  for (let i = 0; i < color.length; i += 4) color.set([...rgb, alpha], i);
  await Forma.render.addMesh({ geometryData: { position: new Float32Array(positions), color }, transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ox, oy, bottom, 1] });
}
export function clearOverlays(): Promise<void> {
  generation++;
  const job = pending.catch(() => {}).then(async () => { envelopeMeshes = []; await Forma.render.cleanup(); });
  pending = job;
  return job;
}
export function renderOverlays(data: SiteData, controls: ParcelControls, report: Report, envelope: Envelope | null = null): Promise<string[]> {
  const token = ++generation;
  const job = pending.catch(() => {}).then(async () => {
    await fadeEnvelope(false, token);
    await Forma.render.cleanup();
    envelopeMeshes = [];
    const warnings: string[] = [];
    if (token !== generation) return warnings;
    try {
      for (const { building, status } of report.buildings) {
        if (token !== generation) return warnings;
        if (!buildingPolygons(building).length) continue;
        if (building.baseZ === null) { warnings.push(`${building.name}: overlay omitted; base elevation unavailable.`); continue; }
        const top = building.baseZ + (building.height ?? 0.5);
        const limit = heightLimit(controls);
        for (const polygon of buildingPolygons(building)) {
          if (token !== generation) return warnings;
          if (polygon.length > 1) { warnings.push(`${building.name}: courtyard overlay omitted; numeric checks retain holes.`); continue; }
          await prism(polygon[0], building.baseZ, top, colors[status]);
          if (token !== generation) return warnings;
          if (limit !== undefined && building.height !== null && building.height > limit) await prism(polygon[0], building.baseZ + limit, top, [255, 69, 26], 150);
        }
      }
      if (!controls.includeExisting) for (const building of data.buildings.filter(b => b.kind === "existing")) {
        if (token !== generation) return warnings;
        if (building.baseZ === null) { warnings.push(`${building.name}: excluded context tint omitted; base elevation unavailable.`); continue; }
        for (const polygon of buildingPolygons(building)) {
          if (token !== generation) return warnings;
          if (polygon.length > 1) { warnings.push(`${building.name}: courtyard context tint omitted; numeric checks retain holes.`); continue; }
          await prism(polygon[0], building.baseZ, building.baseZ + (building.height ?? 0.5), [107, 114, 128], 38);
        }
      }
      const counted = report.buildings.map(b => b.building);
      const bases = counted.flatMap(b => b.baseZ === null ? [] : [b.baseZ]);
      if (data.plot && bases.length) {
        const z = Math.min(...bases) + 0.05;
        for (let edge = 0; edge < data.plot.length; edge++) {
          if (token !== generation) return warnings;
          const widths = counted.flatMap(b => { const n = edgeLimit(controls, edge, b); return n === undefined ? [] : [n]; });
          if (!widths.length) continue;
          const width = Math.max(...widths);
          for (const polygon of setbackBand(data.plot, edge, width)) {
            if (polygon.length !== 1) throw new Error("Setback band with holes cannot be rendered by simple-ring triangulation");
            await prism(polygon[0], z, z, controls.roadEdges.includes(edge) ? [0, 38, 255] : [107, 107, 136], 60);
          }
        }
      }
      if (envelope?.storeys && token === generation) {
        const bases = data.buildings.flatMap(b => b.baseZ === null ? [] : [b.baseZ]);
        const base = data.plotBaseZ ?? (bases.length ? Math.min(...bases) : undefined);
        if (base === undefined) warnings.push("Envelope overlay omitted: parcel elevation is unavailable. Add model geometry or verify the parcel elevation.");
        else {
          if (data.plotBaseZ === undefined) warnings.push("Envelope base uses the lowest known building elevation; verify the parcel datum.");
          await addEnvelope(envelope, base);
          await fadeEnvelope(true, token);
        }
      }
      return warnings;
    } catch (error) {
      // Do not leave a partial, potentially misleading set after a render rejection.
      await Forma.render.cleanup();
      throw error;
    }
  });
  pending = job;
  return job;
}

let envelopeMeshes: { id: string; position: Float32Array; transform: [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]; alpha: number }[] = [];
function accent(): number[] {
  const color = getComputedStyle(document.documentElement).getPropertyValue("--background-color-accent").trim();
  return /^#[\da-f]{6}$/i.test(color) ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : [6, 150, 215];
}
async function addEnvelope(envelope: Envelope, base: number): Promise<void> {
  const first = envelope.footprint[0][0][0];
  const transform: typeof envelopeMeshes[number]["transform"] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, first[0], first[1], base, 1];
  const local = (vertices: number[]) => new Float32Array(vertices.map((n, i) => n - (i % 3 === 0 ? first[0] : i % 3 === 1 ? first[1] : 0)));
  const positions = [local(envelopeMesh(envelope))];
  const outline: number[] = [];
  for (const polygon of envelope.footprint) for (const ring of polygon) ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!length) return;
    const dx = -(b[1] - a[1]) / length * 0.04, dy = (b[0] - a[0]) / length * 0.04, z = envelope.heightM + 0.01;
    outline.push(a[0] - dx, a[1] - dy, z, b[0] - dx, b[1] - dy, z, b[0] + dx, b[1] + dy, z,
      a[0] - dx, a[1] - dy, z, b[0] + dx, b[1] + dy, z, a[0] + dx, a[1] + dy, z);
  });
  positions.push(local(outline));
  for (const [i, position] of positions.entries()) {
    const { id } = await Forma.render.addMesh({ geometryData: { position, color: new Uint8Array(position.length / 3 * 4) }, transform });
    envelopeMeshes.push({ id, position, transform, alpha: i === 0 ? 64 : 220 });
  }
}
async function fadeEnvelope(show: boolean, token: number): Promise<void> {
  if (!envelopeMeshes.length) return;
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.01 : 160;
  const start = performance.now();
  // Sample the same cubic-bezier easing as --ease without adding a motion dependency.
  function ease(x: number): number {
    let low = 0, high = 1;
    for (let i = 0; i < 12; i++) { const t = (low + high) / 2; const bx = 3 * (1 - t) ** 2 * t * 0.16 + 3 * (1 - t) * t * t * 0.3 + t ** 3; if (bx < x) low = t; else high = t; }
    const t = (low + high) / 2; return 1 - (1 - t) ** 3;
  }
  while (token === generation) {
    const progress = Math.min(1, (performance.now() - start) / duration);
    await Promise.all(envelopeMeshes.map(async mesh => {
      const color = new Uint8Array(mesh.position.length / 3 * 4), alpha = Math.round(mesh.alpha * (show ? ease(progress) : 1 - ease(progress)));
      for (let i = 0; i < color.length; i += 4) color.set([...accent(), alpha], i);
      await Forma.render.updateMesh({ id: mesh.id, geometryData: { position: mesh.position, color }, transform: mesh.transform });
    }));
    if (progress === 1) break;
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
}
let pendingLibrary: { proposalId: string; key: string; urn: string } | null = null;
export async function saveEnvelopeToLibrary(envelope: Envelope, proposalId: string): Promise<void> {
  if (!envelope.storeys || !envelope.footprint.length) throw new Error("No envelope volume to save.");
  if (!await Forma.getCanEdit()) throw new Error("Edit access is required to save to the library.");
  if (await Forma.proposal.getId() !== proposalId) throw new Error("Proposal changed; refresh before saving.");
  const verts = envelopeMesh(envelope), origin = envelope.footprint[0][0][0];
  for (let i = 0; i < verts.length; i += 3) { verts[i] -= origin[0]; verts[i + 1] -= origin[1]; }
  const key = JSON.stringify(verts);
  if (!pendingLibrary || pendingLibrary.key !== key || pendingLibrary.proposalId !== proposalId) {
    const { urn } = await Forma.integrateElements.createElementHierarchy({ data: {
      rootElement: "envelope", elements: { envelope: { id: "envelope", properties: {
        name: "Permitted envelope · estimated", category: "generic",
        geometry: { type: "Inline", format: "Mesh", verts, faces: Array.from({ length: verts.length / 3 }, (_, i) => i), doubleSided: true },
      } } },
    } });
    pendingLibrary = { proposalId, key, urn };
  }
  if (await Forma.proposal.getId() !== proposalId) throw new Error("Proposal changed during save; return to the original project and retry.");
  await Forma.library.createItem({ data: { name: "Permitted envelope · estimated", status: "success", urn: pendingLibrary.urn } });
  pendingLibrary = null;
}
