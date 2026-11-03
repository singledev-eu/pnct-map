import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { basemapStyle, DARK_PLACE_LABEL, labelField, latinLabels, NO_REF_LENGTH, setLabelLanguage, WATER_LABEL, waterLabelLayers } from "./basemap";

// The positron label expression (OpenFreeMap, 2026-10).
const POSITRON_LABEL = [
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name"]],
];

const style = (layers: unknown[]) => ({ version: 8, sources: {}, layers }) as unknown as StyleSpecification;
/** The style without the water labels basemapStyle adds (tested on their own below). */
const OWN_WATER = new Set(waterLabelLayers("light").map((l) => l.id));
const withoutWater = (s: StyleSpecification): StyleSpecification => ({ ...s, layers: s.layers.filter((l) => !OWN_WATER.has(l.id)) });

describe("latinLabels", () => {
  it("drops name:nonlatin from label text and keeps the fallback", () => {
    const out = latinLabels(undefined, style([{ id: "label_city", type: "symbol", source: "x", layout: { "text-field": POSITRON_LABEL, "text-size": 12 } }]));
    const layer = out.layers[0] as { layout: Record<string, unknown> };
    expect(layer.layout["text-field"]).toEqual(["case", ["has", "name:nonlatin"], ["get", "name:latin"], ["coalesce", ["get", "name_en"], ["get", "name"]]]);
    expect(layer.layout["text-size"]).toBe(12);
    expect(JSON.stringify(layer.layout["text-field"])).not.toContain('["get","name:nonlatin"]');
  });

  it("handles legacy token strings and leaves other layers alone", () => {
    const fill = { id: "water", type: "fill", source: "x", paint: { "fill-color": "#ccc" } };
    const shield = { id: "shield", type: "symbol", source: "x", layout: { "text-field": ["to-string", ["get", "ref"]] } };
    const legacy = { id: "old", type: "symbol", source: "x", layout: { "text-field": "{name:latin}\n{name:nonlatin}" } };
    const out = latinLabels(undefined, style([fill, shield, legacy]));
    expect(out.layers[0]).toBe(fill);
    expect((out.layers[1] as typeof shield).layout["text-field"]).toEqual(["to-string", ["get", "ref"]]);
    expect((out.layers[2] as typeof legacy).layout["text-field"]).toBe("{name:latin}");
  });
});

describe("basemapStyle", () => {
  const place = { id: "place_town", type: "symbol", source: "omt", "source-layer": "place", layout: { "text-field": POSITRON_LABEL }, paint: { "text-color": "rgb(101,101,101)" } };
  const style = { version: 8, sources: {}, layers: [place] } as unknown as StyleSpecification;
  const paint = (s: StyleSpecification) => (withoutWater(s).layers[0] as { paint: Record<string, unknown> }).paint["text-color"];

  it("brightens place names in dark only, on top of the Latin-only labels", () => {
    expect(paint(basemapStyle("light", "en")(undefined, style))).toBe("rgb(101,101,101)");
    const dark = basemapStyle("dark", "en")(undefined, style);
    expect(paint(dark)).toBe(DARK_PLACE_LABEL);
    expect(JSON.stringify(dark)).not.toContain("name:nonlatin\"]]");
  });
});

