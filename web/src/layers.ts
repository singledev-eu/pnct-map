import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { FADE, protectedFade } from "./camera";
import { extrusionTop, luminance, over, parseHex, toHex } from "./contrast";
import { CITY_SOURCE, cityDots, cityLayers, SEAT_LAYER, SEAT_LEAD, CAPITAL_LAYER, SELECTED_SEAT_LAYER, seatFilter, selectedSeatFilter } from "./cities";
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
export const CONCELHO_SLAB = "concelho-slab";
export const PARISH_SLAB = "parish-slab";
export const SLAB_VEIL = "slab-veil";
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
  /** The concelho seats and district capitals (cities.ts; legend toggle). Shown unless false. */
  cities?: boolean;
  /** The concelho (DICO) of the current selection: its seat is always labelled (cities.ts). */
  seat?: string | null;
  /**
   * A flat selection is active (main.ts: something selected, 3D off): everything but the selection
   * is dimmed (DIM), and a selected concelho keeps its outline past the concelho level. In 3D the
   * veil and the slab do both.
   */
  dim?: boolean;
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

/** Hovered and grouped (in the selected concelho) non-PNCT fills: a step above the palette's resting opacity. */
const otherHover = (colors: MapPalette) => colors.otherOpacity + 0.185;
const otherGroup = (colors: MapPalette) => colors.otherOpacity + 0.085;

/** Fill opacity factor of the features outside a flat selection (FilterState.dim). */
export const DIM = 0.45;
const dimBy = ({ dim }: FilterState) => (dim ? DIM : 1);

function parishFillOpacity(filter: FilterState, level: number, colors: MapPalette): ExpressionSpecification {
  const k = dimBy(filter);
  return parishLevel(level, [
    "case",
    selected, 0.85,
    ["!", inDistrict(filter.district)], ["case", isPnct, 0.12 * k, 0],
    hovered, ["case", isPnct, 0.72, otherHover(colors)],
    grouped, ["case", isPnct, 0.68, otherGroup(colors)],
    isPnct, 0.5 * k,
    colors.otherOpacity * k,
  ]);
}

/** Whole-PNCT concelhos look like PNCT parishes; partly-PNCT ones get a light fill plus the hatch layer. */
function concelhoFillOpacity(filter: FilterState, level: number, colors: MapPalette): ExpressionSpecification {
  const k = dimBy(filter);
  return concelhoLevel(level, [
    "case",
    selected, 0.7,
    ["!", inDistrict(filter.district)], ["case", hasPnct, 0.12 * k, 0],
    hovered, ["case", allPnct, 0.72, hasPnct, 0.4, otherHover(colors)],
    allPnct, 0.5 * k,
    hasPnct, 0.16 * k,
    colors.otherOpacity * k,
  ]);
}

function hatchOpacity(filter: FilterState, level: number): ExpressionSpecification {
  return concelhoLevel(level, ["case", selected, 0.9, ["!", inDistrict(filter.district)], 0.25 * dimBy(filter), 0.9 * dimBy(filter)]);
}

/** Width of the outline around the selection, px: solid, in the palette's highlight (accent) colour. */
export const SELECTED_WIDTH = 3;

/**
 * The concelho outline: the selected and the hovered one at the concelho level; past it the hover
 * outline goes (parishes are hovered there), and the selected concelho keeps its outline while the
 * selection is flat (in 3D the slab's rim is the outline).
 */
function concelhoHighlightOpacity(filter: FilterState, level: number): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], level - FADE, ["case", ["any", selected, hovered], 1, 0], level + FADE, ["case", selected, filter.dim ? 1 : 0, 0]];
}

function lineOpacity(district: string | null, inside: number, outside: number): ExpressionSpecification {
  return ["case", inDistrict(district), inside, outside];
}

/**
 * Parish boundaries: hairlines where the parishes first show, growing with the zoom so each parish
 * stays apart from its neighbours once it fills the screen (they share one flat fill).
 */
export const PARISH_LINE_WIDTH: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 8, 0.3, 11, 0.9, 13, 1.4, 15, 2];
const parishLineOpacity = (filter: FilterState, level: number, colors: MapPalette) => parishLevel(level, lineOpacity(filter.district, colors.parishLineOpacity, colors.parishLineOpacity / 3));

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
  return { [HATCH_IMAGE]: hatchImage(colors.pnct), [NATURA_HATCH_IMAGE]: naturaHatch(colors.natura), ...cityDots(colors) };
}

