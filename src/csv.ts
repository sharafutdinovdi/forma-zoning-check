import type { Building, SiteData, Report } from "./metrics";
import { buildingFootprintArea, buildingGfa, buildingPolygons } from "./metrics";
import type { ParcelControls } from "./rules";
import { numericFields, heightLimit } from "./rules";
import { intersection, multiArea } from "./geometry";
import type { Ring } from "./geometry";
import { formatNumber } from "./ui/controls";
// Percentage points (0–100), shared by the two views and CSV. Holes stay empty.
export function outsidePct(building: Building, plot: Ring | null): number | null {
  if (!plot?.length) return null;
  const area = buildingFootprintArea(building);
  if (area === null || area <= 0) return null;
  const inside = multiArea(intersection(buildingPolygons(building), [[plot]]));
  return Math.max(0, Math.min(100, (area - inside) / area * 100));
}
function escapeCell(value: string): string {
  const safe = /^[\s]*[=+@-]/u.test(value) && !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function serializeCsv(data: SiteData, controls: ParcelControls, report: Report): string {
  const rows: string[][] = [["Section", "Item", "Value", "Limit", "Unit", "Status", "Margin", "Estimated", "Note", "OutsidePct"]];
  const numeric = (value: number | null | undefined) => value == null ? "" : formatNumber(value, undefined, false);
  const outside = new Map(data.buildings.map(b => [b.path, numeric(outsidePct(b, data.plot))]));
  const row = (section: string, key: string, value: string) => rows.push([section, key, value, "", "", "", "", "", ""]);
  for (const c of report.checks) rows.push(["Checks", c.label, numeric(c.value), numeric(c.limit), c.unit, c.status, numeric(c.margin), String(c.estimated), c.note]);
  rows.push(["Checks", "Plot area", numeric(report.plotArea), "", "m²", "", "", "true", "Local metric polygon"]);
  rows.push(["Checks", "GFA", numeric(report.gfa), "", "m²", "", "", String(report.checks[0].estimated), "Whole counted buildings; not clipped at boundary"]);
  for (const b of data.buildings) {
    const status = report.buildings.find(r => r.building.path === b.path)?.status ?? "excluded";
    for (const [label, value, unit, estimated] of [["Footprint", buildingFootprintArea(b), "m²", true], ["Height", b.height, "m", true], ["Floors", b.floors, "floors", b.floorsEstimated], ["GFA", buildingGfa(b), "m²", !b.floorPlates?.length]] as const) rows.push(["Buildings", `${b.name} · ${label}`, numeric(value), "", unit, status, "", String(estimated), `${b.kind}; ${b.path}; ${b.crossesBoundary ? "crosses plot boundary; " : ""}${b.note}`, outside.get(b.path)!]);
  }
  for (const e of report.edges) rows.push(["Buildings", `E${e.edge + 1} · ${data.buildings.find(b => b.path === e.building)?.name ?? e.building}`, numeric(e.value), numeric(e.limit), "m", e.status, numeric(e.margin), "true", "Minimum footprint-to-segment distance; 0.05 m tolerance", outside.get(e.building) ?? ""]);
  row("Controls", "Jurisdiction", controls.jurisdiction); row("Controls", "Preset", controls.presetId);
  row("Controls", "Source", controls.sourceLabel ?? "User-entered controls"); row("Controls", "Source URL", controls.sourceUrl ?? ""); row("Controls", "Caveat", controls.caveat ?? "");
  for (const key of numericFields) row("Controls", key, numeric(controls[key]));
  row("Controls", "Effective height limit m", numeric(heightLimit(controls)));
  row("Controls", "Dubai height rule", String(!!controls.dubaiHeightRule)); row("Controls", "Riyadh apartment neighbour rule", String(!!controls.riyadhApartmentRule));
  row("Controls", "Road edges (first = Riyadh front)", controls.roadEdges.map(n => `E${n + 1}`).join(", "));
  row("Controls", "Counting mode", controls.includeExisting ? "Proposal and existing buildings on plot" : "Proposal buildings only");
  row("Metadata", "Product", "Zoning Check v2.2"); row("Metadata", "Proposal id", data.proposalId); row("Metadata", "Proposal name", data.proposalName);
  row("Metadata", "Exported UTC", new Date().toISOString()); row("Metadata", "Disclaimer", "Estimated massing check — not a compliance statement");
  row("Metadata", "Warnings", data.warnings.join("; "));
  row("Metadata", "Plot coordinates (local metres)", JSON.stringify(data.plot));
  return "\uFEFF" + rows.map(row => (row.length === 9 ? [...row, ""] : row).map(escapeCell).join(";")).join("\r\n") + "\r\n";
}
export function downloadCsv(data: SiteData, controls: ParcelControls, report: Report): void {
  const id = data.proposalId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const url = URL.createObjectURL(new Blob([serializeCsv(data, controls, report)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `zoning-check-${id}-${date}.csv`;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
