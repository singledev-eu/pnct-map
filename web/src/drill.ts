/**
 * 3D drill-down selection. With 3D on, selecting a concelho or a parish tilts the camera (pitch, a
 * small bearing turn), raises the selection as a slab (layers.ts slabLayers) and veils the rest of
 * the map; drilling from a concelho into one of its parishes lowers the concelho slab while the
 * parish slab rises. Clearing the selection levels the camera again.
 *
 * 3D is a viewer setting (the "3D" button in the legend header), kept in localStorage like the
 * theme. It is off, whatever the setting, under prefers-reduced-motion: no tilt, no slab, and
 * selections move the camera at once (main.ts).
 */
import type { Map as MapLibreMap } from "maplibre-gl";

type PaintProp = Parameters<MapLibreMap["setPaintProperty"]>[1];
import type { Bounds } from "./data";
import { CONCELHO_SLAB, CONCELHO_SLAB_LINE, NO_SLAB, PARISH_SLAB, PARISH_SLAB_LINE, SLAB_VEIL, slabFilter, type SlabState } from "./layers";

export const VIEW3D_STORAGE_KEY = "pnct-map:3d";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/**
 * Phones (a coarse pointer on a narrow screen) get a lower tilt: the bottom sheet covers the lower
 * half of the map, and at 50° the selection, placed in the upper half, sits too far towards the
 * horizon. 3D is on by default there too: on the throttled mid-range phone profile the animation
 * ran at the same frame rate with 3D on and off; the cost is ~40–50% more basemap tiles per
 * selection (docs/reports/3d-drilldown.md, scripts/perf_3d.mjs).
 */
export const PHONE_QUERY = "(pointer: coarse) and (max-width: 900px)";

/** The saved setting; on when there is none or storage is unavailable. */
export function load3dPref(storage: () => Storage = () => window.localStorage): boolean {
  try {
    const v = storage().getItem(VIEW3D_STORAGE_KEY);
    if (v === "on" || v === "off") return v === "on";
  } catch {
    // Storage may be unavailable (private mode, blocked).
  }
  return true;
}

