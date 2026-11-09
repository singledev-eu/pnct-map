/**
 * Concelho seats and district capitals (web/data/cities.json, scripts/build_cities.py: the
 * admin_centre of each municipality in OpenStreetMap, ODbL, matched to CAOP). The 18 district
 * capitals show from the country view, every seat from about the concelho level, as a dot and a
 * label above everything else on the map (slabs and basemap labels included), so the nearest towns
 * stay in view when zoomed into a parish. Names are as the places are called; never translated.
 */
import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { formatNumber, ui } from "./strings";
import CITIES_URL from "../data/cities.json?url";
import { cachedJson } from "./protected";
import type { MapPalette } from "./theme";

export const CITY_SOURCE = "cities";
export const CAPITAL_LAYER = "city-capitals";
export const SEAT_LAYER = "city-seats";
/** The seat of the selected concelho: always drawn (cityLayers). */
export const SELECTED_SEAT_LAYER = "city-selected";
export const CAPITAL_DOT = "city-dot-capital";
export const SEAT_DOT = "city-dot-seat";
/** Seats appear this many zoom levels before the parish level (CameraLimits.levelZoom). */
export const SEAT_LEAD = 1.5;
/** Layer metadata that puts a layer above the basemap's labels (layers.ts withAppLayers/addLayers). */
export const TOP = { "pnct:top": true };

export type CitiesData = GeoJSON.FeatureCollection<GeoJSON.Point, { name: string; dico: string; capital: boolean }>;
export const loadCities = cachedJson<CitiesData>(CITIES_URL);

/** The dot icons, RGBA at pixelRatio 2: a filled disc in the text colour with a halo ring. */
export function cityDots(colors: MapPalette): Record<string, { width: number; height: number; data: Uint8Array }> {
  const [text, halo] = [colors.city, colors.cityHalo];
  const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  const disc = (size: number, ring: number) => {
    const data = new Uint8Array(size * size * 4);
    const r = size / 2;
    const [t, hl] = [hex(text), hex(halo)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
        const a = Math.max(0, Math.min(1, r - d)); // anti-aliased edge
        if (!a) continue;
        const c = d < r - ring ? t : hl;
        data.set([...c, Math.round(a * 255)], (y * size + x) * 4);
      }
    return { width: size, height: size, data };
  };
  return { [CAPITAL_DOT]: disc(18, 3.5), [SEAT_DOT]: disc(12, 3) };
}

const capital: ExpressionSpecification = ["==", ["get", "capital"], true];

/** The seat of concelho `dico` (none for null). */
const seatOf = (dico: string | null): ExpressionSpecification => ["==", ["get", "dico"], dico ?? ""];

/**
 * The symbol layers; `level` is the parish level zoom, `visible` the legend toggle, `selected` the
 * concelho of the current selection.
 *
 * Labels never overlap. A seat is drawn whole (dot and name) or not at all, with clearance around
 * its name (SEAT_PADDING), so where seats crowd at mid zoom only some show and the rest appear
 * as the zoom makes room. MapLibre places the top layer first, so the order is the priority:
 * district capitals (always drawn), then the selected concelho's seat (always drawn, so the town
 * that places the selection never drops out), then the other seats. cities.json has no size or
 * population, so among those the placement order decides, not the town's size.
 */
export function cityLayers(colors: MapPalette, level: number, visible: boolean, selected: string | null = null): LayerSpecification[] {
  const [text, halo] = [colors.city, colors.cityHalo];
  const layer = (id: string, filter: ExpressionSpecification, dot: string, size: number, bold: boolean, minzoom: number, always: boolean, padding: number | ExpressionSpecification): LayerSpecification => ({
    id,
    type: "symbol",
    source: CITY_SOURCE,
    filter,
    minzoom,
    metadata: TOP,
    layout: {
      visibility: visible ? "visible" : "none",
      "icon-image": dot,
      "icon-allow-overlap": always,
      "icon-padding": padding,
      "text-field": ["get", "name"],
      "text-font": [bold ? "Noto Sans Bold" : "Noto Sans Regular"], // the basemap's glyphs (OpenFreeMap)
      "text-size": size,
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 0.6,
      "text-justify": "auto",
      "text-optional": always,
      "text-padding": 3,
      "text-max-width": 9,
    },
    paint: { "text-color": text, "text-halo-color": halo, "text-halo-width": 1.6, "text-halo-blur": 0.2 },
  });
  return [
    layer(SEAT_LAYER, seatFilter(selected), SEAT_DOT, 12, false, Math.max(0, level - SEAT_LEAD), false, SEAT_PADDING),
    layer(SELECTED_SEAT_LAYER, selectedSeatFilter(selected), SEAT_DOT, 12, false, 0, true, SEAT_PADDING),
    // Last, so on top: capitals are placed first and win label collisions.
    layer(CAPITAL_LAYER, capital, CAPITAL_DOT, 14, true, 0, true, 2),
  ];
}

/**
 * Clearance around a seat's dot, px: no other seat's dot or name is placed within it. Wide at mid
 * zoom (7–9), where the seats crowd, and tighter closer in, so more of them appear as you zoom.
 * On the dot rather than the name: MapLibre moves a variable-anchor name away from its dot by the
 * name's padding, which would detach the two.
 */
export const SEAT_PADDING: ExpressionSpecification = ["interpolate", ["linear"], ["zoom"], 7, 20, 10, 2];
/** The seats that thin out by collision: every non-capital seat but the selection's. */
export const seatFilter = (selected: string | null): ExpressionSpecification => ["all", ["!", capital], ["!", seatOf(selected)]];
/** The selection's seat, unless it is a capital (the capitals layer draws those). */
export const selectedSeatFilter = (selected: string | null): ExpressionSpecification => ["all", ["!", capital], seatOf(selected)];

