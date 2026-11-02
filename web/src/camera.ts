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
/**
 * The protected-areas overlays fade in over this many zoom levels and reach full strength at the
 * parish level (minZoom + LEVEL_OFFSET): invisible from the country view (minZoom) to minZoom + 0.5,
 * so a small pinch at the country view stays clean, and full wherever a concelho click lands.
 */
export const PROTECTED_FADE = 1.5;

/** Zoom range [start, end] over which the overlays fade in, for a level zoom (CameraLimits.levelZoom). */
export const protectedFade = (levelZoom: number): [number, number] => [levelZoom - PROTECTED_FADE, levelZoom];

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

/**
 * Zoom at which `b` just fits the padded viewport (what map.fitBounds would pick). With a `bearing`
 * (degrees), the box is fitted as the map turns it: its rotated extent must fit.
 */
export function fitZoom(b: Bounds, size: Size, pad: Padding, bearing = 0): number {
  const w = Math.max(1, size.width - pad.left - pad.right);
  const h = Math.max(1, size.height - pad.top - pad.bottom);
  let dx = mercX(b[2]) - mercX(b[0]);
  let dy = mercY(b[1]) - mercY(b[3]);
  if (bearing) {
    const [c, s] = [Math.abs(Math.cos((bearing * Math.PI) / 180)), Math.abs(Math.sin((bearing * Math.PI) / 180))];
    [dx, dy] = [dx * c + dy * s, dx * s + dy * c];
  }
  return Math.log2(Math.min(w / dx, h / dy) / TILE_SIZE);
}

/** A tilted, turned camera (degrees) on a map `height` px tall with a vertical field of view `fov` (degrees). */
export interface View {
  pitch: number;
  bearing: number;
  height: number;
  fov: number;
}

/**
 * Where a screen offset from the map centre lands on the ground, as a world offset at the current zoom
 * (px, x east, y south). Flat and north-up it is the screen offset itself. With a pitch, a point below
 * the centre is nearer the camera and one above it farther (exact for MapLibre's perspective camera:
 * the eye sits cameraToCenterDistance = height / 2 / tan(fov / 2) from the centre); the bearing then
 * turns it into map axes. Used both to place a fitted selection in the visible area and to find the
 * visible area's centre for the camera outline (constrainView), so the two always agree.
 */
