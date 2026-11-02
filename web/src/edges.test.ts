import type { Polygon } from "geojson";
import { describe, expect, it } from "vitest";
import { edgeQuads, metresPerPixel, sharedEdgeQuads } from "./edges";

// A 0.01° square near 41°N, counter-clockwise, closed (as GeoJSON rings are).
const square: Polygon = { type: "Polygon", coordinates: [[[0, 41], [0.01, 41], [0.01, 41.01], [0, 41.01], [0, 41]]] };
const inside = (p: number[]) => p[0] >= 0 && p[0] <= 0.01 && p[1] >= 41 && p[1] <= 41.01;

describe("edgeQuads", () => {
  it("makes one quad per edge, on the inner side for an outer ring", () => {
    const quads = edgeQuads(square, 10, "inward");
    expect(quads).toHaveLength(4);
    for (const q of quads) for (const p of q.coordinates[0]) expect(inside(p)).toBe(true);
  });
  it("is the same for a clockwise outer ring", () => {
    const cw: Polygon = { type: "Polygon", coordinates: [[...square.coordinates[0]].reverse()] };
    for (const q of edgeQuads(cw, 10, "inward")) for (const p of q.coordinates[0]) expect(inside(p)).toBe(true);
  });
  it("puts a hole's quads outside the hole, on the solid", () => {
    const hole = [[0.004, 41.004], [0.004, 41.006], [0.006, 41.006], [0.006, 41.004], [0.004, 41.004]]; // clockwise
    const withHole: Polygon = { type: "Polygon", coordinates: [square.coordinates[0], hole] };
    const holeQuads = edgeQuads(withHole, 10, "inward").slice(4);
    expect(holeQuads).toHaveLength(4);
    const inHole = (p: number[]) => p[0] > 0.004 + 1e-9 && p[0] < 0.006 - 1e-9 && p[1] > 41.004 + 1e-9 && p[1] < 41.006 - 1e-9;
    for (const q of holeQuads) for (const p of q.coordinates[0]) expect(inHole(p)).toBe(false);
  });
  it("is about `width` metres wide; centred quads straddle the edge", () => {
    const [south] = edgeQuads(square, 10, "inward"); // the edge along 41°N
    const lats = south.coordinates[0].map((p) => p[1]);
    expect((Math.max(...lats) - 41) * 111_320).toBeCloseTo(10, 3);
    const [centred] = edgeQuads(square, 10, "centred");
    const clats = centred.coordinates[0].map((p) => p[1]);
    expect((41 - Math.min(...clats)) * 111_320).toBeCloseTo(5, 3);
  });
});

describe("metresPerPixel", () => {
  it("halves with each zoom level", () => {
    expect(metresPerPixel(11, 41) / metresPerPixel(12, 41)).toBeCloseTo(2, 9);
    expect(metresPerPixel(0, 0)).toBeCloseTo(78_271.5, 0);
  });
});

describe("sharedEdgeQuads", () => {
  it("keeps only the boundary between two areas, once", () => {
    const west: Polygon = { type: "Polygon", coordinates: [[[0, 41], [0.01, 41], [0.01, 41.01], [0, 41.01], [0, 41]]] };
    const east: Polygon = { type: "Polygon", coordinates: [[[0.01, 41], [0.02, 41], [0.02, 41.01], [0.01, 41.01], [0.01, 41]]] };
    const quads = sharedEdgeQuads([{ area: west, props: { a: 1 } }, { area: east, props: { a: 2 } }], 4);
    expect(quads).toHaveLength(1);
    const lngs = quads[0].quad.coordinates[0].map((p) => p[0]);
    expect(Math.min(...lngs)).toBeLessThan(0.01);
    expect(Math.max(...lngs)).toBeGreaterThan(0.01);
  });
});
