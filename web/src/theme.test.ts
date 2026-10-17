import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { hatchImage, withAppLayers } from "./layers";
import { PALETTES, type MapPalette } from "./theme";
import css from "./style.css?raw"; // the file as text, not a stylesheet import

/** The --map-* tokens of the first CSS block that starts with `opening`. */
function mapTokens(opening: string): Record<string, string> {
  const start = css.indexOf(opening);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--map-([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const asTokens = (p: MapPalette) => ({ pnct: p.pnct, other: p.other, "parish-line": p.parishLine, "concelho-line": p.concelhoLine, rnap: p.rnap, natura: p.natura });

describe("theme palette", () => {
  it("matches the legend tokens in style.css", () => {
    expect(mapTokens(":root {")).toEqual(asTokens(PALETTES.light));
    expect(mapTokens("@media (prefers-color-scheme: dark) {\n  :root {")).toEqual(asTokens(PALETTES.dark));
  });

  it("draws the hatch in the premultiplied PNCT colour", () => {
    const { data } = hatchImage("#0f8a7e");
    const stripe = [...data].findIndex((v) => v !== 0);
    expect([...data.slice(stripe, stripe + 4)]).toEqual([12, 110, 101, 204]); // the former hard-coded value
  });
});

describe("withAppLayers", () => {
  const style = (layers: LayerSpecification[], sources: StyleSpecification["sources"] = {}): StyleSpecification => ({ version: 8, sources, layers });
  const bg: LayerSpecification = { id: "bg", type: "background" };
  const label: LayerSpecification = { id: "label", type: "symbol", source: "omt", "source-layer": "place" };
  const app: LayerSpecification = { id: "parish-fill", type: "fill", source: "parishes" };
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  const sources: StyleSpecification["sources"] = { parishes: { type: "geojson", data }, concelhos: { type: "geojson", data } };

  it("carries the app sources over and puts its layers between the basemap and its labels", () => {
    // Dark Matter: a water label comes before the roads; the app layers go above the roads.
    const road: LayerSpecification = { id: "road", type: "line", source: "omt", "source-layer": "transportation" };
    const out = withAppLayers(style([], sources), style([bg, { ...label, id: "water_name" }, road, label]), [app]);
    expect(out.layers.map((l) => l.id)).toEqual(["bg", "water_name", "road", "parish-fill", "label"]);
    expect(out.sources.parishes).toBe(sources.parishes);
  });

  it("leaves the style alone before the app has added its sources", () => {
    const next = style([bg, label]);
    expect(withAppLayers(style([]), next, [app])).toBe(next);
  });
});
