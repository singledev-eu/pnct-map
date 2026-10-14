import type { StyleSpecification } from "maplibre-gl";

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