export function groundOffset(o: { x: number; y: number }, view: View): { x: number; y: number } {
  const p = (view.pitch * Math.PI) / 180;
  let [gx, gy] = [o.x, o.y];
  if (p) {
    const d = view.height / 2 / Math.tan((view.fov * Math.PI) / 360);
    const a = Math.atan2(o.y, d); // the ray's angle below the centre ray
    const eye = d * Math.cos(p); // the camera's height above the ground
    gy = d * Math.sin(p) - eye * Math.tan(p - a);
    gx = (o.x * eye) / Math.cos(p - a) / Math.hypot(d, o.y);
  }
  const t = (view.bearing * Math.PI) / 180;
  return { x: gx * Math.cos(t) - gy * Math.sin(t), y: gx * Math.sin(t) + gy * Math.cos(t) };
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

// ---- the tilted camera (3D selection, drill.ts) -------------------------------------------------
// MapLibre's perspective camera, flat ground: the eye looks at the map centre from
// d = height / 2 / tan(fov / 2) px away, tilted by `pitch` from straight down. Coordinates below are
// px at the current zoom, relative to the map centre (the container centre: the app sets no
// transform padding). "Screen-aligned" ground axes are the map's axes turned by the bearing: u to
// the screen's right, v towards the screen's bottom (the camera).

const eyeDistance = (view: View) => view.height / 2 / Math.tan((view.fov * Math.PI) / 360);

/**
 * The screen position (px from the container centre, x right, y down) of a point at world offset
 * (dx east, dy south) from the map centre, `elevation` px above the ground; null if it is behind
 * the camera.
 */
export function projectGround(dx: number, dy: number, view: View, elevation = 0): { x: number; y: number } | null {
  const t = (view.bearing * Math.PI) / 180;
  const p = (view.pitch * Math.PI) / 180;
  const d = eyeDistance(view);
  const [u, v] = [dx * Math.cos(t) + dy * Math.sin(t), -dx * Math.sin(t) + dy * Math.cos(t)];
  const depth = d - v * Math.sin(p) - elevation * Math.cos(p);
  if (depth <= d * 1e-3) return null;
  return { x: (d * u) / depth, y: (d * (v * Math.cos(p) - elevation * Math.sin(p))) / depth };
}

/**
 * For a screen point (px from the container centre) on a surface `elevation` px above the ground
 * (a slab top), the screen point where the ground right below it is drawn. That is where the
 * ground-level layers must be hit-tested to find what lies under the slab top.
 */
export function groundUnder(s: { x: number; y: number }, elevation: number, view: View): { x: number; y: number } {
  const p = (view.pitch * Math.PI) / 180;
  if (!p || !elevation) return s;
  const d = eyeDistance(view);
  const [sp, cp] = [Math.sin(p), Math.cos(p)];
  const v = (s.y * (d - elevation * cp) + d * elevation * sp) / (d * cp + s.y * sp);
  const u = (s.x * (d - v * sp - elevation * cp)) / d;
  const depth = d - v * sp;
  return { x: (d * u) / depth, y: (d * v * cp) / depth };
}

export interface ProjectedFit {
  center: [number, number];
  zoom: number;
  /** Share of the visible area the footprint covers: the larger of its width and height shares. */
  share: number;
  /** The whole footprint is inside the visible area. */
  inside: boolean;
}

/**
 * Frames a footprint (lng/lat points, e.g. a feature's outer rings) for a tilted, turned camera:
 * centres its *projected* bounding box in the visible area (the map minus `pad`) and, unless
 * `fixedZoom` is given, picks the zoom at which it covers `fill` of that area, within
 * [minZoom, maxZoom]. The near half of a tilted view is magnified, so the flat bounding box would
 * overflow towards the bottom of the screen; this iterates on the projected one instead.
 */
export function fitProjected(
  points: [number, number][],
  size: Size,
  pad: Padding,
  view: { pitch: number; bearing: number; fov: number },
  opts: { zoom: number; fixedZoom?: boolean; fill?: number; minZoom?: number; maxZoom?: number },
): ProjectedFit {
  const cam: View = { ...view, height: size.height };
  const merc = points.map(([lng, lat]) => [mercX(lng), mercY(lat)] as Point);
  const aw = Math.max(1, size.width - pad.left - pad.right);
  const ah = Math.max(1, size.height - pad.top - pad.bottom);
  // The visible area's centre, relative to the container centre.
  const tc = { x: (pad.left - pad.right) / 2, y: (pad.top - pad.bottom) / 2 };
  const xs = merc.map((m) => m[0]);
  const ys = merc.map((m) => m[1]);
  let c: Point = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  let z = opts.zoom;
  const clampZ = (v: number) => Math.min(opts.maxZoom ?? 22, Math.max(opts.minZoom ?? 0, v));
  const box = () => {
    const world = TILE_SIZE * 2 ** z;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [mx, my] of merc) {
      const s = projectGround((mx - c[0]) * world, (my - c[1]) * world, cam);
      if (!s) return null;
      if (s.x < x0) x0 = s.x;
      if (s.x > x1) x1 = s.x;
      if (s.y < y0) y0 = s.y;
      if (s.y > y1) y1 = s.y;
    }
    return { x0, y0, x1, y1 };
  };
  for (let i = 0; i < 24; i++) {
    const b = box();
    if (!b) {
      if (opts.fixedZoom) break;
      z = clampZ(z - 0.5);
      continue;
    }
    // Move the centre so the box's centre lands on the visible area's centre: the ground point drawn
    // at the box centre goes where the ground point at the area centre is drawn now.
    const bc = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
    const world = TILE_SIZE * 2 ** z;
    const g1 = groundOffset(bc, cam);
    const g0 = groundOffset(tc, cam);
    c = [c[0] + (g1.x - g0.x) / world, c[1] + (g1.y - g0.y) / world];
    if (!opts.fixedZoom) {
      const share = Math.max((b.x1 - b.x0) / aw, (b.y1 - b.y0) / ah);
      if (share > 0) z = clampZ(z + 0.85 * Math.log2((opts.fill ?? 0.7) / share));
    }
  }
  const b = box();
  const share = b ? Math.max((b.x1 - b.x0) / aw, (b.y1 - b.y0) / ah) : Infinity;
  const [hw, hh] = [size.width / 2, size.height / 2];
  const inside = !!b && b.x0 >= pad.left - hw - 0.5 && b.x1 <= hw - pad.right + 0.5 && b.y0 >= pad.top - hh - 0.5 && b.y1 <= hh - pad.bottom + 0.5;
  return { center: [lngOf(c[0]), latOf(c[1])], zoom: z, share, inside };
}
