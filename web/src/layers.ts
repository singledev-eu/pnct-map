import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { FADE } from "./camera";
import type { MapData } from "./data";
import type { MapPalette } from "./theme";

export const PARISH_SOURCE = "parishes";
export const CONCELHO_SOURCE = "concelhos";
export const PARISH_FILL = "parish-fill";
export const CONCELHO_FILL = "concelho-fill";
const CONCELHO_HATCH = "concelho-hatch";
const PARISH_LINE = "parish-line";
const PARISH_HIGHLIGHT = "parish-highlight";
const CONCELHO_LINE = "concelho-line";
const CONCELHO_HIGHLIGHT = "concelho-highlight";
const HATCH_IMAGE = "pnct-hatch";

export interface FilterState {
  district: string | null;
  /** Focus mode ("Only PNCT"): hide everything outside PNCT territory. */
  focus: boolean;
}

const isPnct: ExpressionSpecification = ["==", ["get", "pnct"], true];
// Concelhos with at least one PNCT parish (their whole outline is kept in focus mode).
const hasPnct: ExpressionSpecification = [">", ["get", "pnct_count"], 0];
const allPnct: ExpressionSpecification = ["==", ["get", "pnct_count"], ["get", "parish_count"]];
const partPnct: ExpressionSpecification = ["all", hasPnct, ["<", ["get", "pnct_count"], ["get", "parish_count"]]];
const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
// Member of the selected concelho.
const grouped: ExpressionSpecification = ["boolean", ["feature-state", "group"], false];

function inDistrict(district: string | null): ExpressionSpecification {
  return district ? ["==", ["get", "distrito"], district] : ["literal", true];
}

/**
 * Zoom levels: below `level` the map shows concelhos, above it parishes. The two fills cross-fade
 * over level ± FADE through their opacity; no layer is hidden or added, so both sources stay loaded
 * and nothing pops in. (A zoom expression must be the outermost one, hence the wrapper.)
 */
function concelhoLevel(level: number, value: ExpressionSpecification | number): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], level - FADE, value, level + FADE, 0];
}
function parishLevel(level: number, value: ExpressionSpecification | number): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], level - FADE, 0, level + FADE, value];
}

function parishFillOpacity({ district }: FilterState, level: number): ExpressionSpecification {
  return parishLevel(level, [
    "case",
    selected, 0.85,
    ["!", inDistrict(district)], ["case", isPnct, 0.12, 0],
    hovered, ["case", isPnct, 0.72, 0.22],
    grouped, ["case", isPnct, 0.68, 0.12],
    isPnct, 0.5,
    0.035,
  ]);
}

/** Whole-PNCT concelhos look like PNCT parishes; partly-PNCT ones get a light fill plus the hatch layer. */
function concelhoFillOpacity({ district }: FilterState, level: number): ExpressionSpecification {
  return concelhoLevel(level, [
    "case",
    selected, 0.7,
    ["!", inDistrict(district)], ["case", hasPnct, 0.12, 0],
    hovered, ["case", allPnct, 0.72, hasPnct, 0.4, 0.22],
    allPnct, 0.5,
    hasPnct, 0.16,
    0.035,
  ]);
}

function hatchOpacity({ district }: FilterState, level: number): ExpressionSpecification {
  return concelhoLevel(level, ["case", ["!", inDistrict(district)], 0.25, 0.9]);
}

function lineOpacity(district: string | null, inside: number, outside: number): ExpressionSpecification {
  return ["case", inDistrict(district), inside, outside];
}

/** Layer filters for focus mode: features outside PNCT territory are dropped, so they are neither drawn nor hit-tested. */
function parishFilter(focus: boolean): ExpressionSpecification | null {
  return focus ? isPnct : null;
}
function concelhoFilter(focus: boolean): ExpressionSpecification | null {
  return focus ? hasPnct : null;
}

// addLayer rejects an explicit `filter: undefined`, so only pass the key when there is a filter.
const withFilter = (filter: ExpressionSpecification | null) => (filter ? { filter } : {});

/** Diagonal stripes in the PNCT colour, for partly-PNCT concelhos (8 CSS px, drawn at 2×). */
export function hatchImage(color: string): { width: number; height: number; data: Uint8Array } {
  const size = 16;
  const alpha = 0.8;
  // Premultiplied RGBA of `color` (#rrggbb) at 80% alpha.
  const rgba = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * alpha)).concat(Math.round(255 * alpha));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size >= 3) continue; // a 3 px stripe per 16 px tile, on the "/" diagonal
      data.set(rgba, (y * size + (size - 1 - x)) * 4);
    }
  }
  return { width: size, height: size, data };
}

