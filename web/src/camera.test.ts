import { describe, expect, it } from "vitest";
import { BOUNDS_MARGIN, cameraLimits, constrainView, fitCenter, fitZoom, clipRing, insideRing, LEVEL_OFFSET, MAINLAND, nearestOnRing, OUTLINE, OUTLINE_MERC, paddingOffset, type Padding, type Size } from "./camera";

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

// Mercator helpers for the assertions (world units, as in camera.ts).
const mx = (lng: number) => (lng + 180) / 360;
const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const merc = ([lng, lat]: [number, number]): [number, number] => [mx(lng), my(lat)];

/** Points the camera must not centre on at parish zooms, and points it must (lat, lng as in the spec). */
const REJECTED = { Cádiz: [36.53, -6.29], Seville: [37.39, -5.98], Badajoz: [38.88, -6.97], Salamanca: [40.97, -5.66], Vigo: [42.24, -8.72], Ourense: [42.34, -7.86], Madrid: [40.4, -3.7], Tangier: [35.77, -5.81] } as const;
const REACHABLE = { Sagres: [37.01, -8.94], "Vila Real de Santo António": [37.19, -7.42], Elvas: [38.88, -7.16], "Miranda do Douro": [41.5, -6.27], Bragança: [41.81, -6.76], Caminha: [41.87, -8.84], "Cabo da Roca": [38.78, -9.5] } as const;
const lngLat = ([lat, lng]: readonly [number, number]): [number, number] => [lng, lat];

describe("OUTLINE", () => {
  it("is a simple ring of under 200 vertices around mainland", () => {
    expect(OUTLINE.length).toBeGreaterThan(50);
    expect(OUTLINE.length).toBeLessThan(200);
    for (const [lng, lat] of OUTLINE) {
      expect(lng).toBeGreaterThan(MAINLAND[0] - 0.4);
      expect(lng).toBeLessThan(MAINLAND[2] + 0.1);
      expect(lat).toBeGreaterThan(MAINLAND[1] - 0.4);
      expect(lat).toBeLessThan(MAINLAND[3] + 0.1);
    }
  });

  it("contains every edge town and cape, and none of the Spanish cities", () => {
    for (const [name, p] of Object.entries(REACHABLE)) expect(insideRing(merc(lngLat(p)), OUTLINE_MERC), name).toBe(true);
    for (const [name, p] of Object.entries(REJECTED)) expect(insideRing(merc(lngLat(p)), OUTLINE_MERC), name).toBe(false);
  });

  it("contains the visible centre of the country view (mainland's bbox centre)", () => {
    expect(insideRing(merc([(MAINLAND[0] + MAINLAND[2]) / 2, (MAINLAND[1] + MAINLAND[3]) / 2]), OUTLINE_MERC)).toBe(true);
  });
});

describe("insideRing / nearestOnRing / clipRing", () => {
  const square: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
  it("tests inside and outside", () => {
    expect(insideRing([1, 1], square)).toBe(true);
    expect(insideRing([3, 1], square)).toBe(false);
    expect(insideRing([1, -0.5], square)).toBe(false);
  });
  it("finds the nearest boundary point, corners included", () => {
    expect(nearestOnRing([3, 1], square)).toEqual([2, 1]);
    expect(nearestOnRing([1, -5], square)).toEqual([1, 0]);
    expect(nearestOnRing([5, 5], square)).toEqual([2, 2]);
  });
  it("clips a ring to a box", () => {
    const sort = (r: [number, number][]) => r.map((p) => p.join()).sort();
    expect(sort(clipRing(square, [1, -1, 3, 1]))).toEqual(sort([[1, 0], [2, 0], [2, 1], [1, 1]]));
    expect(clipRing(square, [5, 5, 6, 6])).toEqual([]);
  });
});

const viewFor = (size: Size, pad: Padding, panelPad: Padding = pad) => {
  const { minZoom, maxBounds } = cameraLimits(size, pad);
  return { size, minZoom, maxZoom: 15, maxBounds, boundsMargin: BOUNDS_MARGIN, outline: OUTLINE_MERC, offset: paddingOffset(panelPad) };
};
/** Visible-area centre (Mercator) of a camera at `zoom`: the map centre minus the padding offset. */
const visible = (center: [number, number], zoom: number, pad: Padding): [number, number] => {
  const world = 512 * 2 ** zoom;
  const o = paddingOffset(pad);
  const [x, y] = merc(center);
  return [x - o.x / world, y - o.y / world];
};

