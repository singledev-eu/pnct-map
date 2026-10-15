import type { StyleSpecification } from "maplibre-gl";
import type { Theme } from "./theme";

/**
 * The positron labels show `name:latin` plus `name:nonlatin` when a place has a non-Latin name.
 * Near the map's southern edge the basemap tiles include northern Morocco, whose Arabic and
 * Tifinagh names made MapLibre fetch three extra glyph ranges (1536-1791, 65024-65279,
 * 11520-11775) on every load. Showing only the Latin name ("Tanger") removes those requests at
 * any camera position; labels of places without a non-Latin name are unchanged.
 */
const HAS_NONLATIN = JSON.stringify(["has", "name:nonlatin"]);

function latinOnly(expr: unknown): unknown {
  if (typeof expr === "string") return expr.replace(/\s*\{name:nonlatin\}/g, ""); // legacy token strings
  if (!Array.isArray(expr)) return expr;
  // ["case", ["has", "name:nonlatin"], <latin + nonlatin>, <fallback>]
  if (expr[0] === "case" && expr.length === 4 && JSON.stringify(expr[1]) === HAS_NONLATIN) {
    return ["case", expr[1], ["get", "name:latin"], latinOnly(expr[3])];
  }
  return expr.map(latinOnly);
}

/** transformStyle for map.setStyle: the basemap with Latin-only labels. */
export function latinLabels(_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  return {
    ...next,
    layers: next.layers.map((layer) =>
      layer.type === "symbol" && layer.layout?.["text-field"] !== undefined
        ? { ...layer, layout: { ...layer.layout, "text-field": latinOnly(layer.layout["text-field"]) as never } }
        : layer,
    ),
  };
}

/**
 * Dark Matter draws place names in rgb(101,101,101) with a black halo: fine on its near-black land,
 * but too dim over the teal PNCT fill. The dark theme lifts them to #a3a3a3 (7.8:1 on the land) and
 * keeps the halo, which separates them from the fill.
 */
export const DARK_PLACE_LABEL = "#a3a3a3";

function brightPlaceLabels(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.type === "symbol" && layer.id.startsWith("place_") ? { ...layer, paint: { ...layer.paint, "text-color": DARK_PLACE_LABEL } } : layer,
    ),
  };
}

/** transformStyle for the basemap of `theme`: Latin-only labels, plus brighter place names in dark. */
export function basemapStyle(theme: Theme) {
  return (previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification => {
    const style = latinLabels(previous, next);
    return theme === "dark" ? brightPlaceLabels(style) : style;
  };
}