/**
 * Overlay layers, per category: RNAP as a light tint with a solid outline, Natura 2000 as a "\" hatch
 * with a dashed outline, so the two read apart where they overlap, and apart from the PNCT fill
 * (solid teal) and the partly-PNCT hatch ("/"). Hidden categories keep their layers with
 * visibility "none", so a toggle doesn't rebuild anything. Focus mode drops the parts outside PNCT
 * territory (the pipeline splits every category along the display PNCT outline: `pnct` true/false).
 */
function overlayLayers(overlays: OverlayState | undefined, focus: boolean, level: number, colors: MapPalette): LayerSpecification[] {
  if (!overlays?.loaded) return [];
  const width: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 5, 0.6, 9, 1.1, 13, 2];
  return overlays.categories.flatMap<LayerSpecification>((cat) => {
    const color = cat === "natura" ? colors.natura : colors.rnap;
    const layout = { visibility: overlays.visible.has(cat) ? ("visible" as const) : ("none" as const) };
    const filter = withFilter(parishFilter(focus));
    const fill = overlayFillOpacity(cat, level, colors);
    return [
      {
        id: overlayFill(cat),
        type: "fill",
        source: overlaySource(cat),
        layout,
        ...filter,
        paint: cat === "natura" ? { "fill-pattern": NATURA_HATCH_IMAGE, "fill-opacity": fill } : { "fill-color": color, "fill-opacity": fill },
      },
      {
        id: overlayLine(cat),
        type: "line",
        source: overlaySource(cat),
        layout,
        ...filter,
        paint: { "line-color": color, "line-width": width, "line-opacity": overlayLineOpacity(level), ...(cat === "natura" ? { "line-dasharray": [3, 2] } : {}) },
      },
    ];
  });
}

/**
 * Zoom fade of the overlays (camera.ts protectedFade): 0 up to `start`, full at the parish level. At
 * the country view the hatch and outlines would clutter the map and compete with the PNCT fill.
 */
function protectedLevel(level: number, value: number): ExpressionSpecification {
  const [start, end] = protectedFade(level);
  return ["interpolate", ["linear"], ["zoom"], start, 0, end, value];
}
const overlayFillOpacity = (cat: string, level: number, colors: MapPalette) => protectedLevel(level, cat === "natura" ? 1 : colors.rnapTint);
const overlayLineOpacity = (level: number) => protectedLevel(level, 0.9);

/**
 * The 3D selection (drill.ts): the selected concelho or parish as an extruded slab. Every slab layer
 * is filtered to the selection (nothing when its code is null), so the extrusion buckets only ever
 * hold one feature. Heights and opacities are constants, so paint transitions animate them (MapLibre
 * doesn't transition data-driven values).
 *
 * Order, bottom to top, after the ground layers: the veil (a background layer that fades the rest of
 * the map), the hover outlines (above the veil, so hovering still shows outside the slab), then the
 * extrusions. Every ground line is below the slabs, and the slabs are opaque, so nothing on the
 * ground shows through or across them; only the basemap's labels (above the app layers) are drawn
 * over them. The outline is a rim extruded on the slab top (edges.ts: EDGE_SOURCE), not a ground line.
 *
 * Colour follows eligibility: PNCT parishes and whole-PNCT concelhos in the PNCT colour, the rest in
 * a neutral slab; a partly-PNCT concelho is neutral with its PNCT parishes raised on top in the PNCT
 * colour (CONCELHO_PNCT_TOP). Hovering a parish inside a concelho slab pops it up (HOVER_POP).
 */
export const EDGE_SOURCE = "slab-edges";
export const HOVER_EDGE_SOURCE = "hover-edge";
export const CONCELHO_PNCT_TOP = "concelho-pnct-top";
export const CONCELHO_RIM = "concelho-rim";
export const CONCELHO_INNER_RIM = "concelho-inner-rim";
export const PARISH_RIM = "parish-rim";
export const HOVER_POP = "hover-pop";
export const HOVER_RIM = "hover-rim";
export const PARISH_HOVER_LINE = "parish-hover-line";
/**
 * The protected areas on the slab top (drill.ts setProtected): the selection's part of each overlay
 * that is on, from protected-slab.topo.json, as thin extrusions on the slab with their own rims.
 * The slab itself stays opaque; outside it the ground overlay shows under the veil as before.
 */
