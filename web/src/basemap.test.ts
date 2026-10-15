import type { StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { basemapStyle, DARK_PLACE_LABEL, latinLabels, NO_REF_LENGTH } from "./basemap";

// The positron label expression (OpenFreeMap, 2026-10).
const POSITRON_LABEL = [
  "case",
  ["has", "name:nonlatin"],
  ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]],
  ["coalesce", ["get", "name_en"], ["get", "name"]],
];

const style = (layers: unknown[]) => ({ version: 8, sources: {}, layers }) as unknown as StyleSpecification;

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
  const paint = (s: StyleSpecification) => (s.layers[0] as { paint: Record<string, unknown> }).paint["text-color"];

  it("brightens place names in dark only, on top of the Latin-only labels", () => {
    expect(paint(basemapStyle("light")(undefined, style))).toBe("rgb(101,101,101)");
    const dark = basemapStyle("dark")(undefined, style);
    expect(paint(dark)).toBe(DARK_PLACE_LABEL);
    expect(JSON.stringify(dark)).not.toContain("name:nonlatin\"]]");
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
    const [patched, water] = basemapStyle("light")(undefined, style).layers as unknown as (typeof shield)[];
    expect(patched.filter[1]).toEqual(["<=", ["coalesce", ["get", "ref_length"], NO_REF_LENGTH], 6]);
    expect(NO_REF_LENGTH).toBeGreaterThan(6); // a road without a ref still fails the filter, as before
    expect(patched.filter.slice(2)).toEqual(shield.filter.slice(2));
    expect(patched.layout).toEqual(shield.layout);
    expect(water).toBe(other);
  });
});
