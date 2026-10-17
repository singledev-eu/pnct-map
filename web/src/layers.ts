import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { FADE } from "./camera";
import type { MapData } from "./data";
import type { OverlayData } from "./protected";
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
export const HATCH_IMAGE = "pnct-hatch";
export const NATURA_HATCH_IMAGE = "natura-hatch";

/**
 * Protected-areas overlay: one GeoJSON source per category ("protected-rnap", "protected-natura"), each
 * with a fill and an outline layer. They sit above the parish fills and below the parish/concelho
 * lines and the selection highlight, so the PNCT fill shows through and the selection stays on top.
 * They are never hit-tested (main.ts queries only the parish and concelho fills), so clicks and the
 * zoom-dependent selection go straight through them.
 */
export const overlaySource = (cat: string) => `protected-${cat}`;
export const overlayFill = (cat: string) => `protected-${cat}-fill`;
export const overlayLine = (cat: string) => `protected-${cat}-line`;

export interface OverlayState {
  /** Category ids, legend order. */
  categories: readonly string[];
  /** The overlay data is in the style (sources added). Until then there are no overlay layers. */
  loaded: boolean;
  visible: ReadonlySet<string>;
}

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

/**
 * Diagonal stripes, drawn at 2× (16 px tile = 8 CSS px). The default is the PNCT hatch of partly-PNCT
 * concelhos: a 3 px stripe at 80% alpha on the "/" diagonal. Natura 2000 uses `\` with a thinner stripe.
 */
export function hatchImage(color: string, { stripe = 3, alpha = 0.8, backslash = false } = {}): { width: number; height: number; data: Uint8Array } {
  const size = 16;
  // Premultiplied RGBA of `color` (#rrggbb) at `alpha`.
  const rgba = [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * alpha)).concat(Math.round(255 * alpha));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size >= stripe) continue;
      data.set(rgba, (y * size + (backslash ? x : size - 1 - x)) * 4);
    }
  }
  return { width: size, height: size, data };
}

const naturaHatch = (color: string) => hatchImage(color, { stripe: 2, alpha: 0.75, backslash: true });

/** The app's pattern images in the palette's colours, by image id. */
export function patternImages(colors: MapPalette): Record<string, ReturnType<typeof hatchImage>> {
  return { [HATCH_IMAGE]: hatchImage(colors.pnct), [NATURA_HATCH_IMAGE]: naturaHatch(colors.natura) };
}

/**
 * Overlay layers, per category: RNAP as a light tint with a solid outline, Natura 2000 as a "\" hatch
 * with a dashed outline, so the two read apart where they overlap, and apart from the PNCT fill
 * (solid teal) and the partly-PNCT hatch ("/"). Hidden categories keep their layers with
 * visibility "none", so a toggle doesn't rebuild anything. Focus mode drops the parts outside PNCT
 * territory (the pipeline splits every category along the display PNCT outline: `pnct` true/false).
 */
function overlayLayers(overlays: OverlayState | undefined, focus: boolean, colors: MapPalette): LayerSpecification[] {
  if (!overlays?.loaded) return [];
  const width: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 5, 0.6, 9, 1.1, 13, 2];
  return overlays.categories.flatMap<LayerSpecification>((cat) => {
    const color = cat === "natura" ? colors.natura : colors.rnap;
    const layout = { visibility: overlays.visible.has(cat) ? ("visible" as const) : ("none" as const) };
    const filter = withFilter(parishFilter(focus));
    return [
      {
        id: overlayFill(cat),
        type: "fill",
        source: overlaySource(cat),
        layout,
        ...filter,
        paint: cat === "natura" ? { "fill-pattern": NATURA_HATCH_IMAGE } : { "fill-color": color, "fill-opacity": colors.rnapTint },
      },
      {
        id: overlayLine(cat),
        type: "line",
        source: overlaySource(cat),
        layout,
        ...filter,
        paint: { "line-color": color, "line-width": width, "line-opacity": 0.9, ...(cat === "natura" ? { "line-dasharray": [3, 2] } : {}) },
      },
    ];
  });
}

/** The app's map layers, bottom to top, for the current filter, level zoom, theme palette and overlays. */
export function appLayers(filter: FilterState, level: number, colors: MapPalette, overlays?: OverlayState): LayerSpecification[] {
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
    ...overlayLayers(overlays, filter.focus, colors),
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
  setPatternImages(map, colors);
  const basemap = map.getStyle().layers;
  const before = basemap[appLayerIndex(basemap)]?.id;
  for (const layer of appLayers(filter, level, colors)) map.addLayer(layer, before);
}

