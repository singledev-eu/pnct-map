/**
 * Relief (prototype, night task 05): real elevations from Mapterhorn's terrain tiles, as hillshade
 * (works on the flat map too) and MapLibre terrain (setTerrain). It is a separate mode from the 3D
 * slabs: with relief on, the selection is drawn draped on the ground (its fill and outline follow the
 * relief) and the slab, rims and veil are off (main.ts slabTarget).
 *
 * Source: Mapterhorn (https://mapterhorn.com, free, no key). Over mainland Portugal it is built from
 * DGT's LiDAR DEM (CC BY 4.0, 0.5 m) and Copernicus GLO-30 elsewhere. Terrarium encoding, 512 px
 * WebP tiles, z0–17 over Portugal. Fallback: AWS Terrain Tiles (Terrarium PNG, 256 px, z0–15). The
 * encoding must be set: MapLibre's default ("mapbox") silently decodes Terrarium into wrong heights.
 *
 * A viewer setting (off by default), kept in localStorage. For review, ?relief=1|1.5|2 turns it on
 * with that exaggeration and ?dem=aws switches to the fallback.
 */
import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl";

export const RELIEF_STORAGE_KEY = "pnct-map:relief";
export const TERRAIN_SOURCE = "terrain-dem";
export const HILLSHADE_SOURCE = "hillshade-dem";
export const HILLSHADE_LAYER = "hillshade";
/** Default vertical exaggeration: Portugal's relief is modest at the zooms a parish is fitted to. */
export const EXAGGERATION = 1.5;

export const DEM: Record<"mapterhorn" | "aws", RasterDEMSourceSpecification> = {
  mapterhorn: {
    type: "raster-dem",
    tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
    tileSize: 512,
    maxzoom: 14, // Portugal goes to 17 (LiDAR); 14 keeps the tile count down at parish zooms
    encoding: "terrarium",
    attribution: '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noopener noreferrer">© Mapterhorn</a> (DGT LiDAR CC BY 4.0 · GLO-30 © Copernicus)',
  },
  aws: {
    type: "raster-dem",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 15,
    encoding: "terrarium",
    attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener noreferrer">© Mapzen, AWS terrain-tiles</a>',
  },
};

export interface ReliefSettings {
  on: boolean;
  exaggeration: number;
  dem: keyof typeof DEM;
}

/** The setting: ?relief=<exaggeration> (on) / ?relief=0 (off) and ?dem=aws override the saved choice. */
export function loadRelief(search = location.search, storage: () => Storage = () => window.localStorage): ReliefSettings {
  const q = new URLSearchParams(search);
  const dem = q.get("dem") === "aws" ? "aws" : "mapterhorn";
  const forced = q.get("relief");
  if (forced !== null) {
    const x = Number(forced);
    return { on: x > 0, exaggeration: x > 0 && x <= 3 ? x : EXAGGERATION, dem };
  }
  let on = false;
  try {
    on = storage().getItem(RELIEF_STORAGE_KEY) === "on";
  } catch {
    // Storage may be unavailable (private mode, blocked).
  }
  return { on, exaggeration: EXAGGERATION, dem };
}

export function saveRelief(on: boolean, storage: () => Storage = () => window.localStorage): void {
  try {
    if (on) storage().setItem(RELIEF_STORAGE_KEY, "on");
    else storage().removeItem(RELIEF_STORAGE_KEY);
  } catch {
    // Without storage the choice lasts for this page only.
  }
}

/**
 * Applies the setting to the current style: adds or removes the DEM sources, the hillshade (under
 * the app's fills, `before`) and the terrain. Safe to call again after a style switch.
 */
export function applyRelief(map: MapLibreMap, r: ReliefSettings, before: string | undefined, dark: boolean): void {
  if (!r.on) {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
    for (const id of [TERRAIN_SOURCE, HILLSHADE_SOURCE]) if (map.getSource(id)) map.removeSource(id);
    return;
  }
  // Two sources over the same tiles, as MapLibre recommends: terrain and hillshade tile differently.
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, DEM[r.dem]);
  if (!map.getSource(HILLSHADE_SOURCE)) {
    const { attribution: _credited, ...hillshade } = DEM[r.dem]; // credited once, by the terrain source
    map.addSource(HILLSHADE_SOURCE, hillshade);
  }
  const paint = dark
    ? { "hillshade-shadow-color": "#000000", "hillshade-highlight-color": "#3a3a3a", "hillshade-accent-color": "#000000", "hillshade-exaggeration": 0.5 }
    : { "hillshade-shadow-color": "#5a5a52", "hillshade-highlight-color": "#ffffff", "hillshade-accent-color": "#5a5a52", "hillshade-exaggeration": 0.35 };
  if (map.getLayer(HILLSHADE_LAYER)) {
    for (const [k, v] of Object.entries(paint)) map.setPaintProperty(HILLSHADE_LAYER, k as never, v as never);
  } else {
    map.addLayer({ id: HILLSHADE_LAYER, type: "hillshade", source: HILLSHADE_SOURCE, paint }, before && map.getLayer(before) ? before : undefined);
  }
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: r.exaggeration });
}
