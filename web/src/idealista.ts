// Google Encoded Polyline (precision 1e5) and Idealista shape/URL helpers.
// Kept in sync with scripts/polyline.py (the reference implementation).

/** [lat, lng] */
export type LatLng = [number, number];
export type Operation = "comprar" | "arrendar";
export type PropertyType = "terrenos" | "casas" | "predios";
export type LandFilter =
  | "terreno-urbano"
  | "terreno-urbanizavel"
  | "terreno-nao-urbanizavel";

/** Canonical filter order, used when building URLs. */
export const LAND_FILTERS: readonly LandFilter[] = [
  "terreno-urbano",
  "terreno-urbanizavel",
  "terreno-nao-urbanizavel",
];

export interface SearchOptions {
  op: Operation;
  type: PropertyType;
  land: LandFilter[];
}

export const DEFAULT_OPTIONS: SearchOptions = {
  op: "comprar",
  type: "terrenos",
  land: [],
};

export const IDEALISTA_ORIGIN = "https://www.idealista.pt";

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

/**
 * Encode [lat, lng] points. Coordinates are rounded to 5 decimals with
 * Math.round (half-up, same as Python's floor(x + 0.5)). The caller is
 * responsible for closing the ring; exactly the given points are encoded.
 */
export function encodePolyline(points: LatLng[]): string {
  let out = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - prevLat);
    out += encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const readDelta = (): number => {
    let shift = 0;
    let result = 0;
    for (;;) {
      if (index >= encoded.length) {
        throw new Error("truncated polyline");
      }
      const b = encoded.charCodeAt(index++) - 63;
      result += (b & 0x1f) * 2 ** shift;
      shift += 5;
      if (b < 0x20) break;
    }
    return result % 2 === 1 ? -Math.floor((result + 1) / 2) : result / 2;
  };
  while (index < encoded.length) {
    lat += readDelta();
    lng += readDelta();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** encodeURIComponent, plus the sub-delims Idealista's own URLs escape: ( ) ~ ! * ' */
export function escapeComponent(s: string): string {
  return encodeURIComponent(s).replace(
    /[()~!*']/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
}

export function shapeParam(encoded: string): string {
  return escapeComponent("((" + encoded + "))");
}

export function parseShapeParam(param: string): LatLng[] {
  const s = decodeURIComponent(param);
  if (!(s.startsWith("((") && s.endsWith("))")) || s.length < 4) {
    throw new Error("shape must be wrapped in (( ))");
  }
  return decodePolyline(s.slice(2, -2));
}

/** "" unless type is "terrenos" and a land filter is chosen; else "/com-a,b" in canonical order. */
export function filterSegment(opts: SearchOptions): string {
  if (opts.type !== "terrenos" || opts.land.length === 0) return "";
  const selected = LAND_FILTERS.filter((f) => opts.land.includes(f));
  return selected.length > 0 ? `/com-${selected.join(",")}` : "";
}

export function polygonUrl(encoded: string, opts: SearchOptions): string {
  return `${IDEALISTA_ORIGIN}/areas/${opts.op}-${opts.type}${filterSegment(opts)}/mapa-google?shape=${shapeParam(encoded)}`;
}

/** "Castanheira de Pêra" -> "castanheira-de-pera" */
export function concelhoSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Municipality search URL.
 *
 * UNVERIFIED: the position of the land-filter segment in this form
 * (`/<slug>/com-.../mapa-google`) is a guess and has not been checked
 * against Idealista.
 */
export function municipalityUrl(concelho: string, opts: SearchOptions): string {
  return `${IDEALISTA_ORIGIN}/${opts.op}-${opts.type}/${concelhoSlug(concelho)}${filterSegment(opts)}/mapa-google`;
}
