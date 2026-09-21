import clipping from "polygon-clipping";
import type { MultiPolygon, Polygon } from "polygon-clipping";

export type Point = [number, number];
export type Ring = Point[];
export type { MultiPolygon, Polygon };
const EPS = 1e-8;

export function signedArea(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  const [ox, oy] = points[0];
  return points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + (x - ox) * (ny - oy) - (nx - ox) * (y - oy);
  }, 0) / 2;
}
export function polygonArea(points: readonly Point[]): number {
  return Math.abs(signedArea(points));
}
export function multiArea(polygons: MultiPolygon): number {
  return polygons.reduce((sum, rings) => sum + polygonArea(rings[0]) - rings.slice(1).reduce((s, r) => s + polygonArea(r), 0), 0);
}
export function union(rings: Ring[]): MultiPolygon {
  return rings.length ? clipping.union([rings[0]], ...rings.slice(1).map(r => [r])) : [];
}
export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  return a.length && b.length ? clipping.intersection(a, b) : [];
}
export function intersectionArea(a: Ring, b: Ring): number {
  return multiArea(intersection([[a]], [[b]]));
}
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}
export function normalizeRing(points: readonly Point[]): Ring | null {
  if (points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) return null;
  const ring = points.filter((p, i) => !i || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > EPS).map(p => [...p] as Point);
  if (ring.length > 1 && Math.hypot(ring[0][0] - ring.at(-1)![0], ring[0][1] - ring.at(-1)![1]) < EPS) ring.pop();
  if (ring.length < 3 || polygonArea(ring) < EPS) return null;
  for (let i = 0; i < ring.length; i++) for (let j = i + 2; j < ring.length; j++) {
    if (i === 0 && j === ring.length - 1) continue;
    if (segmentDistance(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length]) < EPS) return null;
  }
  return ring;
}
export function pointInPolygon(p: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (pointSegmentDistance(p, a, b) < EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function footprintEdgeDistance(ring: Ring, a: Point, b: Point): number {
  if (pointInPolygon(a, ring) || pointInPolygon(b, ring)) return 0;
  return Math.min(...ring.map((p, i) => segmentDistance(p, ring[(i + 1) % ring.length], a, b)));
}
export function passesOffset(ring: Ring, a: Point, b: Point, limit: number): boolean {
  return footprintEdgeDistance(ring, a, b) >= limit - 0.05;
}

/** Clip an inward edge strip to the plot; winding does not change the result. */
export function setbackBand(plot: Ring, edge: number, width: number): MultiPolygon {
  if (width <= 0) return [];
  const a = plot[edge], b = plot[(edge + 1) % plot.length];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!length) return [];
  const sign = signedArea(plot) > 0 ? 1 : -1;
  const nx = -(b[1] - a[1]) / length * width * sign, ny = (b[0] - a[0]) / length * width * sign;
  return intersection([[plot]], [[[a, b, [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]]]]);
}

/** Ear clipping for a simple ring. Used only for visual overlay caps. */
export function triangulate(input: Ring): Point[][] {
  const ring = normalizeRing(input);
  if (!ring) throw new Error("Cannot triangulate invalid ring");
  if (signedArea(ring) < 0) ring.reverse();
  for (let i = ring.length - 1; i >= 0 && ring.length > 3; i--) {
    if (Math.abs(cross(ring[(i + ring.length - 1) % ring.length], ring[i], ring[(i + 1) % ring.length])) < EPS) ring.splice(i, 1);
  }
  const triangles: Point[][] = [];
  while (ring.length > 3) {
    let found = false;
    for (let i = 0; i < ring.length; i++) {
      const ai = (i + ring.length - 1) % ring.length, ci = (i + 1) % ring.length;
      const a = ring[ai], b = ring[i], c = ring[ci];
      if (cross(a, b, c) <= EPS) continue;
      if (ring.some((p, j) => j !== ai && j !== i && j !== ci && cross(a, b, p) >= -EPS && cross(b, c, p) >= -EPS && cross(c, a, p) >= -EPS)) continue;
      triangles.push([a, b, c]); ring.splice(i, 1); found = true; break;
    }
    if (!found) throw new Error("Cannot triangulate overlay");
  }
  triangles.push(ring);
  return triangles;
}