/**
 * Adds the overlay sources and layers (OverlayState.loaded) below the parish lines, as appLayers
 * orders them. `overlays.loaded` must already be true.
 */
export function addOverlays(map: MapLibreMap, data: OverlayData, overlays: OverlayState, filter: FilterState, colors: MapPalette): void {
  for (const cat of overlays.categories) {
    if (!map.getSource(overlaySource(cat))) map.addSource(overlaySource(cat), { type: "geojson", data: data[cat], maxzoom: 12 });
  }
  setPatternImages(map, colors);
  for (const layer of overlayLayers(overlays, filter.focus, colors)) if (!map.getLayer(layer.id)) map.addLayer(layer, PARISH_LINE);
}

/** Shows or hides each category's layers (no-op before the overlay is loaded). */
export function setOverlayVisibility(map: MapLibreMap, overlays: OverlayState): void {
  for (const cat of overlays.categories) {
    for (const id of [overlayFill(cat), overlayLine(cat)]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", overlays.visible.has(cat) ? "visible" : "none");
    }
  }
}

/**
 * transformStyle for a theme switch (map.setStyle with the other basemap): `next` plus the app's
 * sources (every source the app layers use), carried over unchanged from `previous`, and its layers,
 * rebuilt for the new palette, at appLayerIndex. MapLibre diffs this against the current style, so the
 * GeoJSON sources, their feature state (hover, selection) and the pattern images stay; only paint
 * values and basemap layers change.
 */
export function withAppLayers(previous: StyleSpecification | undefined, next: StyleSpecification, layers: LayerSpecification[]): StyleSpecification {
  const sources = { ...next.sources };
  for (const id of new Set([PARISH_SOURCE, CONCELHO_SOURCE, ...layers.map((l) => ("source" in l ? l.source : undefined))])) {
    const source = id ? previous?.sources[id] : undefined;
    if (id && source) sources[id] = source;
  }
  if (!sources[PARISH_SOURCE] || !sources[CONCELHO_SOURCE]) return next; // the app has not added them yet
  layers = layers.filter((l) => !("source" in l) || sources[l.source as string]); // an overlay the previous style lacked
  const split = appLayerIndex(next.layers);
  return { ...next, sources, layers: [...next.layers.slice(0, split), ...layers, ...next.layers.slice(split)] };
}

/** Recolours the pattern images (kept across a diffed style switch) or adds them (after a full style rebuild). */
export function setPatternImages(map: MapLibreMap, colors: MapPalette): void {
  for (const [id, image] of Object.entries(patternImages(colors))) {
    if (map.hasImage(id)) map.updateImage(id, image);
    else map.addImage(id, image, { pixelRatio: 2 });
  }
}

/** Re-applies filters and paint after a filter change or a new level zoom (viewport resize). */
export function applyFilter(map: MapLibreMap, filter: FilterState, level: number, overlayCategories: readonly string[] = []): void {
  for (const cat of overlayCategories) {
    for (const id of [overlayFill(cat), overlayLine(cat)]) if (map.getLayer(id)) map.setFilter(id, parishFilter(filter.focus));
  }
  for (const id of [PARISH_FILL, PARISH_LINE, PARISH_HIGHLIGHT]) map.setFilter(id, parishFilter(filter.focus));
  for (const id of [CONCELHO_FILL, CONCELHO_LINE, CONCELHO_HIGHLIGHT]) map.setFilter(id, concelhoFilter(filter.focus));
  map.setPaintProperty(PARISH_FILL, "fill-opacity", parishFillOpacity(filter, level));
  map.setPaintProperty(CONCELHO_FILL, "fill-opacity", concelhoFillOpacity(filter, level));
  map.setPaintProperty(CONCELHO_HATCH, "fill-opacity", hatchOpacity(filter, level));
  map.setPaintProperty(PARISH_LINE, "line-opacity", parishLevel(level, lineOpacity(filter.district, 0.45, 0.15)));
  map.setPaintProperty(CONCELHO_LINE, "line-opacity", lineOpacity(filter.district, 0.6, 0.2));
  map.setPaintProperty(CONCELHO_HIGHLIGHT, "line-opacity", concelhoLevel(level, ["case", ["any", selected, hovered], 1, 0]));
}
