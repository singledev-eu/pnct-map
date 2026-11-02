/**
 * Slab edges (drill.ts): a feature's outline as thin quads, one per edge, so it can be extruded at
 * the slab top's height (base ≈ slab height). A ground-level line would be hidden by the slab or,
 * drawn over it, show up offset from the slab's real edge. Each quad lies on the solid side of its
 * edge ("inward": the slab's outer edge, so nothing overhangs the walls) or straddles it
 * ("centred": a boundary between two parishes inside a concelho slab).
 */
import type { Polygon, Position } from "geojson";
import type { Area } from "./data";

const M_PER_DEG = 111_320;

/** Signed area of a ring in lng/lat (positive: counter-clockwise). */
function signedArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a / 2;
}

/**
 * The edge quads of `area`, `width` metres wide. Rings may repeat their first vertex (GeoJSON) or not.
 * Degenerate (zero-length) edges are skipped.
 */
export function edgeQuads(area: Area, width: number, side: "inward" | "centred"): Polygon[] {
  const polygons = area.type === "Polygon" ? [area.coordinates] : area.coordinates;
  const out: Polygon[] = [];
  for (const polygon of polygons) {
    polygon.forEach((ring, r) => {
      if (ring.length < 3) return;
      const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
      const kx = M_PER_DEG * Math.cos(lat0); // metres per degree of longitude here
      // The solid lies left of a counter-clockwise outer ring and right of a counter-clockwise hole.
      const ccw = signedArea(ring) > 0;
      const solidLeft = r === 0 ? ccw : !ccw;
      for (let i = 0; i < ring.length - 1 || (i === ring.length - 1 && !samePoint(ring[0], ring[i])); i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const [dx, dy] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * M_PER_DEG];
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        // Unit normal to the left of a→b, in metres, flipped towards the solid.
        const s = solidLeft ? 1 : -1;
        const [nx, ny] = [(-dy / len) * s, (dx / len) * s];
        const [from, to] = side === "inward" ? [0, width] : [-width / 2, width / 2];
        const at = (p: Position, k: number): Position => [p[0] + (nx * k) / kx, p[1] + (ny * k) / M_PER_DEG];
        out.push({ type: "Polygon", coordinates: [[at(a, from), at(b, from), at(b, to), at(a, to), at(a, from)]] });
      }
    });
  }
  return out;
}

const samePoint = (p: Position, q: Position) => p[0] === q[0] && p[1] === q[1];

/** Metres per screen pixel at `zoom` and latitude `lat` (512 px tiles). */
export const metresPerPixel = (zoom: number, lat: number): number => (2 * Math.PI * 6_378_137 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/**
 * Quads (`width` metres, centred) along the boundaries *between* the given areas, e.g. the parishes
 * of a concelho: segments that appear in two of them (TopoJSON gives shared arcs identical
 * coordinates). Their outer boundary is left out, so nothing overhangs the slab's outer wall, and
 * each shared segment gives one quad.
 */
export function sharedEdgeQuads(areas: { area: Area; props: Record<string, unknown> }[], width: number): { quad: Polygon; props: Record<string, unknown> }[] {
  const key = (a: Position, b: Position) => {
    const [p, q] = [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`];
    return p < q ? `${p}|${q}` : `${q}|${p}`;
  };
  const seen = new Map<string, { count: number; a: Position; b: Position; props: Record<string, unknown> }>();
  for (const { area, props } of areas) {
    for (const polygon of area.type === "Polygon" ? [area.coordinates] : area.coordinates) {
      for (const ring of polygon) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const k = key(ring[i], ring[i + 1]);
          const e = seen.get(k);
          if (e) e.count += 1;
          else seen.set(k, { count: 1, a: ring[i], b: ring[i + 1], props });
        }
      }
    }
  }
  const out: { quad: Polygon; props: Record<string, unknown> }[] = [];
  for (const e of seen.values()) {
    if (e.count < 2) continue;
    // A one-edge "ring" through edgeQuads' maths: the centred quad doesn't depend on orientation.
    const [quad] = edgeQuads({ type: "Polygon", coordinates: [[e.a, e.b, e.a]] }, width, "centred");
    if (quad) out.push({ quad, props: e.props });
  }
  return out;
}
