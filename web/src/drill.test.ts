import { describe, expect, it } from "vitest";
import { load3dPref, save3dPref, slabHeight, view3dFor, VIEW3D_STORAGE_KEY } from "./drill";
import { appLayers, CONCELHO_PNCT_TOP, CONCELHO_RIM, NO_SLAB, PARISH_SLAB, pnctTopFilter, rimHeights, rimLift, SLAB_VEIL, slabFilter } from "./layers";
import { PALETTES } from "./theme";

const memory = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init));
  return () => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }) as unknown as Storage;
};
const broken = () => {
  throw new Error("blocked");
};

describe("3D setting", () => {
  it("defaults to on", () => {
    expect(load3dPref(memory())).toBe(true);
  });
  it("keeps the viewer's choice", () => {
    const storage = memory();
    save3dPref(false, storage);
    expect(load3dPref(storage)).toBe(false);
    expect(storage().getItem(VIEW3D_STORAGE_KEY)).toBe("off");
    save3dPref(true, storage);
    expect(load3dPref(storage)).toBe(true);
  });
  it("falls back to on without storage or with junk", () => {
    expect(load3dPref(broken)).toBe(true);
    expect(load3dPref(memory({ [VIEW3D_STORAGE_KEY]: "maybe" }))).toBe(true);
    expect(() => save3dPref(true, broken)).not.toThrow();
  });
});

describe("view3dFor", () => {
  it("tilts and turns 8–15° either way, the same for the same feature", () => {
    for (const code of ["1714", "1715", "171415", "0101", "1312"]) {
      const v = view3dFor(code, false);
      expect(v.pitch).toBe(50);
      expect(Math.abs(v.bearing)).toBeGreaterThanOrEqual(8);
      expect(Math.abs(v.bearing)).toBeLessThanOrEqual(15);
      expect(view3dFor(code, false)).toEqual(v);
    }
    expect(view3dFor("1714", true).pitch).toBeLessThan(50);
  });
});

describe("slabHeight", () => {
  it("scales with the feature and stays within 60–1000 m", () => {
    const parish = slabHeight([-7.74, 41.27, -7.69, 41.3]); // ~4 km
    const concelho = slabHeight([-7.95, 41.17, -7.55, 41.42]); // ~33 km
    expect(parish).toBeGreaterThanOrEqual(60);
    expect(concelho).toBeGreaterThan(parish);
    expect(slabHeight([-9.5, 37, -6.2, 42])).toBe(1000);
    expect(slabHeight([-7.7, 41.29, -7.699, 41.291])).toBe(60);
  });
});

describe("slab layers", () => {
  it("hold only the selected feature, or nothing, above the app layers", () => {
    const empty = appLayers({ district: null, focus: false }, 8, PALETTES.light);
    const slab = empty.find((l) => l.id === PARISH_SLAB)!;
    expect("filter" in slab && slab.filter).toEqual(slabFilter("dicofre", null));
    const ids = empty.map((l) => l.id);
    expect(ids.indexOf(SLAB_VEIL)).toBeGreaterThan(ids.indexOf("concelho-highlight"));
    const one = appLayers({ district: null, focus: false }, 8, PALETTES.light, undefined, { ...NO_SLAB, parish: { code: "171415", base: 0, height: 90, opacity: 1 } });
    const raised = one.find((l) => l.id === PARISH_SLAB)!;
    expect("filter" in raised && raised.filter).toEqual(["==", ["get", "dicofre"], "171415"]);
    expect(raised.type === "fill-extrusion" && raised.paint?.["fill-extrusion-height"]).toBe(90);
  });
});

describe("slab stack", () => {
  const state = { ...NO_SLAB, concelho: { code: "1823", base: 0, height: 400, opacity: 0.55, partial: true } };
  const layers = appLayers({ district: null, focus: false }, 8, PALETTES.dark, undefined, state);

  it("draws every line below the first extrusion, and only extrusions after it", () => {
    const first = layers.findIndex((l) => l.type === "fill-extrusion");
    expect(layers.map((l) => l.type).lastIndexOf("line")).toBeLessThan(first);
    // After the extrusions: only labels (the city labels, cities.ts), which are drawn over slabs.
    expect(new Set(layers.slice(first).map((l) => l.type))).toEqual(new Set(["fill-extrusion", "symbol"]));
    expect(layers.slice(first).filter((l) => l.type === "symbol").map((l) => l.id)).toEqual(["city-seats", "city-selected", "city-capitals"]);
  });

  it("puts the rims and the PNCT tops on the slab top, opaque even on a translucent slab", () => {
    const rims = rimHeights(state);
    // Partly PNCT: the rim rises above the PNCT tops (2 lifts), which would otherwise cover it.
    expect(rims[CONCELHO_RIM]).toEqual({ base: 400, height: 400 + 3 * rimLift(400), opacity: 1 });
    expect(rims[CONCELHO_PNCT_TOP].height).toBeLessThan(rims[CONCELHO_RIM].height);
    expect(rimHeights({ ...state, concelho: { ...state.concelho, partial: false } })[CONCELHO_RIM].height).toBe(400 + rimLift(400));
    expect(rims[CONCELHO_PNCT_TOP].base).toBe(400);
    expect(rims[CONCELHO_PNCT_TOP].opacity).toBe(0.55);
    const rim = layers.find((l) => l.id === CONCELHO_RIM)!;
    expect(rim.type === "fill-extrusion" && rim.paint?.["fill-extrusion-base"]).toBe(400);
  });

  it("raises only the PNCT parishes of a partly-PNCT concelho", () => {
    const top = layers.find((l) => l.id === CONCELHO_PNCT_TOP)!;
    expect("filter" in top && top.filter).toEqual(pnctTopFilter("1823"));
    const none = appLayers({ district: null, focus: false }, 8, PALETTES.dark).find((l) => l.id === CONCELHO_PNCT_TOP)!;
    expect("filter" in none && none.filter).toEqual(pnctTopFilter(null));
  });
});