export const CITIES_STORAGE_KEY = "pnct-map:cities";

/** The legend toggle: on unless switched off (kept in localStorage; on when storage is unavailable). */
export function loadCitiesPref(storage: () => Storage = () => window.localStorage): boolean {
  try {
    return storage().getItem(CITIES_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveCitiesPref(on: boolean, storage: () => Storage = () => window.localStorage): void {
  try {
    if (on) storage().removeItem(CITIES_STORAGE_KEY);
    else storage().setItem(CITIES_STORAGE_KEY, "off");
  } catch {
    // Without storage the choice lasts for this page only.
  }
}

// ---- edge pointers ---------------------------------------------------------------------------
// Fitted to a parish, the map often leaves out the very towns that place it (Erra: Coruche, its
// seat, and Santarém, the district capital). While something is selected, those two get a pointer at
// the edge of the visible area when they are off it: an arrow towards the town, its name and the
// distance from the selection. In view, the map label takes over.

type Padding = { top: number; right: number; bottom: number; left: number };
type Point = [number, number];

const EARTH_KM = 6371.0088;
export function distanceKm(a: Point, b: Point): number {
  const r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r;
  const dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** The seat of concelho `dico` and the district capital nearest to `from` (the same town for a capital's concelho: once). */
export function contextTowns(data: CitiesData, dico: string, from: Point): { name: string; at: Point }[] {
  const seat = data.features.find((f) => f.properties.dico === dico);
  const capitals = data.features.filter((f) => f.properties.capital);
  const nearest = capitals.reduce((best, f) => (distanceKm(from, f.geometry.coordinates as Point) < distanceKm(from, best.geometry.coordinates as Point) ? f : best), capitals[0]);
  return [seat, nearest].filter((f, i, all) => f && all.indexOf(f) === i).map((f) => ({ name: f!.properties.name, at: f!.geometry.coordinates as Point }));
}

/**
 * Where a pointer to screen point `p` goes: on the edge of the rectangle `box` (inset by `margin`),
 * on the line from the box centre to `p`; null when `p` is inside the box. `angle` in degrees, 0 = east.
 */
export function edgeSpot(p: Point, box: { x0: number; y0: number; x1: number; y1: number }, margin: number): { x: number; y: number; angle: number } | null {
  if (p[0] >= box.x0 && p[0] <= box.x1 && p[1] >= box.y0 && p[1] <= box.y1) return null;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const dx = p[0] - cx;
  const dy = p[1] - cy;
  const hw = (box.x1 - box.x0) / 2 - margin;
  const hh = (box.y1 - box.y0) / 2 - margin;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

/**
 * Mounts the pointers on the map container. `target()` gives the selection (its concelho and its
 * centre) or null; `padding()` the area the toolbar and panel cover; `enabled()` the legend toggle;
 * `occluders()` other boxes over the map (the legend), in map-container pixels.
 * Returns `update`, to call after a selection change (camera moves update it by themselves).
 */
export function mountCityPointers(
  map: MapLibreMap,
  data: () => CitiesData | null,
  target: () => { dico: string; centre: Point } | null,
  padding: () => Padding,
  enabled: () => boolean,
  occluders: () => DOMRect[] = () => [],
): () => void {
  const layer = document.createElement("div");
  layer.className = "city-pointers";
  map.getContainer().append(layer);
  const update = () => {
    const d = data();
    const t = target();
    if (!d || !t || !enabled()) return layer.replaceChildren();
    const c = map.getContainer();
    const pad = padding();
    const box = { x0: pad.left, y0: pad.top, x1: c.clientWidth - pad.right, y1: c.clientHeight - pad.bottom };
    const pills: HTMLElement[] = [];
    for (const town of contextTowns(d, t.dico, t.centre)) {
      const p = map.project(town.at);
      // A town, or its pointer, under a panel over the map (the legend): the pointer goes just above
      // that panel, which then counts as off the visible area.
      const hit = (x: number, y: number) => occluders().find((r) => x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8);
      let spot = edgeSpot([p.x, p.y], box, 14);
      const under = hit(p.x, p.y) ?? (spot ? hit(spot.x, spot.y) : undefined);
      if (under) spot = edgeSpot([p.x, p.y], { ...box, y1: Math.min(box.y1, under.top - 4) }, 14);
      if (!spot) continue;
      const km = formatNumber(Math.round(distanceKm(t.centre, town.at)));
      const pill = document.createElement("div");
      pill.className = "city-pointer";
      pill.dataset.testid = "city-pointer";
      pill.setAttribute("role", "img");
      pill.setAttribute("aria-label", ui.cityPointer(town.name, km));
      const arrow = document.createElement("span");
      arrow.className = "city-pointer-arrow";
      arrow.textContent = "→";
      arrow.style.transform = `rotate(${spot.angle}deg)`;
      const label = document.createElement("span");
      label.textContent = `${town.name} · ${km} km`;
      pill.append(arrow, label);
      // Anchored by the side facing the town, so the pill stays inside the box.
      pill.style.left = `${spot.x}px`;
      pill.style.top = `${spot.y}px`;
      const ax = Math.cos((spot.angle * Math.PI) / 180);
      const ay = Math.sin((spot.angle * Math.PI) / 180);
      pill.style.transform = `translate(${-50 - 50 * ax}%, ${-50 - 50 * ay}%)`;
      pills.push(pill);
    }
    layer.replaceChildren(...pills);
  };
  map.on("move", update);
  map.on("resize", update);
  return update;
}
