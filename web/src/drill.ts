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
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

type PaintProp = Parameters<MapLibreMap["setPaintProperty"]>[1];
import type { Bounds, MapData } from "./data";
import { edgeQuads, metresPerPixel, sharedEdgeQuads } from "./edges";
import {
  CONCELHO_INNER_RIM,
  CONCELHO_PNCT_TOP,
  CONCELHO_RIM,
  CONCELHO_SLAB,
  EDGE_SOURCE,
  HOVER_EDGE_SOURCE,
  HOVER_POP,
  HOVER_RIM,
  NO_SLAB,
  PARISH_RIM,
  PARISH_SLAB,
  pnctTopFilter,
  popLift,
  rimHeights,
  rimLift,
  SLAB_VEIL,
  slabFilter,
  type SlabState,
} from "./layers";

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
/** Share of the visible area a refitted 3D selection covers (main.ts frame3d; refit outside 35–85%). */
export const FILL_3D = 0.7;
/** Duration of the tilt-and-fit move and of the slab rising, ms. */
export const DURATION_3D = 1400;
const LOWER_MS = 700;
const VEIL = 0.38;

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

/** Rim widths on screen, px (the quads are rebuilt in metres for the zoom: refreshEdges). */
const RIM_PX = 2.4;
const INNER_RIM_PX = 1.1;
const HOVER_MS = 160;
const OPAQUE = 1;
/** Slab opacity while a protected-areas overlay is on, so its hatch shows on the selection. */
const GLASS = 0.55;

type Paint = { base: number; height: number; opacity: number };

/**
 * Drives the slab layers (layers.ts slabLayers): `set` raises the target's slab, rims and (for a
 * partly-PNCT concelho) PNCT tops, and lowers the other slab; `hover` pops a parish up from the
 * concelho slab. The state is kept so a theme switch can rebuild the layers as they are (`state`),
 * and the rim geometry (edges.ts) so a full style rebuild can restore it (`restore`).
 */
export class Slabs {
  private s: SlabState = structuredClone(NO_SLAB);
  private clearTimers: Partial<Record<"concelho" | "parish" | "hover", ReturnType<typeof setTimeout>>> = {};
  private zoom = 10;
  private edges: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  private hoverEdge: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

  constructor(
    private readonly map: MapLibreMap,
    private readonly data: MapData,
  ) {}

  state(): SlabState {
    return structuredClone(this.s);
  }

  /** Height (m) of the raised concelho slab's top, or 0: where a hit test must look through it. */
  concelhoTop(): { code: string; height: number } | null {
    const c = this.s.concelho;
    return c.code && c.opacity > 0 ? { code: c.code, height: c.height } : null;
  }

  /** Shows `target` as a slab (null: none) for a camera ending at `zoom`. `animate` false applies the end state at once. */
  set(target: SlabTarget, animate: boolean, zoom: number): void {
    this.zoom = zoom;
    this.hover(null, false);
    const duration = animate ? DURATION_3D : 0;
    for (const kind of ["concelho", "parish"] as const) {
      if (target?.kind === kind) this.raise(kind, target.code, slabHeight(target.bounds), duration);
      else this.lower(kind, animate ? LOWER_MS : 0);
    }
    this.s.veil = target ? VEIL : 0;
    this.paint(SLAB_VEIL, { "background-opacity": this.s.veil }, animate ? DURATION_3D / 2 : 0);
    this.buildEdges();
  }

  /** Rebuilds the rims for a new zoom (they are a fixed number of px wide), if it moved enough. */
  refreshEdges(zoom: number): void {
    if (Math.abs(zoom - this.zoom) < 0.4) return;
    this.zoom = zoom;
    this.buildEdges();
    if (this.s.hover.code) this.buildHoverEdge(this.s.hover.code);
  }

  /** After a full style rebuild: the edge sources come back empty. */
  restore(): void {
    this.setData(EDGE_SOURCE, this.edges);
    this.setData(HOVER_EDGE_SOURCE, this.hoverEdge);
  }

