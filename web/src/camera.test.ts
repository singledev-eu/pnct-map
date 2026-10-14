import { describe, expect, it } from "vitest";
import { BOUNDS_MARGIN, cameraLimits, CENTER_BOX, CENTER_MARGIN, clampCenter, constrainView, fitCenter, fitZoom, LEVEL_OFFSET, MAINLAND } from "./camera";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const DESKTOP_PAD = { top: 80, left: 40, bottom: 40, right: 40 };
const PHONE_PAD = { top: 120, left: 24, right: 24, bottom: 60 };

describe("fitZoom", () => {
  it("uses the tighter of the padded width and height", () => {
    // Mainland is ~0.0188 world units tall and ~0.0093 wide.
    const z = (w: number, h: number) => Math.log2(Math.min(w / (3.35 / 360), h / 0.018786) / 512);
    expect(fitZoom(MAINLAND, DESKTOP, DESKTOP_PAD)).toBeCloseTo(z(1360, 780), 2); // height-limited
    expect(fitZoom(MAINLAND, PHONE, PHONE_PAD)).toBeCloseTo(z(342, 664), 2); // height-limited, barely
    expect(fitZoom(MAINLAND, { width: 300, height: 900 }, PHONE_PAD)).toBeCloseTo(z(252, 720), 2); // width-limited
  });

  it("grows by one per doubling of the viewport", () => {
    const pad = { top: 0, right: 0, bottom: 0, left: 0 };
    const z = fitZoom(MAINLAND, PHONE, pad);
    expect(fitZoom(MAINLAND, { width: 780, height: 1688 }, pad)).toBeCloseTo(z + 1, 6);
  });
});

describe("fitCenter", () => {
  it("is the bounds centre without padding and shifts against asymmetric padding", () => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    const [lng] = fitCenter(MAINLAND, 7, none);
    expect(lng).toBeCloseTo((MAINLAND[0] + MAINLAND[2]) / 2, 6);
    // A right-hand panel pushes the content left, so the map centre moves east.
    const [lngPanel] = fitCenter(MAINLAND, 7, { ...none, right: 400 });
    expect(lngPanel).toBeGreaterThan(lng);
    // A tall toolbar pushes the content down, so the map centre moves north.
    const [, lat] = fitCenter(MAINLAND, 7, none);
    const [, latToolbar] = fitCenter(MAINLAND, 7, { ...none, top: 120 });
    expect(latToolbar).toBeGreaterThan(lat);
  });
});

describe("cameraLimits", () => {
  for (const [name, size, pad] of [
    ["desktop", DESKTOP, DESKTOP_PAD],
    ["phone", PHONE, PHONE_PAD],
    ["phone landscape", { width: 844, height: 390 }, DESKTOP_PAD],
    ["ultra-wide", { width: 3440, height: 1440 }, DESKTOP_PAD],
  ] as const) {
    it(`${name}: maxBounds contain mainland + margin and the whole min-zoom view`, () => {
      const { minZoom, maxBounds, levelZoom } = cameraLimits(size, pad);
      expect(levelZoom).toBe(minZoom + LEVEL_OFFSET);
      expect(maxBounds[0]).toBeLessThanOrEqual(MAINLAND[0] - BOUNDS_MARGIN);
      expect(maxBounds[1]).toBeLessThanOrEqual(MAINLAND[1] - BOUNDS_MARGIN);
      expect(maxBounds[2]).toBeGreaterThanOrEqual(MAINLAND[2] + BOUNDS_MARGIN);
      expect(maxBounds[3]).toBeGreaterThanOrEqual(MAINLAND[3] + BOUNDS_MARGIN);
      // The view at minZoom fits inside maxBounds, so MapLibre never has to zoom in past minZoom.
      const world = 512 * 2 ** minZoom;
      const x = (lng: number) => ((lng + 180) / 360) * world;
      const y = (lat: number) => ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * world;
      expect(x(maxBounds[2]) - x(maxBounds[0])).toBeGreaterThanOrEqual(size.width - 1e-6);
      expect(y(maxBounds[1]) - y(maxBounds[3])).toBeGreaterThanOrEqual(size.height - 1e-6);
    });
  }

  it("a phone's limits are the plain margin (the view is narrower than mainland + margin)", () => {
    const { maxBounds } = cameraLimits(PHONE, PHONE_PAD);
    expect(maxBounds[0]).toBeCloseTo(MAINLAND[0] - BOUNDS_MARGIN, 6);
    expect(maxBounds[2]).toBeCloseTo(MAINLAND[2] + BOUNDS_MARGIN, 6);
  });
});

