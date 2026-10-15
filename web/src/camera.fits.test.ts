import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";
import { BOUNDS_MARGIN, cameraLimits, constrainView, fitCenter, fitZoom, LEVEL_OFFSET, OUTLINE_MERC, paddingOffset, type Padding, type Size } from "./camera";
import type { Bounds } from "./data";
import topoJson from "../data/pnct.topo.json?raw";

// Regression guard on the real data: the camera constraint (maxBounds = min-zoom view, OUTLINE)
// must never move the camera of a selection fit, so no concelho or parish ends up under the phone
// bottom sheet or the desktop side panel. Mirrors main.ts: fitPadding(true) and fit() (concelhos at
// least LEVEL_OFFSET + 0.5 above minZoom and at most 11, parishes at most 12).

const topo = JSON.parse(topoJson) as Topology;

function bbox(coords: unknown, b: Bounds = [Infinity, Infinity, -Infinity, -Infinity]): Bounds {
  if (typeof (coords as number[])[0] === "number") {
    const [x, y] = coords as number[];
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  } else for (const c of coords as unknown[]) bbox(c, b);
  return b;
}

const parishes = (feature(topo, topo.objects.parishes) as unknown as { features: { properties: { dicofre: string }; geometry: { coordinates: unknown } }[] }).features.map(
  (f) => ({ id: f.properties.dicofre, b: bbox(f.geometry.coordinates) }),
);
const concelhos = new Map<string, Bounds>();
for (const p of parishes) {
  const c = concelhos.get(p.id.slice(0, 4));
  concelhos.set(p.id.slice(0, 4), c ? [Math.min(c[0], p.b[0]), Math.min(c[1], p.b[1]), Math.max(c[2], p.b[2]), Math.max(c[3], p.b[3])] : [...p.b]);
}

const phone = (size: Size): [Size, Padding, Padding] => [size, { top: 120, left: 24, right: 24, bottom: 60 }, { top: 120, left: 24, right: 24, bottom: Math.round(size.height * 0.5) }];
const desktop = (size: Size): [Size, Padding, Padding] => [size, { top: 80, left: 40, bottom: 40, right: 40 }, { top: 80, left: 40, bottom: 40, right: 400 }];

describe("selection fits are never moved by the camera constraint", () => {
  for (const [name, [size, basePad, panelPad]] of [
    ["phone 390×844", phone({ width: 390, height: 844 })],
    ["phone 360×740", phone({ width: 360, height: 740 })],
    ["desktop 1440×900", desktop({ width: 1440, height: 900 })],
    ["desktop 1024×768", desktop({ width: 1024, height: 768 })],
  ] as const) {
    it(name, () => {
      const { minZoom, maxBounds } = cameraLimits(size, basePad);
      const limits = { size, minZoom, maxZoom: 15, maxBounds, boundsMargin: BOUNDS_MARGIN, outline: OUTLINE_MERC, offset: paddingOffset(panelPad) };
      const moved: string[] = [];
      const check = (id: string, b: Bounds, zoom: number) => {
        const center = fitCenter(b, zoom, panelPad);
        const out = constrainView(center, zoom, limits);
        const shift = Math.max(Math.abs(out.center[0] - center[0]), Math.abs(out.center[1] - center[1]));
        if (shift > 1e-7 || out.zoom !== zoom) moved.push(`${id} by ${shift.toFixed(4)}°`);
      };
      for (const [code, b] of concelhos) check(`concelho ${code}`, b, Math.min(11, Math.max(minZoom + LEVEL_OFFSET + 0.5, fitZoom(b, size, panelPad))));
      for (const p of parishes) check(`parish ${p.id}`, p.b, Math.min(12, fitZoom(p.b, size, panelPad)));
      expect(concelhos.size).toBe(278);
      expect(moved).toEqual([]);
    });
  }
});
