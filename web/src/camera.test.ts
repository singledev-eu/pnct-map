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
  const world = (z: number) => 512 * 2 ** z;
  const px = (b: readonly number[], z: number) => ({
    width: (((b[2] - b[0]) / 360) * world(z)),
    height: ((Math.log(Math.tan(Math.PI / 4 + (b[3] * Math.PI) / 360)) - Math.log(Math.tan(Math.PI / 4 + (b[1] * Math.PI) / 360))) / (2 * Math.PI)) * world(z),
  });
  const NARROW_PHONE = { width: 320, height: 900 }; // tall enough that the width limits the fit

  for (const [name, size, pad, limiting] of [
    ["desktop", DESKTOP, DESKTOP_PAD, "height"],
    ["phone", PHONE, PHONE_PAD, "height"],
    ["phone landscape", { width: 844, height: 390 }, DESKTOP_PAD, "height"],
    ["ultra-wide", { width: 3440, height: 1440 }, DESKTOP_PAD, "height"],
    ["narrow phone", NARROW_PHONE, PHONE_PAD, "width"],
  ] as const) {
    it(`${name} (${limiting}-limited): maxBounds are exactly the min-zoom view, with mainland and its fit padding inside`, () => {
      const { minZoom, maxBounds, levelZoom } = cameraLimits(size, pad);
      expect(levelZoom).toBe(minZoom + LEVEL_OFFSET);
      // Which axis limits the fit: mainland spans the padded size on that axis.
      const land = px(MAINLAND, minZoom);
      const padded = { width: size.width - pad.left - pad.right, height: size.height - pad.top - pad.bottom };
      expect(land[limiting]).toBeCloseTo(padded[limiting], 6);
      expect(land[limiting === "height" ? "width" : "height"]).toBeLessThan(padded[limiting === "height" ? "width" : "height"]);
      // maxBounds is the view on both axes: no slack at minZoom, and no forced zoom-in past it.
      const bounds = px(maxBounds, minZoom);
      expect(bounds.width).toBeCloseTo(size.width, 6);
      expect(bounds.height).toBeCloseTo(size.height, 6);
      expect(maxBounds[0]).toBeLessThan(MAINLAND[0]);
      expect(maxBounds[1]).toBeLessThan(MAINLAND[1]);
      expect(maxBounds[2]).toBeGreaterThan(MAINLAND[2]);
      expect(maxBounds[3]).toBeGreaterThan(MAINLAND[3]);
    });
  }

  it("on the limiting axis, the margin beyond mainland is the fit padding (desktop: toolbar 80 px, bottom 40 px)", () => {
    const { minZoom, maxBounds } = cameraLimits(DESKTOP, DESKTOP_PAD);
    expect(px([0, MAINLAND[3], 0, maxBounds[3]], minZoom).height).toBeCloseTo(80, 6);
    expect(px([0, maxBounds[1], 0, MAINLAND[1]], minZoom).height).toBeCloseTo(40, 6);
  });

  it("on a width-limited screen, the side margins are the fit padding (24 px)", () => {
    const { minZoom, maxBounds } = cameraLimits(NARROW_PHONE, PHONE_PAD);
    expect(px([maxBounds[0], 0, MAINLAND[0], 0], minZoom).width).toBeCloseTo(24, 6);
    expect(px([MAINLAND[2], 0, maxBounds[2], 0], minZoom).width).toBeCloseTo(24, 6);
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
    return { minZoom, view: { size, minZoom, maxZoom: 15, maxBounds, boundsMargin: BOUNDS_MARGIN, centerBox: CENTER_BOX } };
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
    // Tangier: the box corner (at z10 maxBounds are widened by the full margin, so the box limits).
    const [tLng, tLat] = constrainView([-5.81, 35.77], 10, view).center;
    expect(tLng).toBeCloseTo(CENTER_BOX[2], 9);
    expect(tLat).toBeCloseTo(CENTER_BOX[1], 9);
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
    const margin = BOUNDS_MARGIN * (0.5 / LEVEL_OFFSET); // faded in: a quarter of the way at minZoom + 0.5
    expect(lng + halfLng).toBeLessThanOrEqual(view.maxBounds[2] + margin + 1e-9); // inside the (widened) bounds
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

describe("constrainView at min zoom (no slack)", () => {
  const cases = [
    ["desktop", DESKTOP, DESKTOP_PAD],
    ["phone", PHONE, PHONE_PAD],
    ["phone landscape", { width: 844, height: 390 }, DESKTOP_PAD],
    ["ultra-wide", { width: 3440, height: 1440 }, DESKTOP_PAD],
    ["narrow phone (width-limited)", { width: 320, height: 900 }, PHONE_PAD],
  ] as const;

  for (const [name, size, pad] of cases) {
    it(`${name}: any requested centre ends at exactly the country view`, () => {
      const { minZoom, maxBounds } = cameraLimits(size, pad);
      const limits = { size, minZoom, maxZoom: 15, maxBounds, boundsMargin: BOUNDS_MARGIN, centerBox: CENTER_BOX };
      const country = fitCenter(MAINLAND, minZoom, pad);
      for (const c of [[-8.94, 37.0], [-8.2, 42.1], [-6.2, 41.5], [-9.5, 38.7], [-3.7, 40.4], [-5.81, 35.77]] as [number, number][]) {
        const out = constrainView(c, minZoom - 1, limits); // also below minZoom
        expect(out.zoom).toBe(minZoom);
        expect(out.center[0]).toBeCloseTo(country[0], 6);
        expect(out.center[1]).toBeCloseTo(country[1], 6);
      }
    });
  }

  it("the allowed area grows with zoom, reaching the full margin at the parish level", () => {
    const { minZoom, maxBounds } = cameraLimits(DESKTOP, DESKTOP_PAD);
    const limits = { size: DESKTOP, minZoom, maxZoom: 15, maxBounds, boundsMargin: BOUNDS_MARGIN, centerBox: CENTER_BOX };
    // How far south the centre can go near Sagres, per zoom: monotonic, no jumps.
    const south = [0, 0.25, 0.5, 1, 1.5, 2, 3].map((dz) => constrainView([-8.94, 30], minZoom + dz, limits).center[1]);
    for (let i = 1; i < south.length; i++) expect(south[i]).toBeLessThanOrEqual(south[i - 1] + 1e-9);
    expect(south.at(-1)).toBeCloseTo(CENTER_BOX[1], 9); // at parish zooms the centre box is what limits
  });
});