describe("clampCenter", () => {
  const [w, s, e, n] = CENTER_BOX;

  it("keeps centres inside the box, edges included", () => {
    for (const c of [[-8, 40], [w, s], [e, n], [-9.0, 37.0]] as [number, number][]) expect(clampCenter(c)).toEqual(c);
  });

  it("clamps each side separately", () => {
    expect(clampCenter([-12, 40])).toEqual([w, 40]); // Atlantic
    expect(clampCenter([-3.7, 40.4])).toEqual([e, 40.4]); // Madrid
    expect(clampCenter([-8, 35.77])).toEqual([-8, s]); // south of the Algarve
    expect(clampCenter([-8, 43.4])).toEqual([-8, n]); // Galician coast
    expect(clampCenter([-5.81, 35.77])).toEqual([e, s]); // Tangier: a corner
  });

  it("handles the extremes of the Mercator world", () => {
    expect(clampCenter([-180, -85.05])).toEqual([w, s]);
    expect(clampCenter([180, 85.05])).toEqual([e, n]);
  });

  it("is mainland plus the margin, and the country view centre is inside it", () => {
    expect(CENTER_BOX).toEqual([MAINLAND[0] - CENTER_MARGIN, MAINLAND[1] - CENTER_MARGIN, MAINLAND[2] + CENTER_MARGIN, MAINLAND[3] + CENTER_MARGIN]);
    for (const [size, pad] of [[DESKTOP, DESKTOP_PAD], [PHONE, PHONE_PAD], [{ width: 3440, height: 1440 }, DESKTOP_PAD], [{ width: 844, height: 390 }, DESKTOP_PAD]] as const) {
      const c = fitCenter(MAINLAND, fitZoom(MAINLAND, size, pad), pad);
      expect(clampCenter(c)).toEqual(c); // so the clamp never moves the min-zoom view
    }
  });
});

describe("constrainView", () => {
  const limitsFor = (size: { width: number; height: number }, pad: typeof DESKTOP_PAD) => {
    const { minZoom, maxBounds } = cameraLimits(size, pad);
    return { minZoom, view: { size, minZoom, maxZoom: 15, maxBounds, centerBox: CENTER_BOX } };
  };

  for (const [name, size, pad] of [["desktop", DESKTOP, DESKTOP_PAD], ["phone", PHONE, PHONE_PAD], ["ultra-wide", { width: 3440, height: 1440 }, DESKTOP_PAD]] as const) {
    it(`${name}: leaves the country view at min zoom where it is (no jump)`, () => {
      const { minZoom, view } = limitsFor(size, pad);
      const c = fitCenter(MAINLAND, minZoom, pad);
      const out = constrainView(c, minZoom, view);
      expect(out.zoom).toBe(minZoom);
      expect(out.center[0]).toBeCloseTo(c[0], 9);
      expect(out.center[1]).toBeCloseTo(c[1], 9);
    });
  }

  it("clamps the zoom to [minZoom, maxZoom] and never blocks zooming out to minZoom", () => {
    const { minZoom, view } = limitsFor(PHONE, PHONE_PAD);
    expect(constrainView([-8.9, 37.0], minZoom - 3, view).zoom).toBe(minZoom);
    expect(constrainView([-8.9, 37.0], 20, view).zoom).toBe(15);
    const sagres = constrainView([-8.9, 37.0], 12, view); // Sagres is allowed
    expect(sagres.zoom).toBe(12);
    expect(sagres.center[0]).toBeCloseTo(-8.9, 9);
    expect(sagres.center[1]).toBeCloseTo(37.0, 9);
  });

  it("keeps the centre in the box at high zoom (Tangier, Madrid)", () => {
    const { view } = limitsFor(PHONE, PHONE_PAD);
    expect(constrainView([-5.81, 35.77], 10, view).center).toEqual([CENTER_BOX[2], CENTER_BOX[1]]);
    const madrid = constrainView([-3.7, 40.4], 11, limitsFor(DESKTOP, DESKTOP_PAD).view).center;
    expect(madrid[0]).toBeCloseTo(CENTER_BOX[2], 9);
    expect(madrid[1]).toBeCloseTo(40.4, 9);
  });

  it("keeps the viewport inside maxBounds at low zoom, as MapLibre's default does", () => {
    const { minZoom, view } = limitsFor(DESKTOP, DESKTOP_PAD);
    const z = minZoom + 0.5;
    const [lng, lat] = constrainView([-5.9, 36.7], z, view).center; // box corner, but the view would leave maxBounds
    const world = 512 * 2 ** z;
    const halfLng = (DESKTOP.width / 2 / world) * 360;
    expect(lng + halfLng).toBeLessThanOrEqual(view.maxBounds[2] + 1e-9);
    expect(lng).toBeLessThanOrEqual(CENTER_BOX[2]);
    expect(lat).toBeGreaterThanOrEqual(CENTER_BOX[1]);
  });

  it("centres instead of zooming in when the viewport is wider than maxBounds (mid-resize)", () => {
    const { view } = limitsFor(PHONE, PHONE_PAD);
    const out = constrainView([-8, 39.5], view.minZoom, { ...view, size: { width: 4000, height: 844 } });
    expect(out.zoom).toBe(view.minZoom);
    expect(out.center[0]).toBeCloseTo((view.maxBounds[0] + view.maxBounds[2]) / 2, 6);
  });
});