export const PROTECTED_SLAB_SOURCE = "slab-protected";
export const PROTECTED_EDGE_SOURCE = "slab-protected-edges";
export const protectedTop = (cat: string) => `slab-protected-${cat}`;
export const PROTECTED_RIM = "slab-protected-rim";
/** Categories drawn on the slab (protected_config.py ids). */
export const SLAB_CATEGORIES = ["rnap", "natura"] as const;
/** Share of the category colour mixed into the slab colour of its on-slab part. */
export const SLAB_TINT: Record<(typeof SLAB_CATEGORIES)[number], number> = { rnap: 0.16, natura: 0.2 };
/**
 * The paint of a category's on-slab part: the slab colour tinted towards the category's, then
 * brought back to the slab's own luminance (blended with black or white), so the labels over it keep
 * the slab's contrast (contrast.test.ts) and only the hue says "protected".
 */
export function slabTint(slab: string, cat: (typeof SLAB_CATEGORIES)[number], colors: MapPalette): string {
  const base = parseHex(slab);
  const tinted = over(parseHex(colors[cat]), SLAB_TINT[cat], base);
  const target = luminance(extrusionTop(base));
  const toward: [number, number, number] = luminance(extrusionTop(tinted)) > target ? [0, 0, 0] : [1, 1, 1];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const y = luminance(extrusionTop(over(toward, mid, tinted)));
    if (toward[0] === 0 ? y > target : y < target) lo = mid;
    else hi = mid;
  }
  return toHex(over(toward, hi, tinted));
}
export const CONCELHO_HOVER_LINE = "concelho-hover-line";

export interface Extrusion {
  code: string | null;
  /** Base and top of the slab, metres. */
  base: number;
  height: number;
  opacity: number;
}
export interface SlabState {
  concelho: Extrusion & { partial: boolean };
  parish: Extrusion;
  /** The hovered parish popping up from a concelho slab. */
  hover: Extrusion;
  /** 1 while the veil is up (a selection in 3D), else 0; its opacity is the palette's veilOpacity. */
  veil: number;
}
const NONE: Extrusion = { code: null, base: 0, height: 0, opacity: 0 };
export const NO_SLAB: SlabState = { concelho: { ...NONE, partial: false }, parish: { ...NONE }, hover: { ...NONE }, veil: 0 };

/** Height of the rim above the slab top it sits on, metres. */
export const rimLift = (height: number): number => Math.max(4, height * 0.06);
/** Height of the hover pop-up above the concelho slab, metres. */
export const popLift = (height: number): number => Math.max(25, height * 0.35);

/** Filter that keeps the feature whose `key` is `code`; with no code, nothing (an empty bucket). */
export const slabFilter = (key: "code" | "dicofre", code: string | null): ExpressionSpecification => ["==", ["get", key], code ?? ""];
/** The PNCT parishes of concelho `code` (none for null). */
export const pnctTopFilter = (code: string | null): ExpressionSpecification => ["all", ["==", ["slice", ["get", "dicofre"], 0, 4], code ?? "-"], isPnct];
/** Edge quads of one role ("concelho", "inner", "parish"). */
const edgeFilter = (role: string): ExpressionSpecification => ["==", ["get", "role"], role];