export function save3dPref(on: boolean, storage: () => Storage = () => window.localStorage): void {
  try {
    storage().setItem(VIEW3D_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Without storage the choice lasts for this page only.
  }
}

/** Camera tilt for a selected feature. */
export const PITCH = 50;
const PITCH_PHONE = 40;
/** Duration of the tilt-and-fit move and of the slab rising, ms. */
export const DURATION_3D = 1400;
const LOWER_MS = 700;
const VEIL = 0.38;
const SLAB_OPACITY = 0.92;

/**
 * Pitch and bearing for a selection. The bearing is a fixed ±8–15° per feature (from its code), so
 * the same selection always lands on the same view and neighbours turn different ways.
 */
export function view3dFor(code: string, phone: boolean): { pitch: number; bearing: number } {
  const n = Number.parseInt(code, 10) || 0;
  const magnitude = 8 + ((n * 7) % 8); // 8..15
  return { pitch: phone ? PITCH_PHONE : PITCH, bearing: n % 2 ? magnitude : -magnitude };
}

const EARTH = 6_371_008.8;
/**
 * Slab height in metres: 3% of the feature's larger side (in ground metres), within 60–1000 m, so a
 * parish and a concelho read alike at the zoom each is fitted to. A thin plate with a strong outline
 * (look "b" in docs/reports/3d-drilldown.md): a tall translucent slab put the ground outline visibly
 * inside its top face.
 */
export function slabHeight(b: Bounds): number {
  const lat = ((b[1] + b[3]) / 2) * (Math.PI / 180);
  const w = ((b[2] - b[0]) * Math.PI * EARTH * Math.cos(lat)) / 180;
  const h = ((b[3] - b[1]) * Math.PI * EARTH) / 180;
  return Math.round(Math.min(1000, Math.max(60, 0.03 * Math.max(w, h))));
}

export type SlabTarget = { kind: "concelho" | "parish"; code: string; bounds: Bounds } | null;

/**
 * Drives the slab layers. `set` raises the target's slab and lowers the other one; the state is
 * kept so a theme switch can rebuild the layers as they are (`state`).
 */
export class Slabs {
  private s: SlabState = structuredClone(NO_SLAB);
  private clearTimers: Partial<Record<"concelho" | "parish", ReturnType<typeof setTimeout>>> = {};

  constructor(private readonly map: MapLibreMap) {}

  state(): SlabState {
    return structuredClone(this.s);
  }

  /** Shows `target` as a slab (null: none). `animate` false applies the end state at once. */
  set(target: SlabTarget, animate: boolean): void {
    const duration = animate ? DURATION_3D : 0;
    for (const kind of ["concelho", "parish"] as const) {
      if (target?.kind === kind) this.raise(kind, target.code, slabHeight(target.bounds), duration);
      else this.lower(kind, animate ? LOWER_MS : 0);
    }
    this.s.veil = target ? VEIL : 0;
    this.paint(SLAB_VEIL, "background-opacity", this.s.veil, animate ? DURATION_3D / 2 : 0);
  }

  private layers(kind: "concelho" | "parish") {
    return kind === "concelho" ? { slab: CONCELHO_SLAB, line: CONCELHO_SLAB_LINE, key: "code" as const } : { slab: PARISH_SLAB, line: PARISH_SLAB_LINE, key: "dicofre" as const };
  }

  private paint(layer: string, prop: string, value: number, duration: number): void {
    if (!this.map.getLayer(layer)) return;
    this.map.setPaintProperty(layer, `${prop}-transition` as PaintProp, { duration, delay: 0 });
    this.map.setPaintProperty(layer, prop as PaintProp, value);
  }

  private raise(kind: "concelho" | "parish", code: string, height: number, duration: number): void {
    clearTimeout(this.clearTimers[kind]);
    const { slab, line, key } = this.layers(kind);
    const s = this.s[kind];
    if (s.code === code && s.height === height && s.opacity === SLAB_OPACITY) return;
    if (!this.map.getLayer(slab)) return;
    const fresh = s.code !== code;
    Object.assign(s, { code, height, opacity: SLAB_OPACITY });
    this.map.setFilter(slab, slabFilter(key, code));
    this.map.setFilter(line, slabFilter(key, code));
    this.paint(line, "line-opacity", 1, 0);
    this.paint(slab, "fill-extrusion-opacity", SLAB_OPACITY, 0);
    if (!duration) return this.paint(slab, "fill-extrusion-height", height, 0);
    // A new feature rises from the ground: height 0 at once, then (once a frame has applied it) the
    // transition up. Both in one frame would animate from the previous feature's height instead.
    if (fresh) this.paint(slab, "fill-extrusion-height", 0, 0);
    const up = () => this.s[kind].code === code && this.paint(slab, "fill-extrusion-height", height, duration);
    if (!fresh) return void up();
    this.map.once("render", () => this.map.once("render", up));
    this.map.triggerRepaint();
  }

  private lower(kind: "concelho" | "parish", duration: number): void {
    const { slab, line, key } = this.layers(kind);
    const s = this.s[kind];
    if (s.code === null) return;
    Object.assign(s, { height: 0, opacity: 0 });
    this.paint(slab, "fill-extrusion-height", 0, duration);
    this.paint(slab, "fill-extrusion-opacity", 0, duration);
    this.paint(line, "line-opacity", 0, duration / 2);
    // Once down, empty the layer, so it holds nothing while unused.
    const empty = () => {
      if (this.s[kind].opacity !== 0) return;
      this.s[kind].code = null;
      if (!this.map.getLayer(slab)) return;
      this.map.setFilter(slab, slabFilter(key, null));
      this.map.setFilter(line, slabFilter(key, null));
    };
    clearTimeout(this.clearTimers[kind]);
    if (duration) this.clearTimers[kind] = setTimeout(empty, duration + 50);
    else empty();
  }
}
