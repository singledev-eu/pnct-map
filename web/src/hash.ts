/**
 * App state in the URL hash, next to MapLibre's own "map=" parameter:
 *   #map=9.2/41.79/-8.58&f=160763   selected parish (dicofre)
 *   #map=...&c=0808                 selected concelho (code)
 *   #...&d=Faro                     district filter
 *   #...&focus=1                    focus mode, "Only PNCT" (older links used pnct=1)
 *   #...&pa=rnap,natura             protected-areas overlays switched on (category ids)
 *   #...&op=arrendar&t=casas&land=urbano   property-search selector (see prefs.ts)
 */
export const MAP_HASH_KEY = "map";

export interface HashState {
  parish: string | null;
  concelho: string | null;
  district: string | null;
  focus: boolean;
  /** Overlay category ids from `pa=`, unvalidated (main.ts keeps the known ones). */
  overlays: string[];
  hasMapView: boolean;
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function readHash(): HashState {
  const p = params();
  const f = p.get("f");
  const c = p.get("c");
  return {
    parish: f && /^\d{6}$/.test(f) ? f : null,
    concelho: c && /^\d{4}$/.test(c) ? c : null,
    district: p.get("d"),
    focus: p.get("focus") === "1" || p.get("pnct") === "1",
    overlays: (p.get("pa") ?? "").split(",").filter(Boolean),
    hasMapView: p.has(MAP_HASH_KEY),
  };
}

export function writeHash(update: Partial<Record<"f" | "c" | "d" | "focus" | "pnct" | "pa" | "op" | "t" | "land", string | null>>): void {
  const p = params();
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === undefined || v === "") p.delete(k);
    else p.set(k, v);
  }
  // URLSearchParams encodes "/" (map=z/lat/lng) and "," (land=a,b); keep them readable.
  const hash = p.toString().replace(/%2F/g, "/").replace(/%2C/g, ",");
  const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
  window.history.replaceState(window.history.state, "", url);
}
