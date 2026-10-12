import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "./idealista";
import shapesJson from "../data/shapes.json?raw";

// shapes.json is written by the Python pipeline (scripts/build_shapes.py); the
// TypeScript codec must agree with it on every shape, byte for byte.
const shapes = JSON.parse(shapesJson) as Record<
  string,
  { shape: string; points: number; approx: boolean; method: string }
>;

describe("shapes.json (Python-encoded) vs TypeScript codec", () => {
  it("has a shape for every PNCT parish", () => {
    expect(Object.keys(shapes)).toHaveLength(1861);
  });

  it("round-trips every shape byte for byte, closed, within the vertex cap", () => {
    for (const [dicofre, s] of Object.entries(shapes)) {
      const ring = decodePolyline(s.shape);
      expect(encodePolyline(ring), dicofre).toBe(s.shape);
      expect(ring[0], dicofre).toEqual(ring[ring.length - 1]);
      expect(ring.length - 1, dicofre).toBe(s.points);
      expect(s.points, dicofre).toBeLessThanOrEqual(60);
      expect(s.approx, dicofre).toBe(s.method === "hull");
    }
  });
});