  /**
   * Pops the hovered parish up from the concelho slab it belongs to (null, or any other parish: none).
   * A quick rise from the slab top, its own rim at its own top.
   */
  hover(dicofre: string | null, animate = true): void {
    const c = this.s.concelho;
    const next = dicofre && c.code && c.opacity > 0 && dicofre.startsWith(c.code) ? dicofre : null;
    const hv = this.s.hover;
    if (next === hv.code) return;
    clearTimeout(this.clearTimers.hover);
    const lift = rimLift(c.height);
    if (!next) {
      if (!hv.code) return;
      Object.assign(hv, { base: c.height, height: c.height, opacity: 0 });
      this.tokens.hover = {};
      const d = animate ? HOVER_MS * 0.7 : 0;
      this.extrude(HOVER_POP, { base: c.height, height: c.height, opacity: OPAQUE }, d);
      this.extrude(HOVER_RIM, { base: c.height, height: c.height + lift, opacity: OPAQUE }, d);
      const empty = () => {
        hv.code = null;
        this.filter(HOVER_POP, slabFilter("dicofre", null));
        this.hoverEdge = { type: "FeatureCollection", features: [] };
        this.setData(HOVER_EDGE_SOURCE, this.hoverEdge);
      };
      if (d) this.clearTimers.hover = setTimeout(empty, d + 30);
      else empty();
      return;
    }
    const top = c.height + popLift(c.height);
    Object.assign(hv, { code: next, base: c.height, height: top, opacity: OPAQUE });
    this.filter(HOVER_POP, slabFilter("dicofre", next));
    this.buildHoverEdge(next);
    this.animate(
      [
        { layer: HOVER_POP, from: { base: c.height, height: c.height, opacity: OPAQUE }, to: { base: c.height, height: top, opacity: OPAQUE } },
        { layer: HOVER_RIM, from: { base: c.height, height: c.height + lift, opacity: OPAQUE }, to: { base: top, height: top + lift, opacity: OPAQUE } },
      ],
      animate ? HOVER_MS : 0,
      "hover",
    );
  }

  // ---- internals ------------------------------------------------------------------

  private paint(layer: string, props: Record<string, number>, duration: number): void {
    if (!this.map.getLayer(layer)) return;
    for (const [prop, value] of Object.entries(props)) {
      this.map.setPaintProperty(layer, `${prop}-transition` as PaintProp, { duration, delay: 0 });
      this.map.setPaintProperty(layer, prop as PaintProp, value);
    }
  }

  private extrude(layer: string, p: Paint, duration: number): void {
    this.paint(layer, { "fill-extrusion-base": p.base, "fill-extrusion-height": p.height, "fill-extrusion-opacity": p.opacity }, duration);
  }

  private filter(layer: string, filter: ReturnType<typeof slabFilter>): void {
    if (this.map.getLayer(layer)) this.map.setFilter(layer, filter);
  }

  private setData(source: string, data: GeoJSON.FeatureCollection): void {
    (this.map.getSource(source) as GeoJSONSource | undefined)?.setData(data);
  }

  /**
   * Moves layers to `to`. Those with a `from` start there: set at once, then (once two frames have
   * applied it) the transition to `to`; both in one frame would animate from the previous value.
   */
  private animate(steps: { layer: string; from?: Paint; to: Paint }[], duration: number, group: string): void {
    const fresh = steps.filter((st) => st.from);
    if (!duration || !fresh.length) {
      for (const st of steps) this.extrude(st.layer, st.to, duration);
      return;
    }
    for (const st of fresh) this.extrude(st.layer, st.from!, 0);
    const go = () => {
      for (const st of steps) this.extrude(st.layer, st.to, duration);
    };
    // A newer animation of the same group (the same layers) supersedes this one.
    const token = (this.tokens[group] = {});
    this.map.once("render", () => this.map.once("render", () => this.tokens[group] === token && go()));
    this.map.triggerRepaint();
  }
  private tokens: Record<string, object> = {};
  private glass = false;
  private slabOpacity = () => (this.glass ? GLASS : OPAQUE);

  /**
   * Translucent slabs while a protected-areas overlay is on: the overlays are ground layers, under
   * an opaque slab they would vanish exactly over the selection. The rims stay opaque.
   */
  setGlass(on: boolean): void {
    if (on === this.glass) return;
    this.glass = on;
    for (const kind of ["concelho", "parish"] as const) {
      const s = this.s[kind];
      if (!s.code || s.opacity === 0) continue;
      s.opacity = this.slabOpacity();
      for (const st of this.stack(kind, s.height, s.opacity)) this.extrude(st.layer, st.to, 300);
    }
  }

  /** The slab layer and its rim/top layers, with their paint for a slab of `height`. */
  private stack(kind: "concelho" | "parish", height: number, opacity: number): { layer: string; to: Paint }[] {
    const st: SlabState = structuredClone(this.s);
    Object.assign(st[kind], { height, opacity });
    const rims = rimHeights(st);
    const ids = kind === "concelho" ? [CONCELHO_PNCT_TOP, CONCELHO_INNER_RIM, CONCELHO_RIM] : [PARISH_RIM];
    return [{ layer: kind === "concelho" ? CONCELHO_SLAB : PARISH_SLAB, to: { base: 0, height, opacity } }, ...ids.map((layer) => ({ layer, to: rims[layer] }))];
  }

