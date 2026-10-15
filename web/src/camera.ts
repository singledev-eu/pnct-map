import type { Bounds } from "./data";
import outlineJson from "../data/outline.json";

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
 * their room, and OUTLINE keeps the centre of the visible area over mainland.
 */
export function cameraLimits(size: Size, pad: Padding): CameraLimits {
  const minZoom = fitZoom(MAINLAND, size, pad);
  const maxBounds = viewBounds(fitCenter(MAINLAND, minZoom, pad), minZoom, size);
  return { minZoom, maxBounds, levelZoom: minZoom + LEVEL_OFFSET };
}

/**
 * The camera outline: mainland Portugal buffered by ~2 km along the Spanish border and ~20 km at sea,
 * simplified to < 200 vertices (scripts/build_outline.py, from CAOP). The centre of the *visible area*
 * (the map minus the toolbar and the side panel or bottom sheet) stays inside it at every zoom, so a
 * pan can't wander into Spain or out to sea, while every border town and cape can still be centred.
 */
export const OUTLINE = outlineJson.ring as [number, number][];
/** OUTLINE in Mercator world units. */
export const OUTLINE_MERC: Point[] = OUTLINE.map(([lng, lat]) => [mercX(lng), mercY(lat)]);

type Point = [number, number];

/** Even-odd point-in-polygon test for a closed ring (first vertex not repeated). */
export function insideRing([x, y]: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The point of the ring's boundary nearest to `p`. */
export function nearestOnRing([x, y]: Point, ring: Point[]): Point {
  let best: Point = ring[0];
  let bestD = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [dx, dy] = [ring[i][0] - ax, ring[i][1] - ay];
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
    const [px, py] = [ax + t * dx, ay + t * dy];
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) [best, bestD] = [[px, py], d];
  }
  return best;
}

/**
 * Screen offset (CSS px, x right, y down) from the centre of the visible area to the map centre, for
 * the fit padding in use: what fitCenter adds, so a selection fit puts its feature's centre there.
 */
export const paddingOffset = (pad: Padding): { x: number; y: number } => ({ x: (pad.right - pad.left) / 2, y: (pad.bottom - pad.top) / 2 });

export interface ViewLimits {
  size: Size;
  minZoom: number;
  maxZoom: number;
  /** maxBounds (the min-zoom view): the viewport stays inside it, widened by boundsMargin(zoom). */
  maxBounds: Bounds;
  /** Full widening in degrees, reached at minZoom + LEVEL_OFFSET (0 at minZoom). */
  boundsMargin: number;
  /** The centre of the visible area stays inside it (Mercator ring, OUTLINE_MERC). */
  outline: Point[];
  /** paddingOffset of the current fit padding (the panel or sheet, when open, is part of it). */
  offset: { x: number; y: number };
}

/**
 * The part of a ring inside an axis-aligned box [x0, y0, x1, y1] (Sutherland–Hodgman: exact for a
 * convex clip region; separate pieces of a concave ring come back joined along the box edge).
 */
export function clipRing(ring: Point[], [x0, y0, x1, y1]: [number, number, number, number]): Point[] {
  const edges: [(p: Point) => boolean, (a: Point, b: Point) => Point][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = ring;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const [prev, cur] = [input[(i + input.length - 1) % input.length], input[i]];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
  }
  return out;
}

/**
 * Camera constrain for MapLibre's transformConstrain hook, which replaces the built-in one, so this
 * also does its job:
 *   1. clamp the zoom;
 *   2. keep the viewport inside maxBounds (MapLibre's default rule, with maxBounds widened by a margin
 *      that fades in with zoom, so the allowed area shrinks smoothly to exactly the country view while
 *      zooming out). That leaves a box of allowed centres. If the viewport is wider than maxBounds
 *      (at min zoom, or for a moment while a resize hasn't recomputed the limits), the box is a line
 *      or a point, and this rule alone decides; MapLibre would zoom in instead;
 *   3. keep the centre of the visible area inside the outline, within that box: outside, move it to
 *      the nearest point of the outline clipped to the box (in Mercator, so the nearest on screen).
 *      If they don't overlap (only near min zoom with the panel open), the box alone decides.
 * The result is a projection onto one fixed region per zoom, so constraining it again doesn't move
 * it: a drag or an inertia frame never creeps or jitters. At min zoom the box is the country view.
 */
export function constrainView(center: [number, number], zoom: number, limits: ViewLimits): { center: [number, number]; zoom: number } {
  const z = Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom));
  const world = TILE_SIZE * 2 ** z;
  const m = limits.boundsMargin * Math.min(1, Math.max(0, (z - limits.minZoom) / LEVEL_OFFSET));
  const b: Bounds = [limits.maxBounds[0] - m, limits.maxBounds[1] - m, limits.maxBounds[2] + m, limits.maxBounds[3] + m];
  // Allowed map centres along one axis: [lo + half, hi - half], or the middle if the view is wider.
  const range = (lo: number, hi: number, half: number): [number, number] => (hi - lo < 2 * half ? [(lo + hi) / 2, (lo + hi) / 2] : [lo + half, hi - half]);
  const [x0, x1] = range(mercX(b[0]), mercX(b[2]), limits.size.width / 2 / world);
  const [y0, y1] = range(mercY(b[3]), mercY(b[1]), limits.size.height / 2 / world);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const boxed: Point = [clamp(mercX(center[0]), x0, x1), clamp(mercY(center[1]), y0, y1)];
  const done = (p: Point) => ({ center: [lngOf(p[0]), latOf(p[1])] as [number, number], zoom: z });
  if (x0 === x1 || y0 === y1) return done(boxed);

  // Rule 3 in visible-area coordinates: the map centre minus the padding offset.
  const [ox, oy] = [limits.offset.x / world, limits.offset.y / world];
  const area = clipRing(limits.outline, [x0 - ox, y0 - oy, x1 - ox, y1 - oy]);
  if (area.length < 3) return done(boxed);
  const visible: Point = [mercX(center[0]) - ox, mercY(center[1]) - oy];
  const [vx, vy] = insideRing(visible, area) ? visible : nearestOnRing(visible, area);
  return done([vx + ox, vy + oy]);
}
