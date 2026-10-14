import { describe, expect, it } from "vitest";
import { BOUNDS_MARGIN, cameraLimits, fitCenter, fitZoom, LEVEL_OFFSET, MAINLAND } from "./camera";

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