/** The app's map layers, bottom to top, for the current filter, level zoom and theme palette. */
export function appLayers(filter: FilterState, level: number, colors: MapPalette): LayerSpecification[] {
  return [
    {
      id: CONCELHO_FILL,
      type: "fill",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: {
        "fill-color": ["case", selected, colors.selected, hasPnct, colors.pnct, colors.other],
        "fill-opacity": concelhoFillOpacity(filter, level),
      },
    },
    {
      id: CONCELHO_HATCH,
      type: "fill",
      source: CONCELHO_SOURCE,
      filter: partPnct,
      paint: { "fill-pattern": HATCH_IMAGE, "fill-opacity": hatchOpacity(filter, level) },
    },
    {
      id: PARISH_FILL,
      type: "fill",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      paint: {
        "fill-color": ["case", selected, colors.selected, isPnct, colors.pnct, colors.other],
        "fill-opacity": parishFillOpacity(filter, level),
      },
    },
    {
      id: PARISH_LINE,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      minzoom: 8,
      paint: {
        "line-color": colors.parishLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 0.8],
        "line-opacity": parishLevel(level, lineOpacity(filter.district, 0.45, 0.15)),
      },
    },
    {
      id: CONCELHO_LINE,
      type: "line",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: {
        "line-color": colors.concelhoLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 9, 1.1, 12, 1.8],
        "line-opacity": lineOpacity(filter.district, 0.6, 0.2),
      },
    },
    {
      id: PARISH_HIGHLIGHT,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      paint: {
        "line-color": colors.highlight,
        "line-width": ["case", selected, 2.2, hovered, 1.6, grouped, 1, 0],
        "line-opacity": ["case", ["any", selected, hovered], 1, grouped, 0.7, 0],
      },
    },
    {
      id: CONCELHO_HIGHLIGHT,
      type: "line",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: {
        "line-color": colors.highlight,
        "line-width": ["case", selected, 2.4, hovered, 1.8, 0],
        "line-opacity": concelhoLevel(level, ["case", ["any", selected, hovered], 1, 0]),
      },
    },
  ];
}

/**
 * Where the app layers go in a basemap's layer list: above every non-label layer (land, roads,
 * boundaries), below the label stack. Positron draws all its labels last, so that is its first label
 * layer; Dark Matter has a water label early on, before the buildings and roads, whose near-black
 * lines would otherwise cross the PNCT fill.
 */
export function appLayerIndex(layers: readonly LayerSpecification[]): number {
  let last = -1;
  layers.forEach((l, i) => {
    if (l.type !== "symbol") last = i;
  });
  return last + 1;
}

/** Adds the sources and the map layers between the basemap and its labels (appLayerIndex). `level`: see concelhoLevel. */
export function addLayers(map: MapLibreMap, data: MapData, filter: FilterState, level: number, colors: MapPalette): void {
  map.addSource(PARISH_SOURCE, { type: "geojson", data: data.parishGeoJSON, maxzoom: 12 });
  map.addSource(CONCELHO_SOURCE, { type: "geojson", data: data.concelhoGeoJSON, maxzoom: 12 });
  map.addImage(HATCH_IMAGE, hatchImage(colors.pnct), { pixelRatio: 2 });
  const basemap = map.getStyle().layers;
  const before = basemap[appLayerIndex(basemap)]?.id;
  for (const layer of appLayers(filter, level, colors)) map.addLayer(layer, before);
}

/**
 * transformStyle for a theme switch (map.setStyle with the other basemap): `next` plus the app's
 * sources, carried over unchanged from `previous`, and its layers, rebuilt for the new palette, at
 * appLayerIndex. MapLibre diffs this against the current style, so the GeoJSON sources, their
 * feature state (hover, selection) and the hatch image stay; only paint values and basemap layers change.
 */
export function withAppLayers(previous: StyleSpecification | undefined, next: StyleSpecification, layers: LayerSpecification[]): StyleSpecification {
  const sources = { ...next.sources };
  for (const id of [PARISH_SOURCE, CONCELHO_SOURCE]) {
    const source = previous?.sources[id];
    if (source) sources[id] = source;
  }
  if (!sources[PARISH_SOURCE] || !sources[CONCELHO_SOURCE]) return next; // the app has not added them yet
  const split = appLayerIndex(next.layers);
  return { ...next, sources, layers: [...next.layers.slice(0, split), ...layers, ...next.layers.slice(split)] };
}

/** Recolours the hatch image (kept across a diffed style switch) or adds it (after a full style rebuild). */
export function setHatchColor(map: MapLibreMap, color: string): void {
  if (map.hasImage(HATCH_IMAGE)) map.updateImage(HATCH_IMAGE, hatchImage(color));
  else map.addImage(HATCH_IMAGE, hatchImage(color), { pixelRatio: 2 });
}

/** Re-applies filters and paint after a filter change or a new level zoom (viewport resize). */
export function applyFilter(map: MapLibreMap, filter: FilterState, level: number): void {
  for (const id of [PARISH_FILL, PARISH_LINE, PARISH_HIGHLIGHT]) map.setFilter(id, parishFilter(filter.focus));
  for (const id of [CONCELHO_FILL, CONCELHO_LINE, CONCELHO_HIGHLIGHT]) map.setFilter(id, concelhoFilter(filter.focus));
  map.setPaintProperty(PARISH_FILL, "fill-opacity", parishFillOpacity(filter, level));
  map.setPaintProperty(CONCELHO_FILL, "fill-opacity", concelhoFillOpacity(filter, level));
  map.setPaintProperty(CONCELHO_HATCH, "fill-opacity", hatchOpacity(filter, level));
  map.setPaintProperty(PARISH_LINE, "line-opacity", parishLevel(level, lineOpacity(filter.district, 0.45, 0.15)));
  map.setPaintProperty(CONCELHO_LINE, "line-opacity", lineOpacity(filter.district, 0.6, 0.2));
  map.setPaintProperty(CONCELHO_HIGHLIGHT, "line-opacity", concelhoLevel(level, ["case", ["any", selected, hovered], 1, 0]));
}