  private raise(kind: "concelho" | "parish", code: string, height: number, duration: number): void {
    clearTimeout(this.clearTimers[kind]);
    const s = this.s[kind];
    const opacity = this.slabOpacity();
    if (s.code === code && s.height === height && s.opacity === opacity) return;
    if (!this.map.getLayer(kind === "concelho" ? CONCELHO_SLAB : PARISH_SLAB)) return;
    const fresh = s.code !== code;
    Object.assign(s, { code, base: 0, height, opacity });
    if (kind === "concelho") {
      const c = this.data.concelhos.get(code);
      this.s.concelho.partial = !!c && c.pnctCount > 0 && c.pnctCount < c.parishCount;
      this.filter(CONCELHO_SLAB, slabFilter("code", code));
      this.filter(CONCELHO_PNCT_TOP, pnctTopFilter(this.s.concelho.partial ? code : null));
    } else this.filter(PARISH_SLAB, slabFilter("dicofre", code));
    // A new feature rises from the ground.
    const ground: Paint = { base: 0, height: 0, opacity };
    this.animate(
      this.stack(kind, height, opacity).map((st) => ({ ...st, from: fresh ? ground : undefined })),
      duration,
      kind,
    );
  }

  private lower(kind: "concelho" | "parish", duration: number): void {
    const s = this.s[kind];
    if (s.code === null) return;
    Object.assign(s, { height: 0, opacity: 0 });
    this.tokens[kind] = {};
    for (const st of this.stack(kind, 0, 0)) this.extrude(st.layer, st.to, duration);
    // Once down, empty the layers and the rims, so they hold nothing while unused.
    const empty = () => {
      if (this.s[kind].opacity !== 0) return;
      this.s[kind].code = null;
      if (kind === "concelho") {
        this.s.concelho.partial = false;
        this.filter(CONCELHO_SLAB, slabFilter("code", null));
        this.filter(CONCELHO_PNCT_TOP, pnctTopFilter(null));
      } else this.filter(PARISH_SLAB, slabFilter("dicofre", null));
      this.buildEdges();
    };
    clearTimeout(this.clearTimers[kind]);
    if (duration) this.clearTimers[kind] = setTimeout(empty, duration + 50);
    else empty();
  }

  /** Rim quads for the current concelho (outer edge and inner boundaries) and parish, at this.zoom. */
  private buildEdges(): void {
    const features: GeoJSON.Feature[] = [];
    const add = (quad: GeoJSON.Polygon, props: Record<string, unknown>) => features.push({ type: "Feature", geometry: quad, properties: props });
    const c = this.s.concelho.code ? this.data.concelhos.get(this.s.concelho.code) : undefined;
    if (c) {
      const geom = this.data.concelhoGeometry.get(c.code)!;
      const w = RIM_PX * metresPerPixel(this.zoom, centreLat(this.data.concelhoBounds.get(c.code)!));
      const pnct = c.pnctCount === c.parishCount;
      for (const q of edgeQuads(geom, w, "inward")) add(q, { role: "concelho", pnct });
      const parts = c.parishes.map((p) => ({ area: this.data.parishGeometry.get(p.dicofre)!, props: { role: "inner", pnct: p.pnct } }));
      for (const { quad, props } of sharedEdgeQuads(parts, (w * INNER_RIM_PX) / RIM_PX)) add(quad, props);
    }
    const p = this.s.parish.code ? this.data.parishes.get(this.s.parish.code) : undefined;
    if (p) {
      const w = RIM_PX * metresPerPixel(this.zoom, centreLat(this.data.parishBounds.get(p.dicofre)!));
      for (const q of edgeQuads(this.data.parishGeometry.get(p.dicofre)!, w, "inward")) add(q, { role: "parish", pnct: p.pnct });
    }
    this.edges = { type: "FeatureCollection", features };
    this.setData(EDGE_SOURCE, this.edges);
  }

  private buildHoverEdge(dicofre: string): void {
    const p = this.data.parishes.get(dicofre)!;
    const w = RIM_PX * 0.7 * metresPerPixel(this.zoom, centreLat(this.data.parishBounds.get(dicofre)!));
    const quads = edgeQuads(this.data.parishGeometry.get(dicofre)!, w, "inward");
    this.hoverEdge = { type: "FeatureCollection", features: quads.map((q) => ({ type: "Feature", geometry: q, properties: { pnct: p.pnct } })) };
    this.setData(HOVER_EDGE_SOURCE, this.hoverEdge);
  }
}

const centreLat = (b: Bounds) => (b[1] + b[3]) / 2;
