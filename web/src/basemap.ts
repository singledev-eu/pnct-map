import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { Lang } from "./strings";
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
 * Basemap labels in the UI language. The OpenMapTiles tiles carry name:pt and name:en (Sevilla →
 * "Sevilha" / "Seville", Lisboa → "Lisboa" / "Lisbon"). A label shows name:<lang> when the feature
 * has one, and otherwise what it showed before: the Latin name where there is a non-Latin one (so
 * still no Arabic or Tifinagh glyphs), else name_en (EN) or the local name (PT). Applied to every
 * label layer whose text-field is positron's / Dark Matter's name expression (the same in both
 * themes): at load through basemapStyle, on a language switch through setLabelLanguage.
 */
const IS_NAME_LABEL = JSON.stringify(["has", "name:nonlatin"]);
const isNameLabel = (field: unknown) => JSON.stringify(field ?? "").includes(IS_NAME_LABEL);

export function labelField(lang: Lang): ExpressionSpecification {
  const local: ExpressionSpecification = lang === "en" ? ["coalesce", ["get", "name_en"], ["get", "name"]] : ["get", "name"];
  return ["coalesce", ["get", `name:${lang}`], ["case", ["has", "name:nonlatin"], ["get", "name:latin"], local]];
}

function localLabels(style: StyleSpecification, lang: Lang): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.type === "symbol" && isNameLabel(layer.layout?.["text-field"]) ? { ...layer, layout: { ...layer.layout, "text-field": labelField(lang) } } : layer,
    ),
  };
}

/** Switches the basemap labels of the current style to `lang`, in place (no style reload). */
export function setLabelLanguage(map: { getStyle(): StyleSpecification; setLayoutProperty(id: string, name: string, value: unknown): void }, lang: Lang): void {
  for (const layer of map.getStyle().layers) {
    if (layer.type === "symbol" && isNameLabel(layer.layout?.["text-field"])) map.setLayoutProperty(layer.id, "text-field", labelField(lang));
  }
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

/**
 * Water names, both themes. Positron draws river and stream names (its waterway layer, from z10)
 * in light grey hsl(0,0%,66%) with a translucent halo: 2.4:1 on its own land and lost on the PNCT
 * fill. Dark Matter has no waterway names at all, and its one water_name layer (black text) sits
 * among the line layers, below the app's fills. Both get the same three label layers here, from the
 * tiles' `waterway` and `water_name` layers (names in the UI language like every basemap label),
 * styled per theme with an opaque halo, and placed as the lowest labels, above every app layer
 * (appLayerIndex). Colours: contrast.test.ts.
 */
export const WATER_LABEL: Record<Theme, { text: string; halo: string }> = {
  light: { text: "#0b2c55", halo: "#ffffff" },
  dark: { text: "#b5d6f7", halo: "#0c0c0c" },
};

/** The basemaps' water label layers (replaced by waterLabels). */
const isWaterLabel = (layer: StyleSpecification["layers"][number]) =>
  layer.type === "symbol" && "source-layer" in layer && (layer["source-layer"] === "waterway" || layer["source-layer"] === "water_name");

// The name expression of the basemap labels, so latinLabels and localLabels apply to these too.
const WATER_NAME: ExpressionSpecification = ["case", ["has", "name:nonlatin"], ["concat", ["get", "name:latin"], " ", ["get", "name:nonlatin"]], ["coalesce", ["get", "name_en"], ["get", "name"]]];
const isLine: ExpressionSpecification = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];
const isPoint: ExpressionSpecification = ["match", ["geometry-type"], ["MultiPoint", "Point"], true, false];

export function waterLabelLayers(theme: Theme): StyleSpecification["layers"] {
  const { text, halo } = WATER_LABEL[theme];
  const paint = { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.5 };
  const font = { "text-font": ["Noto Sans Italic"] }; // positron's water font, also served for Dark Matter
  const line = { "symbol-placement": "line", "symbol-spacing": 350, "text-field": WATER_NAME, ...font, "text-letter-spacing": 0.1, "text-size": 13 } as const;
  return [
    { id: "pnct-waterway-label", type: "symbol", source: "openmaptiles", "source-layer": "waterway", minzoom: 10, filter: isLine, layout: line, paint },
    { id: "pnct-water-name-line", type: "symbol", source: "openmaptiles", "source-layer": "water_name", filter: isLine, layout: line, paint },
    { id: "pnct-water-name-point", type: "symbol", source: "openmaptiles", "source-layer": "water_name", filter: isPoint, layout: { "text-field": WATER_NAME, ...font, "text-letter-spacing": 0.1, "text-max-width": 5, "text-size": 13 }, paint },
  ] as StyleSpecification["layers"];
}

/** Replaces the basemap's water labels with waterLabelLayers, as the lowest labels above every non-label layer. */
export function waterLabels(style: StyleSpecification, theme: Theme): StyleSpecification {
  const layers = style.layers.filter((l) => !isWaterLabel(l));
  let at = 0;
  layers.forEach((l, i) => {
    if (l.type !== "symbol") at = i + 1;
  });
  return { ...style, layers: [...layers.slice(0, at), ...waterLabelLayers(theme), ...layers.slice(at)] };
}

/**
 * Positron's road-shield layers (highway-shield-non-us, highway-shield-us-interstate, road_shield_us)
 * filter on ["<=", ["get", "ref_length"], 6]. Roads without a ref have no ref_length, and MapLibre
 * logs "Expected value to be of type number, but found null instead. Falling back to false" for each
 * layer. The patch gives the missing value a stand-in above any limit, so the comparison stays false
 * exactly as before, only without the warning. (A 0 would make it true and match every road without
 * a ref.) It touches only comparisons on ref_length; the icon and text expressions are unchanged.
 */
export const NO_REF_LENGTH = 1000;

function refLengthFilter(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;
  if (["<", "<=", ">", ">=", "==", "!="].includes(expr[0]) && JSON.stringify(expr[1]) === '["get","ref_length"]') {
    return [expr[0], ["coalesce", expr[1], NO_REF_LENGTH], ...expr.slice(2)];
  }
  return expr.map(refLengthFilter);
}

function shieldFilters(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) =>
      "filter" in layer && layer.filter && JSON.stringify(layer.filter).includes('"ref_length"')
        ? { ...layer, filter: refLengthFilter(layer.filter) as never }
        : layer,
    ),
  };
}

/** transformStyle for the basemap of `theme`: readable water names, labels in `lang` (Latin-only fallback), quiet shield filters, plus brighter place names in dark. */
export function basemapStyle(theme: Theme, lang: Lang) {
  return (previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification => {
    const style = shieldFilters(localLabels(latinLabels(previous, waterLabels(next, theme)), lang));
    return theme === "dark" ? brightPlaceLabels(style) : style;
  };
}