describe("constrainView", () => {
  const limitsFor = (size: Size, pad: Padding) => {
    const view = viewFor(size, pad);
    return { minZoom: view.minZoom, view };
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
  });

  for (const [name, size, pad] of [["desktop", DESKTOP, DESKTOP_PAD], ["phone", PHONE, PHONE_PAD]] as const) {
    it(`${name}: every edge town and cape can be centred at z12 and z14`, () => {
      const { view } = limitsFor(size, pad);
      for (const z of [12, 14]) {
        for (const [place, p] of Object.entries(REACHABLE)) {
          const out = constrainView(lngLat(p), z, view);
          expect(out.center[0], `${place} z${z}`).toBeCloseTo(p[1], 9);
          expect(out.center[1], `${place} z${z}`).toBeCloseTo(p[0], 9);
        }
      }
    });

    it(`${name}: Spanish cities are clamped to the outline at the parish level and above`, () => {
      const { minZoom, view } = limitsFor(size, pad);
      for (const z of [minZoom + LEVEL_OFFSET, minZoom + LEVEL_OFFSET + 1, 10, 12, 14]) {
        for (const [place, p] of Object.entries(REJECTED)) {
          const out = constrainView(lngLat(p), z, view);
          const v = visible(out.center, z, pad);
          // Moved to the outline (or, near min zoom, further in by the viewport rule).
          const onEdge = nearestOnRing(v, OUTLINE_MERC);
          const inside = insideRing(v, OUTLINE_MERC);
          expect(inside || Math.hypot(v[0] - onEdge[0], v[1] - onEdge[1]) < 1e-12, `${place} z${z.toFixed(2)}`).toBe(true);
        }
      }
    });
  }

  it("uses the visible area: with the desktop panel open the map centre may sit further east", () => {
    const view = viewFor(DESKTOP, DESKTOP_PAD, { ...DESKTOP_PAD, right: 400 });
    const closed = viewFor(DESKTOP, DESKTOP_PAD);
    // A fit at z9 of a feature next to the border near Elvas: its map centre is ~0.25° east, over Spain.
    const elvasFit = fitCenter([-7.25, 38.8, -7.1, 38.95], 9, { ...DESKTOP_PAD, right: 400 });
    expect(elvasFit[0]).toBeGreaterThan(-7.0);
    const open = constrainView(elvasFit, 9, view).center;
    expect(open[0]).toBeCloseTo(elvasFit[0], 9);
    expect(open[1]).toBeCloseTo(elvasFit[1], 9);
    expect(constrainView(elvasFit, 9, closed).center[0]).toBeLessThan(elvasFit[0] - 0.05);
  });

  it("is a fixed point: constraining a constrained camera doesn't move it (no creep while dragging)", () => {
    for (const [size, pad, panelPad] of [
      [DESKTOP, DESKTOP_PAD, DESKTOP_PAD],
      [DESKTOP, DESKTOP_PAD, { ...DESKTOP_PAD, right: 400 }],
      [PHONE, PHONE_PAD, PHONE_PAD],
      [PHONE, PHONE_PAD, { ...PHONE_PAD, bottom: 422 }],
    ] as const) {
      const view = viewFor(size, pad, panelPad);
      for (let dz = 0; dz <= 8; dz += 0.5) {
        for (let lng = -12; lng <= -3; lng += 0.75) {
          for (let lat = 35; lat <= 44; lat += 0.75) {
            const once = constrainView([lng, lat], view.minZoom + dz, view);
            let again = once;
            for (let frame = 0; frame < 10; frame++) again = constrainView(again.center, again.zoom, view);
            expect(Math.abs(again.center[0] - once.center[0]) + Math.abs(again.center[1] - once.center[1]), `${lng},${lat} +${dz}`).toBeLessThan(1e-9);
          }
        }
      }
    }
  });

  it("keeps the viewport inside maxBounds at low zoom, as MapLibre's default does", () => {
    const { minZoom, view } = limitsFor(DESKTOP, DESKTOP_PAD);
    const z = minZoom + 0.5;
    const [lng] = constrainView([-5.9, 36.7], z, view).center;
    const world = 512 * 2 ** z;
    const halfLng = (DESKTOP.width / 2 / world) * 360;
    const margin = BOUNDS_MARGIN * (0.5 / LEVEL_OFFSET); // faded in: a quarter of the way at minZoom + 0.5
    expect(lng + halfLng).toBeLessThanOrEqual(view.maxBounds[2] + margin + 1e-9); // inside the (widened) bounds
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
      const limits = viewFor(size, pad);
      const { minZoom } = limits;
      const country = fitCenter(MAINLAND, minZoom, pad);
      for (const c of [[-8.94, 37.0], [-8.2, 42.1], [-6.2, 41.5], [-9.5, 38.7], [-3.7, 40.4], [-5.81, 35.77]] as [number, number][]) {
        const out = constrainView(c, minZoom - 1, limits); // also below minZoom
        expect(out.zoom).toBe(minZoom);
        expect(out.center[0]).toBeCloseTo(country[0], 6);
        expect(out.center[1]).toBeCloseTo(country[1], 6);
      }
    });
  }

  it("the allowed area grows with zoom: no jumps while zooming in or out", () => {
    const limits = viewFor(DESKTOP, DESKTOP_PAD);
    // How far south the centre can go near Sagres, per zoom: monotonic.
    const south = [0, 0.25, 0.5, 1, 1.5, 2, 3, 5].map((dz) => constrainView([-8.94, 30], limits.minZoom + dz, limits).center[1]);
    for (let i = 1; i < south.length; i++) expect(south[i]).toBeLessThanOrEqual(south[i - 1] + 1e-9);
    expect(south.at(-1)).toBeGreaterThan(36.6); // the outline: ~20 km off Sagres
  });
});
