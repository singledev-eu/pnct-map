import type { Bounds } from "./data";

/**
 * Camera limits and zoom levels, computed from the viewport size (pure Web Mercator maths, so it is
 * unit-tested without a map). MapLibre's world is TILE_SIZE · 2^zoom pixels wide.
 */
export const MAINLAND: Bounds = [-9.53, 36.95, -6.18, 42.16];
const TILE_SIZE = 512;
/** maxBounds margin around mainland, in degrees. */
export const BOUNDS_MARGIN = 1.5;
/** Concelho level below minZoom + LEVEL_OFFSET: 4× the country-fit scale, about one district on screen. */
export const LEVEL_OFFSET = 2;
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
 * minZoom: mainland just fits with the app's fit padding (toolbar, legend). maxBounds: mainland plus
 * BOUNDS_MARGIN, widened to the whole viewport at minZoom. MapLibre keeps the *viewport* inside
 * maxBounds and zooms in when it can't, so on a wide screen a plain margin would override minZoom.
 */
export function cameraLimits(size: Size, pad: Padding): CameraLimits {
  const minZoom = fitZoom(MAINLAND, size, pad);
  const view = viewBounds(fitCenter(MAINLAND, minZoom, pad), minZoom, size);
  const m = BOUNDS_MARGIN;
  const maxBounds: Bounds = [
    Math.min(MAINLAND[0] - m, view[0]),
    Math.min(MAINLAND[1] - m, view[1]),
    Math.max(MAINLAND[2] + m, view[2]),
    Math.max(MAINLAND[3] + m, view[3]),
  ];
  return { minZoom, maxBounds, levelZoom: minZoom + LEVEL_OFFSET };
}
