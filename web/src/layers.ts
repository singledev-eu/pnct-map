import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { MapData } from "./data";

export const PARISH_SOURCE = "parishes";
export const CONCELHO_SOURCE = "concelhos";
export const PARISH_FILL = "parish-fill";
const PARISH_LINE = "parish-line";
const PARISH_HIGHLIGHT = "parish-highlight";
const CONCELHO_LINE = "concelho-line";

export const COLORS = {
  pnct: "#0f8a7e",
  other: "#64748b",
  selected: "#0b3d39",
  parishLine: "#5b6b73",
  concelhoLine: "#2f3b42",
};

export interface FilterState {
  district: string | null;
  /** Focus mode ("Only PNCT"): hide everything outside PNCT territory. */
  focus: boolean;
}

const isPnct: ExpressionSpecification = ["==", ["get", "pnct"], true];
// Concelhos with at least one PNCT parish (their whole outline is kept in focus mode).
const hasPnct: ExpressionSpecification = [">", ["get", "pnct_count"], 0];
const hovered: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
const selected: ExpressionSpecification = ["boolean", ["feature-state", "selected"], false];
// Member of the selected concelho.
const grouped: ExpressionSpecification = ["boolean", ["feature-state", "group"], false];

function inDistrict(district: string | null): ExpressionSpecification {
  return district ? ["==", ["get", "distrito"], district] : ["literal", true];
}

function fillOpacity({ district }: FilterState): ExpressionSpecification {
  return [
    "case",
    selected, 0.85,
    ["!", inDistrict(district)], ["case", isPnct, 0.12, 0],
    hovered, ["case", isPnct, 0.72, 0.22],
    grouped, ["case", isPnct, 0.68, 0.12],
    isPnct, 0.5,
    0.035,
  ];
}

function lineOpacity(district: string | null, inside: number, outside: number): ExpressionSpecification {
  return ["case", inDistrict(district), inside, outside];
}

/** Adds sources and the four map layers below the basemap's first label layer. */
/** Layer filters for focus mode: features outside PNCT territory are dropped, so they are neither drawn nor hit-tested. */
function parishFilter(focus: boolean): ExpressionSpecification | null {
  return focus ? isPnct : null;
}
function concelhoFilter(focus: boolean): ExpressionSpecification | null {
  return focus ? hasPnct : null;
}

// addLayer rejects an explicit `filter: undefined`, so only pass the key when there is a filter.
const withFilter = (filter: ExpressionSpecification | null) => (filter ? { filter } : {});

export function addLayers(map: MapLibreMap, data: MapData, filter: FilterState): void {
  map.addSource(PARISH_SOURCE, { type: "geojson", data: data.parishGeoJSON, maxzoom: 12 });
  map.addSource(CONCELHO_SOURCE, { type: "geojson", data: data.concelhoGeoJSON, maxzoom: 12 });

  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

  map.addLayer(
    {
      id: PARISH_FILL,
      type: "fill",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      paint: {
        "fill-color": ["case", selected, COLORS.selected, isPnct, COLORS.pnct, COLORS.other],
        "fill-opacity": fillOpacity(filter),
      },
    },
    firstSymbol,
  );
  map.addLayer(
    {
      id: PARISH_LINE,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      minzoom: 8,
      paint: {
        "line-color": COLORS.parishLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.3, 12, 0.8],
        "line-opacity": lineOpacity(filter.district, 0.45, 0.15),
      },
    },
    firstSymbol,
  );
  map.addLayer(
    {
      id: CONCELHO_LINE,
      type: "line",
      source: CONCELHO_SOURCE,
      ...withFilter(concelhoFilter(filter.focus)),
      paint: {
        "line-color": COLORS.concelhoLine,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 9, 1.1, 12, 1.8],
        "line-opacity": lineOpacity(filter.district, 0.6, 0.2),
      },
    },
    firstSymbol,
  );
  map.addLayer(
    {
      id: PARISH_HIGHLIGHT,
      type: "line",
      source: PARISH_SOURCE,
      ...withFilter(parishFilter(filter.focus)),
      paint: {
        "line-color": COLORS.selected,
        "line-width": ["case", selected, 2.2, hovered, 1.6, grouped, 1, 0],
        "line-opacity": ["case", ["any", selected, hovered], 1, grouped, 0.7, 0],
      },
    },
    firstSymbol,
  );
}

export function applyFilter(map: MapLibreMap, filter: FilterState): void {
  for (const id of [PARISH_FILL, PARISH_LINE, PARISH_HIGHLIGHT]) map.setFilter(id, parishFilter(filter.focus));
  map.setFilter(CONCELHO_LINE, concelhoFilter(filter.focus));
  map.setPaintProperty(PARISH_FILL, "fill-opacity", fillOpacity(filter));
  map.setPaintProperty(PARISH_LINE, "line-opacity", lineOpacity(filter.district, 0.45, 0.15));
  map.setPaintProperty(CONCELHO_LINE, "line-opacity", lineOpacity(filter.district, 0.6, 0.2));
}