describe("label language", () => {
  const label = (id: string) => ({ id, type: "symbol", source: "omt", "source-layer": "place", layout: { "text-field": POSITRON_LABEL } });
  const shield = { id: "shield", type: "symbol", source: "omt", layout: { "text-field": ["to-string", ["get", "ref"]] } };
  const input = { version: 8, sources: {}, layers: [label("place_city"), shield] } as unknown as StyleSpecification;
  const field = (s: StyleSpecification, i = 0) => (withoutWater(s).layers[i] as { layout: Record<string, unknown> }).layout["text-field"];

  it("prefers name:<lang>, then the Latin name, then name_en (EN) or the local name (PT)", () => {
    expect(labelField("pt")).toEqual(["coalesce", ["get", "name:pt"], ["case", ["has", "name:nonlatin"], ["get", "name:latin"], ["get", "name"]]]);
    expect(labelField("en")).toEqual(["coalesce", ["get", "name:en"], ["case", ["has", "name:nonlatin"], ["get", "name:latin"], ["coalesce", ["get", "name_en"], ["get", "name"]]]]);
  });

  it("localizes the name labels in both themes and leaves the road refs alone", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const lang of ["pt", "en"] as const) {
        const out = basemapStyle(theme, lang)(undefined, input);
        expect(field(out)).toEqual(labelField(lang));
        expect(field(out, 1)).toEqual(["to-string", ["get", "ref"]]);
        expect(JSON.stringify(field(out))).not.toContain('["get","name:nonlatin"]'); // still no non-Latin text
      }
    }
  });

  it("switches the labels of a loaded style in place", () => {
    const style = basemapStyle("light", "en")(undefined, input);
    const set: [string, unknown][] = [];
    setLabelLanguage({ getStyle: () => style, setLayoutProperty: (id, name, value) => name === "text-field" && set.push([id, value]) }, "pt");
    set.sort();
    expect(set).toEqual([["place_city", labelField("pt")], ...[...OWN_WATER].map((id) => [id, labelField("pt")])].sort());
  });
});

describe("shield filters", () => {
  // highway-shield-non-us (OpenFreeMap positron, 2026-10).
  const shield = {
    id: "highway-shield-non-us",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "transportation_name",
    filter: [
      "all",
      ["<=", ["get", "ref_length"], 6],
      ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
      ["match", ["get", "network"], ["us-highway", "us-interstate", "us-state"], false, true],
    ],
    layout: { "icon-image": ["concat", "road_", ["get", "ref_length"]], "text-field": ["to-string", ["get", "ref"]] },
  };
  const other = { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", filter: ["==", ["get", "class"], "lake"] };
  const style = { version: 8, sources: {}, layers: [shield, other] } as unknown as StyleSpecification;

  it("gives a missing ref_length a stand-in above the limit, in the filter only", () => {
    const [patched, water] = basemapStyle("light", "en")(undefined, style).layers as unknown as (typeof shield)[];
    expect(patched.filter[1]).toEqual(["<=", ["coalesce", ["get", "ref_length"], NO_REF_LENGTH], 6]);
    expect(NO_REF_LENGTH).toBeGreaterThan(6); // a road without a ref still fails the filter, as before
    expect(patched.filter.slice(2)).toEqual(shield.filter.slice(2));
    expect(patched.layout).toEqual(shield.layout);
    expect(water).toBe(other);
  });
});

describe("water labels", () => {
  // Positron: a grey waterway label and two water_name labels; Dark Matter: one water_name label among the line layers.
  const waterway = { id: "waterway", type: "line", source: "openmaptiles", "source-layer": "waterway" };
  const road = { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation" };
  const label = (id: string, sourceLayer: string) => ({ id, type: "symbol", source: "openmaptiles", "source-layer": sourceLayer, layout: { "text-field": POSITRON_LABEL }, paint: { "text-color": "hsl(0,0%,66%)" } });
  const place = label("place_city", "place");
  const positron = style([waterway, road, label("waterway_line_label", "waterway"), label("water_name_line_label", "water_name"), place]);
  const dark = style([waterway, label("water_name", "water_name"), road, place]);
  const ids = (s: StyleSpecification) => s.layers.map((l) => l.id);

  it.each([
    ["light", positron],
    ["dark", dark],
  ] as const)("%s: replaced by our layers, the lowest labels above every line and fill layer", (theme, input) => {
    const out = basemapStyle(theme, "pt")(undefined, input);
    expect(ids(out)).toEqual(["waterway", "road", "pnct-waterway-label", "pnct-water-name-line", "pnct-water-name-point", "place_city"]);
    const water = out.layers.filter((l) => OWN_WATER.has(l.id)) as unknown as { paint: Record<string, unknown>; layout: Record<string, unknown>; minzoom?: number }[];
    for (const l of water) {
      expect(l.paint["text-color"]).toBe(WATER_LABEL[theme].text);
      expect(l.paint["text-halo-color"]).toBe(WATER_LABEL[theme].halo);
      expect(l.layout["text-field"]).toEqual(labelField("pt")); // names in the UI language, Latin only
    }
    expect(water[0].minzoom).toBe(10); // the waterway names from positron's zoom
  });
});
