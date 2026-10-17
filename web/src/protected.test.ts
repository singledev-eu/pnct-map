import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { appLayers, hatchImage, NATURA_HATCH_IMAGE, overlayFill, overlayLine, overlaySource, patternImages, withAppLayers, type FilterState, type OverlayState } from "./layers";
import { attributionHtml, CATEGORIES, CATEGORY_IDS, credits, panelAreas } from "./protected";
import { formatPct, t } from "./strings";
import { PALETTES } from "./theme";

const FILTER: FilterState = { district: null, focus: false };
const overlays = (visible: string[], loaded = true): OverlayState => ({ categories: CATEGORY_IDS, loaded, visible: new Set(visible) });
const ids = (layers: LayerSpecification[]) => layers.map((l) => l.id);
const layer = (layers: LayerSpecification[], id: string) => layers.find((l) => l.id === id) as LayerSpecification & { filter?: unknown };

describe("protected.meta.json", () => {
  it("lists the categories with source, version and licence", () => {
    expect(CATEGORY_IDS.length).toBeGreaterThan(0);
    for (const c of CATEGORIES) {
      expect(c.url).toMatch(/^https:\/\//);
      expect(c.as_of).toBeTruthy();
      expect(typeof c.licence_confirmed).toBe("boolean");
      expect(t.toggle[c.id], `a legend label for ${c.id}`).toBeTruthy();
    }
  });

  it("credits every category, with a licence only where it is confirmed", () => {
    const html = attributionHtml();
    for (const c of CATEGORIES) expect(html).toContain(`href="${c.url}"`);
    for (const c of credits()) expect(c.licence).toBeTruthy();
    const unconfirmed = CATEGORIES.filter((c) => !c.licence_confirmed);
    for (const c of unconfirmed) expect(credits().find((x) => x.url === c.url)!.licence).toBe(t.licenceUnconfirmed);
  });
});

describe("overlay layers", () => {
  it("are absent until the overlay data is loaded", () => {
    const layers = appLayers(FILTER, 7, PALETTES.light, overlays(["rnap"], false));
    expect(ids(layers).some((id) => id.startsWith("protected-"))).toBe(false);
  });

  it("sit above the parish fill and below the lines and the selection highlight", () => {
    const order = ids(appLayers(FILTER, 7, PALETTES.light, overlays([])));
    const fill = order.indexOf("parish-fill");
    const line = order.indexOf("parish-line");
    for (const cat of CATEGORY_IDS) {
      for (const id of [overlayFill(cat), overlayLine(cat)]) {
        expect(order.indexOf(id)).toBeGreaterThan(fill);
        expect(order.indexOf(id)).toBeLessThan(line);
      }
    }
    expect(order.indexOf("parish-highlight")).toBeGreaterThan(line);
  });

  it("follow the toggles through visibility, without adding or removing layers", () => {
    const [first, ...rest] = CATEGORY_IDS;
    const layers = appLayers(FILTER, 7, PALETTES.light, overlays([first]));
    expect(layer(layers, overlayFill(first)).layout).toEqual({ visibility: "visible" });
    for (const cat of rest) expect(layer(layers, overlayLine(cat)).layout).toEqual({ visibility: "none" });
    expect(ids(appLayers(FILTER, 7, PALETTES.light, overlays([])))).toEqual(ids(layers));
  });

  it("keep only the PNCT parts in focus mode", () => {
    const off = appLayers(FILTER, 7, PALETTES.light, overlays(CATEGORY_IDS));
    const on = appLayers({ ...FILTER, focus: true }, 7, PALETTES.light, overlays(CATEGORY_IDS));
    for (const cat of CATEGORY_IDS) {
      expect(layer(off, overlayFill(cat)).filter).toBeUndefined();
      expect(layer(on, overlayFill(cat)).filter).toEqual(["==", ["get", "pnct"], true]);
      expect(layer(on, overlayLine(cat)).filter).toEqual(["==", ["get", "pnct"], true]);
    }
  });

  it("use the theme palette", () => {
    for (const theme of ["light", "dark"] as const) {
      const layers = appLayers(FILTER, 7, PALETTES[theme], overlays(CATEGORY_IDS));
      if (CATEGORY_IDS.includes("rnap")) expect(layer(layers, overlayLine("rnap")).paint).toMatchObject({ "line-color": PALETTES[theme].rnap });
      if (CATEGORY_IDS.includes("natura")) {
        expect(layer(layers, overlayFill("natura")).paint).toEqual({ "fill-pattern": NATURA_HATCH_IMAGE });
        expect(layer(layers, overlayLine("natura")).paint).toMatchObject({ "line-color": PALETTES[theme].natura, "line-dasharray": [3, 2] });
      }
    }
  });

  it("are carried over a theme switch with their sources", () => {
    const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    const sources: StyleSpecification["sources"] = Object.fromEntries(
      ["parishes", "concelhos", ...CATEGORY_IDS.map(overlaySource)].map((id) => [id, { type: "geojson", data }]),
    );
    const next: StyleSpecification = { version: 8, sources: {}, layers: [{ id: "bg", type: "background" }] };
    const layers = appLayers(FILTER, 7, PALETTES.dark, overlays(CATEGORY_IDS));
    const out = withAppLayers({ version: 8, sources, layers: [] }, next, layers);
    for (const cat of CATEGORY_IDS) expect(out.sources[overlaySource(cat)]).toBe(sources[overlaySource(cat)]);
    expect(ids(out.layers)).toEqual(["bg", ...ids(layers)]);
  });
});

describe("pattern images", () => {
  it("draws the Natura hatch on the other diagonal from the PNCT hatch", () => {
    const pnct = hatchImage("#000000");
    const natura = hatchImage("#000000", { backslash: true });
    // Top row: "/" puts the stripe at the right edge, "\" at the left.
    expect(pnct.data[15 * 4 + 3]).toBeGreaterThan(0);
    expect(pnct.data[3]).toBe(0);
    expect(natura.data[3]).toBeGreaterThan(0);
    expect(natura.data[15 * 4 + 3]).toBe(0);
  });

  it("has one image per hatch, in the palette's colours", () => {
    expect(Object.keys(patternImages(PALETTES.light)).sort()).toEqual(["natura-hatch", "pnct-hatch"]);
    expect(patternImages(PALETTES.dark)["natura-hatch"].data).not.toEqual(patternImages(PALETTES.light)["natura-hatch"].data);
  });
});

describe("panelAreas", () => {
  const natura = (code: string, name: string, type: string) => ({ cat: "natura", code, name, type });
  const rnap = { cat: "rnap", code: "PNSACV", name: "Sudoeste Alentejano e Costa Vicentina", type: "Parque Natural" };

  it("merges a Natura name listed as ZPE and ZEC into one line, where it first appears", () => {
    const out = panelAreas([
      natura("PTZPE0015", "Costa Sudoeste", "ZPE (Birds Directive)"),
      rnap,
      natura("PTCON0012", "Costa Sudoeste", "ZEC/SIC (Habitats Directive)"),
    ]);
    expect(out).toEqual([
      { name: "Costa Sudoeste", type: "ZPE + ZEC" },
      { name: rnap.name, type: "Parque Natural" },
    ]);
  });

  it("keeps different names, and RNAP areas, as they are", () => {
    const out = panelAreas([natura("PTZPE0002", "Serra do Gerês", "ZPE (Birds Directive)"), natura("PTCON0001", "Peneda / Gerês", "ZEC/SIC (Habitats Directive)"), { ...rnap, name: "Costa Sudoeste" }]);
    expect(out.map((a) => a.type)).toEqual(["ZPE (Birds Directive)", "ZEC/SIC (Habitats Directive)", "Parque Natural"]);
  });
});

describe("strings", () => {
  it("formats shares with at most one decimal", () => {
    expect(formatPct(0)).toBe("0%");
    expect(formatPct(100)).toBe("100%");
    expect(formatPct(12.3)).toBe("12.3%");
    expect(formatPct(0.5)).toBe("0.5%");
    expect(formatPct(0.6)).toBe("0.6%");
  });

  it("shows shares above 0 and below 0.5% as <0.5%", () => {
    expect(formatPct(0.1)).toBe("<0.5%");
    expect(formatPct(0.4)).toBe("<0.5%");
    expect(formatPct(0)).toBe("0%");
  });

  it("summarises the union and the categories", () => {
    expect(t.summary("55%", ["RNAP 12%", "Natura 50%"])).toBe("Under protection: 55% (RNAP 12%, Natura 50%)");
    expect(t.summary("50%", ["Natura 50%"])).toBe("Under protection: 50%"); // one category: the union is that category
  });
});