export function slabLayers(slab: SlabState, colors: MapPalette, filter: FilterState, level: number): LayerSpecification[] {
  const rims = rimHeights(slab);
  const extrusion = (id: string, source: string, filter: ExpressionSpecification, color: ExpressionSpecification | string, e: { base: number; height: number; opacity: number }): LayerSpecification => ({
    id,
    type: "fill-extrusion",
    source,
    filter,
    paint: {
      "fill-extrusion-color": color,
      "fill-extrusion-base": e.base,
      "fill-extrusion-height": e.height,
      "fill-extrusion-opacity": e.opacity,
      "fill-extrusion-vertical-gradient": true,
    },
  });
  const pnctColor = (yes: string, no: string): ExpressionSpecification => ["case", isPnct, yes, no];
  const c = slab.concelho;
  const p = slab.parish;
  const hv = slab.hover;
  return [
    { id: SLAB_VEIL, type: "background", paint: { "background-color": colors.veil, "background-opacity": slab.veil * colors.veilOpacity } },
    waterLine(colors),
    {
      id: PARISH_HOVER_LINE,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      paint: { "line-color": colors.highlight, "line-width": 1.8, "line-opacity": ["case", hovered, 1, 0] },
    },
    {
      id: CONCELHO_HOVER_LINE,
      type: "line",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: { "line-color": colors.highlight, "line-width": 1.8, "line-opacity": concelhoLevel(level, ["case", hovered, 1, 0]) },
    },
    extrusion(CONCELHO_SLAB, CONCELHO_SOURCE, slabFilter("code", c.code), ["case", allPnct, colors.slab, colors.slabNeutral], c),
    extrusion(CONCELHO_PNCT_TOP, PARISH_SOURCE, pnctTopFilter(c.partial ? c.code : null), colors.slab, rims[CONCELHO_PNCT_TOP]),
    extrusion(CONCELHO_INNER_RIM, EDGE_SOURCE, edgeFilter("inner"), pnctColor(colors.innerRim, colors.innerRimNeutral), rims[CONCELHO_INNER_RIM]),
    extrusion(CONCELHO_RIM, EDGE_SOURCE, edgeFilter("concelho"), pnctColor(colors.rim, colors.rimNeutral), rims[CONCELHO_RIM]),
    extrusion(PARISH_SLAB, PARISH_SOURCE, slabFilter("dicofre", p.code), pnctColor(colors.slab, colors.slabNeutral), p),
    extrusion(PARISH_RIM, EDGE_SOURCE, edgeFilter("parish"), pnctColor(colors.rim, colors.rimNeutral), rims[PARISH_RIM]),
    extrusion(HOVER_POP, PARISH_SOURCE, slabFilter("dicofre", hv.code), pnctColor(colors.pop, colors.popNeutral), hv),
    extrusion(HOVER_RIM, HOVER_EDGE_SOURCE, ["literal", true], pnctColor(colors.rim, colors.rimNeutral), rims[HOVER_RIM]),
    ...SLAB_CATEGORIES.map((cat) =>
      extrusion(protectedTop(cat), PROTECTED_SLAB_SOURCE, ["==", ["get", "cat"], cat], pnctColor(slabTint(colors.slab, cat, colors), slabTint(colors.slabNeutral, cat, colors)), rims[protectedTop(cat)]),
    ),
    extrusion(PROTECTED_RIM, PROTECTED_EDGE_SOURCE, ["literal", true], ["match", ["get", "cat"], "rnap", colors.rnap, colors.natura], rims[PROTECTED_RIM]),
  ];
}

/**
 * Rivers and streams, from the basemap's own vector tiles (OpenMapTiles `waterway`). The basemap
 * draws them below the app's fills, where the PNCT fill and the veil hide them, and Dark Matter's are
 * near-black on near-black. This copy sits above the fills and the veil, and below the slabs, so
 * no ground line crosses a slab (it is hidden under one like the land).
 */
export const WATER_LINE = "water-line";
function waterLine(colors: MapPalette): LayerSpecification {
  const width = (river: number, other: number): ExpressionSpecification => ["match", ["get", "class"], "river", river, other];
  return {
    id: WATER_LINE,
    type: "line",
    source: "openmaptiles",
    "source-layer": "waterway",
    minzoom: 8,
    filter: ["all", ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false], ["!=", ["get", "brunnel"], "tunnel"]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": colors.water, "line-width": ["interpolate", ["linear"], ["zoom"], 8, width(0.8, 0.3), 12, width(1.8, 0.9), 15, width(3, 1.6)] },
  };
}

