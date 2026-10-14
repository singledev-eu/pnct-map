import type { Bounds } from "./data";

/**
 * Camera limits and zoom levels, computed from the viewport size (pure Web Mercator maths, so it is
 * unit-tested without a map). MapLibre's world is TILE_SIZE · 2^zoom pixels wide.
 */
export const MAINLAND: Bounds = [-9.53, 36.95, -6.18, 42.16];
const TILE_SIZE = 512;
/** Concelho level below minZoom + LEVEL_OFFSET: 4× the country-fit scale, about one district on screen. */
export const LEVEL_OFFSET = 2;
/**
 * Margin around maxBounds in degrees, faded in with zoom by constrainView: 0 at minZoom (the
 * camera is pinned to the country view there) up to the full margin from the parish level
 * (minZoom + LEVEL_OFFSET), where selection fits need room for the side panel or the bottom sheet.
 */
export const BOUNDS_MARGIN = 1.5;
/** Half-width of the zoom band in which the concelho and parish fills cross-fade. */
export const FADE = 0.25;

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Size {
  width: number;
  height: number;
}

/** Mercator x/y in world units (0..1, y grows southwards). */
const mercX = (lng: number) => (lng + 180) / 360;
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2;
const lngOf = (x: number) => x * 360 - 180;
const latOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp((1 - 2 * y) * Math.PI)) - 90;

/** Zoom at which `b` just fits the padded viewport (what map.fitBounds would pick). */
export function fitZoom(b: Bounds, size: Size, pad: Padding): number {
  const w = Math.max(1, size.width - pad.left - pad.right);
  const h = Math.max(1, size.height - pad.top - pad.bottom);
  const dx = mercX(b[2]) - mercX(b[0]);
  const dy = mercY(b[1]) - mercY(b[3]);
  return Math.log2(Math.min(w / dx, h / dy) / TILE_SIZE);
}

/** Map centre that puts the centre of `b` in the middle of the padded area at `zoom`. */
export function fitCenter(b: Bounds, zoom: number, pad: Padding): [number, number] {
  const world = TILE_SIZE * 2 ** zoom;
  const x = (mercX(b[0]) + mercX(b[2])) / 2 - (pad.left - pad.right) / 2 / world;
  const y = (mercY(b[1]) + mercY(b[3])) / 2 - (pad.top - pad.bottom) / 2 / world;
  return [lngOf(x), latOf(y)];
}

/** Visible area of a map of `size` centred on `center` at `zoom`. */
function viewBounds(center: [number, number], zoom: number, size: Size): Bounds {
  const world = TILE_SIZE * 2 ** zoom;
  const [cx, cy] = [mercX(center[0]), mercY(center[1])];
  const [hw, hh] = [size.width / 2 / world, size.height / 2 / world];
  return [lngOf(cx - hw), latOf(cy + hh), lngOf(cx + hw), latOf(cy - hh)];
}

export interface CameraLimits {
  minZoom: number;
  maxBounds: Bounds;
  /** Below this zoom the map is at concelho level. */
  levelZoom: number;
}

/**
 * minZoom: mainland just fits with the app's fit padding (toolbar, legend).
 * maxBounds (MapLibre keeps the *viewport* inside it): exactly the view at minZoom. So the only
 * camera at minZoom is the country view, and zooming out from anywhere ends there.
 *   - On the axis that limits the fit (height on most screens), a margin left slack: a zoom-out
 *     anchored on the Algarve ended ~1.2° south, with the north of the Minho cut off.
 *   - On the other axis, wide screens already had this (the margin was widened to the view, or
 *     MapLibre would zoom in past minZoom). On phones, mainland ± 1.5° was wider than the ~4° view,
 *     so it left ±1.2° of sideways slack at minZoom.
 * constrainView widens it by BOUNDS_MARGIN as the zoom rises, so zoomed-in selection fits keep
 * their room, and CENTER_BOX keeps the centre close to mainland.
 */
export function cameraLimits(size: Size, pad: Padding): CameraLimits {
  const minZoom = fitZoom(MAINLAND, size, pad);
  const maxBounds = viewBounds(fitCenter(MAINLAND, minZoom, pad), minZoom, size);
  return { minZoom, maxBounds, levelZoom: minZoom + LEVEL_OFFSET };
}

/**
 * Margin around mainland for the camera *centre*, in degrees. maxBounds only keeps the viewport
 * inside the min-zoom view, which at high zoom still lets the centre wander far beyond mainland. 0.25° (~25 km) still centres Sagres, the Minho and the border parishes, and keeps
 * the off-centre fits (the panel on desktop, the bottom sheet on phones) of edge concelhos.
 */
export const CENTER_MARGIN = 0.25;
export const CENTER_BOX: Bounds = [
  MAINLAND[0] - CENTER_MARGIN,
  MAINLAND[1] - CENTER_MARGIN,
  MAINLAND[2] + CENTER_MARGIN,
  MAINLAND[3] + CENTER_MARGIN,
];

/** The point of `box` nearest to `center`, per axis (lng/lat are monotonic in Mercator, so this is also the nearest on screen axes). */
export function clampCenter([lng, lat]: [number, number], box: Bounds = CENTER_BOX): [number, number] {
  return [Math.min(box[2], Math.max(box[0], lng)), Math.min(box[3], Math.max(box[1], lat))];
}

export interface ViewLimits {
  size: Size;
  minZoom: number;
  maxZoom: number;
  /** maxBounds (the min-zoom view): the viewport stays inside it, widened by boundsMargin(zoom). */
  maxBounds: Bounds;
  /** Full widening in degrees, reached at minZoom + LEVEL_OFFSET (0 at minZoom). */
  boundsMargin: number;
  /** The camera centre stays inside it. */
  centerBox: Bounds;
}

/**
 * Camera constrain for MapLibre's transformConstrain hook, which replaces the built-in one, so this
 * also does its job: clamp the zoom, then keep the viewport inside maxBounds (the same rule as
 * MapLibre's default, with maxBounds widened by a margin that fades in with zoom, so the
 * allowed area shrinks smoothly to exactly the country view while zooming out), then keep the
 * centre inside centerBox. Per-axis clamping keeps the viewport
 * rule satisfied, because both ranges contain the country-view centre. If the viewport is wider than
 * maxBounds (only for a moment, while a resize hasn't recomputed the limits yet), it is centred on
 * them; MapLibre would zoom in instead.
 */
export function constrainView(center: [number, number], zoom: number, limits: ViewLimits): { center: [number, number]; zoom: number } {
  const z = Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom));
  const world = TILE_SIZE * 2 ** z;
  const m = limits.boundsMargin * Math.min(1, Math.max(0, (z - limits.minZoom) / LEVEL_OFFSET));
  const b: Bounds = [limits.maxBounds[0] - m, limits.maxBounds[1] - m, limits.maxBounds[2] + m, limits.maxBounds[3] + m];
  const fit = (v: number, lo: number, hi: number, half: number) => (hi - lo < 2 * half ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, v)));
  const x = fit(mercX(center[0]), mercX(b[0]), mercX(b[2]), limits.size.width / 2 / world);
  const y = fit(mercY(center[1]), mercY(b[3]), mercY(b[1]), limits.size.height / 2 / world);
  return { center: clampCenter([lngOf(x), latOf(y)], limits.centerBox), zoom: z };
}