/** Base/top paint of each rim and top layer for a state (drill.ts transitions them with the slabs). */
export function rimHeights(slab: SlabState): Record<string, { base: number; height: number; opacity: number }> {
  const c = slab.concelho;
  const p = slab.parish;
  const hv = slab.hover;
  // The rims are opaque while their slab is up.
  const solid = (o: number) => (o > 0 ? 1 : 0);
  // A partly-PNCT concelho's rims rise above its PNCT tops, which would otherwise cover them.
  const tops = c.partial ? 2 * rimLift(c.height) : 0;
  // The protected parts sit on the raised slab (the parish while it is up, else the concelho), above
  // its PNCT tops and below its rims; their own rim a little higher.
  const onParish = !!p.code && p.opacity > 0;
  const under = onParish ? { h: p.height, o: p.opacity, tops: 0 } : { h: c.height, o: c.opacity, tops };
  const lift = rimLift(under.h);
  // RNAP above Natura 2000 where they overlap (different heights: no z-fighting between the two).
  const step: Record<string, number> = { natura: 0.35, rnap: 0.5 };
  const protectedTops = Object.fromEntries(SLAB_CATEGORIES.map((cat) => [protectedTop(cat), { base: under.h, height: under.h + under.tops + step[cat] * lift, opacity: solid(under.o) }]));
  return {
    ...protectedTops,
    [PROTECTED_RIM]: { base: under.h, height: under.h + under.tops + 0.8 * lift, opacity: solid(under.o) },
    [CONCELHO_PNCT_TOP]: { base: c.height, height: c.height + 2 * rimLift(c.height), opacity: c.opacity },
    [CONCELHO_INNER_RIM]: { base: c.height, height: c.height + tops + rimLift(c.height), opacity: solid(c.opacity) },
    [CONCELHO_RIM]: { base: c.height, height: c.height + tops + rimLift(c.height), opacity: solid(c.opacity) },
    [PARISH_RIM]: { base: p.height, height: p.height + rimLift(p.height), opacity: solid(p.opacity) },
    [HOVER_RIM]: { base: hv.height, height: hv.height + rimLift(c.height), opacity: solid(hv.opacity) },
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** The app's map layers, bottom to top, for the current filter, level zoom, theme palette, overlays and 3D selection. */
export function appLayers(filter: FilterState, level: number, colors: MapPalette, overlays?: OverlayState, slab: SlabState = NO_SLAB): LayerSpecification[] {
  return [
    {
      id: CONCELHO_FILL,
      type: "fill",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: {
        "fill-color": ["case", selected, colors.selected, hasPnct, colors.pnct, colors.other],
        "fill-opacity": concelhoFillOpacity(filter, level, colors),
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
        "fill-opacity": parishFillOpacity(filter, level, colors),
      },
    },
    ...overlayLayers(overlays, filter.focus, level, colors),
    {
      id: PARISH_LINE,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      minzoom: 8,
      paint: {
        "line-color": colors.parishLine,
        "line-width": PARISH_LINE_WIDTH,
        "line-opacity": parishLineOpacity(filter, level, colors),
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
        "line-width": ["case", selected, SELECTED_WIDTH, hovered, 1.6, grouped, 1, 0],
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
        "line-width": ["case", selected, SELECTED_WIDTH, hovered, 1.8, 0],
        "line-opacity": concelhoHighlightOpacity(filter, level),
      },
    },
    ...slabLayers(slab, colors, filter, level),
    ...cityLayers(colors, level, filter.cities !== false, filter.seat ?? null),
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

/** Layers above the basemap's labels (cities.ts TOP): the rest go between the basemap and its labels. */
const isTop = (layer: LayerSpecification) => !!(layer.metadata as Record<string, unknown> | undefined)?.["pnct:top"];

/** Adds the sources and the map layers between the basemap and its labels (appLayerIndex). `level`: see concelhoLevel. */
export function addLayers(map: MapLibreMap, data: MapData, filter: FilterState, level: number, colors: MapPalette, slab: SlabState = NO_SLAB): void {
  map.addSource(PARISH_SOURCE, { type: "geojson", data: data.parishGeoJSON, maxzoom: 12 });
  map.addSource(CONCELHO_SOURCE, { type: "geojson", data: data.concelhoGeoJSON, maxzoom: 12 });
  // The slab edges (drill.ts fills them per selection); maxzoom 16, so the thin quads stay sharp.
  map.addSource(EDGE_SOURCE, { type: "geojson", data: EMPTY_FC, maxzoom: 16 });
  map.addSource(HOVER_EDGE_SOURCE, { type: "geojson", data: EMPTY_FC, maxzoom: 16 });
  map.addSource(PROTECTED_SLAB_SOURCE, { type: "geojson", data: EMPTY_FC, maxzoom: 14 });
  map.addSource(PROTECTED_EDGE_SOURCE, { type: "geojson", data: EMPTY_FC, maxzoom: 16 });
  map.addSource(CITY_SOURCE, { type: "geojson", data: EMPTY_FC });
  setPatternImages(map, colors);
  const basemap = map.getStyle().layers;
  const before = basemap[appLayerIndex(basemap)]?.id;
  for (const layer of appLayers(filter, level, colors, undefined, slab)) map.addLayer(layer, isTop(layer) ? undefined : before);
}

/**
 * Adds the overlay sources and layers (OverlayState.loaded) below the parish lines, as appLayers
 * orders them. `overlays.loaded` must already be true.
 */
export function addOverlays(map: MapLibreMap, data: OverlayData, overlays: OverlayState, filter: FilterState, level: number, colors: MapPalette): void {
  for (const cat of overlays.categories) {
    if (!map.getSource(overlaySource(cat))) map.addSource(overlaySource(cat), { type: "geojson", data: data[cat], maxzoom: 12 });
  }
  setPatternImages(map, colors);
  for (const layer of overlayLayers(overlays, filter.focus, level, colors)) if (!map.getLayer(layer.id)) map.addLayer(layer, PARISH_LINE);
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
  const top = layers.filter(isTop);
  const middle = layers.filter((l) => !isTop(l));
  return { ...next, sources, layers: [...next.layers.slice(0, split), ...middle, ...next.layers.slice(split), ...top] };
}

/** Recolours the pattern images (kept across a diffed style switch) or adds them (after a full style rebuild). */
export function setPatternImages(map: MapLibreMap, colors: MapPalette): void {
  for (const [id, image] of Object.entries(patternImages(colors))) {
    if (map.hasImage(id)) map.updateImage(id, image);
    else map.addImage(id, image, { pixelRatio: 2 });
  }
}

/** Labels the seat of concelho `dico` whatever it collides with (cities.ts); null: no selection. */
export function setSelectedSeat(map: MapLibreMap, dico: string | null): void {
  if (!map.getLayer(SEAT_LAYER) || !map.getLayer(SELECTED_SEAT_LAYER)) return;
  map.setFilter(SEAT_LAYER, seatFilter(dico));
  map.setFilter(SELECTED_SEAT_LAYER, selectedSeatFilter(dico));
}

/**
 * Re-applies filters and paint after a filter change or a new level zoom (viewport resize). The
 * overlays' zoom fade follows the level zoom, so it needs the palette for the RNAP tint.
 */
export function applyFilter(map: MapLibreMap, filter: FilterState, level: number, colors: MapPalette, overlayCategories: readonly string[] = []): void {
  for (const cat of overlayCategories) {
    if (!map.getLayer(overlayFill(cat))) continue;
    for (const id of [overlayFill(cat), overlayLine(cat)]) map.setFilter(id, parishFilter(filter.focus));
    map.setPaintProperty(overlayFill(cat), "fill-opacity", overlayFillOpacity(cat, level, colors));
    map.setPaintProperty(overlayLine(cat), "line-opacity", overlayLineOpacity(level));
  }
  for (const id of [PARISH_FILL, PARISH_LINE, PARISH_HIGHLIGHT, PARISH_HOVER_LINE]) map.setFilter(id, parishFilter(filter.focus));
  for (const id of [CONCELHO_FILL, CONCELHO_LINE, CONCELHO_HIGHLIGHT, CONCELHO_HOVER_LINE]) map.setFilter(id, concelhoFilter(filter.focus));
  map.setPaintProperty(CONCELHO_HOVER_LINE, "line-opacity", concelhoLevel(level, ["case", hovered, 1, 0]));
  map.setPaintProperty(PARISH_FILL, "fill-opacity", parishFillOpacity(filter, level, colors));
  map.setPaintProperty(CONCELHO_FILL, "fill-opacity", concelhoFillOpacity(filter, level, colors));
  map.setPaintProperty(CONCELHO_HATCH, "fill-opacity", hatchOpacity(filter, level));
  for (const id of [SEAT_LAYER, SELECTED_SEAT_LAYER, CAPITAL_LAYER]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", filter.cities === false ? "none" : "visible");
  setSelectedSeat(map, filter.seat ?? null);
  if (map.getLayer(SEAT_LAYER)) map.setLayerZoomRange(SEAT_LAYER, Math.max(0, level - SEAT_LEAD), 24);
  map.setPaintProperty(PARISH_LINE, "line-opacity", parishLineOpacity(filter, level, colors));
  map.setPaintProperty(CONCELHO_LINE, "line-opacity", lineOpacity(filter.district, 0.6, 0.2));
  map.setPaintProperty(CONCELHO_HIGHLIGHT, "line-opacity", concelhoHighlightOpacity(filter, level));
}
