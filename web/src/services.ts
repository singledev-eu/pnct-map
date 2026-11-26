/**
 * Nearby services (docs/nearby-services/): the nearest health centre, hospital emergency, supermarket,
 * schools, pharmacy and train station, with the road distance and the drive time.
 *
 * Two sources, both built by scripts/build_services.py:
 *   - web/data/services.json (lazy, content-hashed): every facility (name, position, concelho) and the
 *     result for each parish (from its main settlement) and concelho (from its seat);
 *   - the land check grid, web/public/services/grid-<sha8>/<i>.bin: 1 km cells in EPSG:3763, one ~5 KB
 *     zlib file per 16 × 16 cells (the hazard cells' scheme: plain GETs, no HTTP Range), read for a
 *     clicked point. Where a cell has no value (no road within 1 km of its centre) the land check falls
 *     back to the straight-line distance to the nearest facility, computed here and labelled as such.
 * A missing value is "—" with "not available", never an estimate (CLAUDE.md, "No invented values").
 */
import { chunkFiles, hasChunk, publicUrl, toPtTm06, type ChunkFetcher } from "./landcheck";
import { cachedJson } from "./protected";
import { formatNumber, tn } from "./strings";
import META from "../data/services.meta.json";
// Content-hashed by Vite, fetched on first use (a panel, a land check or the overlay).
import DATA_URL from "../data/services.json?url";

export const CATEGORIES = ["health", "emergency", "supermarket", "school1", "school3", "pharmacy", "station"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Facilities {
  name: string[];
  lon: number[];
  lat: number[];
  concelho: string[];
}

/** Per category, aligned with `codes`: f = facility index, t = drive time in 10 s, d = road distance in 100 m; null together. */
export interface Column {
  f: (number | null)[];
  t: (number | null)[];
  d: (number | null)[];
}

export type Results = {
  codes: string[];
  /** The place each code is measured from (parish: its main settlement; concelho: its seat); null = the polygon's point-on-surface. */
  from: (string | null)[];
} & Record<Category, Column>;

export interface ServicesData {
  version: number;
  categories: Category[];
  facilities: Record<Category, Facilities>;
  parishes: Results;
  concelhos: Results;
}

export interface Grid {
  dir: string;
  present: string;
  origin: [number, number];
  cell: number;
  width: number;
  height: number;
  chunk: number;
  chunk_cols: number;
  chunk_rows: number;
  no_value: number;
}

export const SERVICES_META = META as typeof META & { grid: Grid };
export const GRID = SERVICES_META.grid;

/** The categories' labels from the meta, in the active language. */
export const categoryLabel = (cat: Category): string => tn.category[cat];

let indexCache: WeakMap<Results, Map<string, number>> = new WeakMap();
const indexOf = (r: Results, code: string): number => {
  let m = indexCache.get(r);
  if (!m) {
    m = new Map(r.codes.map((c, i) => [c, i]));
    indexCache.set(r, m);
  }
  return m.get(code) ?? -1;
};

export const loadServices = cachedJson<ServicesData>(DATA_URL, (json) => {
  const data = json as ServicesData;
  if (data.version !== 1) throw new Error(`services.json: unknown version ${data.version}`);
  indexCache = new WeakMap();
  return data;
});

export interface Facility {
  cat: Category;
  index: number;
  name: string;
  lon: number;
  lat: number;
  concelho: string;
}

export const facility = (data: ServicesData, cat: Category, index: number): Facility | null => {
  const f = data.facilities[cat];
  if (!f || index < 0 || index >= f.name.length) return null;
  return { cat, index, name: f.name[index], lon: f.lon[index], lat: f.lat[index], concelho: f.concelho[index] };
};

/**
 * One row: the nearest facility of a category and how far it is. `mode` says how the distance was
 * measured: "road" (drive time and road distance from the routing) or "line" (straight line, no time).
 * `facility` null: no value (nothing reachable, or no data).
 */
export interface Nearest {
  cat: Category;
  facility: Facility | null;
  seconds: number | null;
  metres: number | null;
  mode: "road" | "line";
}

/** The results of a parish ("parishes") or concelho ("concelhos"), one row per category; null if the code isn't in the data. */
export function resultsFor(data: ServicesData, level: "parishes" | "concelhos", code: string): { from: string | null; rows: Nearest[] } | null {
  const r = data[level];
  const i = indexOf(r, code);
  if (i < 0) return null;
  const rows = CATEGORIES.map((cat): Nearest => {
    const col: Column | undefined = r[cat];
    const f = col?.f[i] ?? null;
    const t = col?.t[i] ?? null;
    const d = col?.d[i] ?? null;
    const fac = f === null ? null : facility(data, cat, f);
    if (!fac || t === null || d === null) return { cat, facility: null, seconds: null, metres: null, mode: "road" };
    return { cat, facility: fac, seconds: t * 10, metres: d * 100, mode: "road" };
  });
  return { from: r.from[i] ?? null, rows };
}

// ---- the land check grid ---------------------------------------------------------------------

/** The chunk and the cell inside it for EPSG:3763 (x, y), or null outside the grid. */
export function gridCell(grid: Grid, x: number, y: number): { chunk: number; row: number; col: number } | null {
  const col = Math.floor((x - grid.origin[0]) / grid.cell);
  const row = Math.floor((grid.origin[1] - y) / grid.cell);
  if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return null;
  return { chunk: Math.floor(row / grid.chunk) * grid.chunk_cols + Math.floor(col / grid.chunk), row: row % grid.chunk, col: col % grid.chunk };
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Per category: facility index, drive seconds and road metres for the cell, or null where the cell has no value. */
export type CellValues = Record<Category, { facility: number; seconds: number; metres: number } | null>;

export class GridReader {
  private chunks = new Map<number, Promise<Uint16Array>>();

  constructor(
    private readonly grid: Grid,
    private readonly fetchChunk: ChunkFetcher = chunkFiles(publicUrl(grid.dir)),
  ) {}

  private chunk(i: number): Promise<Uint16Array> {
    let p = this.chunks.get(i);
    if (!p) {
      p = this.fetchChunk(i)
        .then(inflate)
        .then((bytes) => {
          const n = CATEGORIES.length * 3 * this.grid.chunk ** 2;
          if (bytes.length !== n * 2) throw new Error("services grid: bad chunk");
          // Little-endian uint16 (Python "<u2"): read through a DataView, whatever the platform's order.
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const out = new Uint16Array(n);
          for (let k = 0; k < n; k++) out[k] = view.getUint16(2 * k, true);
          return out;
        });
      if (this.chunks.size > 32) this.chunks.delete(this.chunks.keys().next().value!);
      this.chunks.set(i, p);
      p.catch(() => this.chunks.delete(i));
    }
    return p;
  }

  /** The cell under (lon, lat); null outside the grid or where the whole chunk has no value. Throws on a failed load. */
  async valuesAt(lon: number, lat: number): Promise<CellValues | null> {
    const at = gridCell(this.grid, ...toPtTm06(lon, lat));
    if (!at || !hasChunk(this.grid, at.chunk)) return null;
    const a = await this.chunk(at.chunk);
    const ch = this.grid.chunk;
    const cell = at.row * ch + at.col;
    const out = {} as CellValues;
    CATEGORIES.forEach((cat, k) => {
      const v = (j: number) => a[(k * 3 + j) * ch * ch + cell];
      const f = v(0);
      const s = v(1);
      const m = v(2);
      out[cat] = f === this.grid.no_value || s === this.grid.no_value || m === this.grid.no_value ? null : { facility: f, seconds: s, metres: m * 10 };
    });
    return out;
  }
}

// ---- straight line ------------------------------------------------------------------------------

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** The facility of `cat` nearest to (lon, lat) in a straight line, exact (a scan of a few thousand points). */
export function nearestByLine(data: ServicesData, cat: Category, lon: number, lat: number): Nearest {
  const f = data.facilities[cat];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < f.name.length; i++) {
    const d = haversine(lon, lat, f.lon[i], f.lat[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best < 0 ? { cat, facility: null, seconds: null, metres: null, mode: "line" } : { cat, facility: facility(data, cat, best), seconds: null, metres: bestD, mode: "line" };
}

export type CheckServices = { status: "ok"; rows: Nearest[] } | { status: "error" };

/**
 * The rows for a land check point: the grid cell (road) where it has a value, else the straight line,
 * per category. Outside the grid (at sea) every row is straight line. A failed load is an error.
 */
export async function servicesAt(reader: Pick<GridReader, "valuesAt">, load: () => Promise<ServicesData>, lon: number, lat: number): Promise<CheckServices> {
  try {
    const [data, cell] = await Promise.all([load(), reader.valuesAt(lon, lat)]);
    const rows = CATEGORIES.map((cat): Nearest => {
      const v = cell?.[cat];
      const fac = v ? facility(data, cat, v.facility) : null;
      if (v && fac) return { cat, facility: fac, seconds: v.seconds, metres: v.metres, mode: "road" };
      return nearestByLine(data, cat, lon, lat);
    });
    return { status: "ok", rows };
  } catch (err) {
    console.error(err);
    return { status: "error" };
  }
}

// ---- formatting ---------------------------------------------------------------------------------

/** "<1 min", "11 min", "1 h 05 min" (whole minutes, rounded). */
export function formatDuration(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 1) return tn.underMinute;
  if (min < 60) return tn.minutes(formatNumber(min));
  return tn.hoursMinutes(formatNumber(Math.floor(min / 60)), String(min % 60).padStart(2, "0"));
}

/** "0.4 km", "7.2 km", "23 km" ("7,2 km" in PT): one decimal under 10 km. */
export function formatKm(metres: number): string {
  const km = metres / 1000;
  return tn.km(formatNumber(km, km < 10 ? 1 : 0));
}

/** The facility's name, or "Unnamed supermarket" where OSM has none. */
export const facilityName = (f: Facility): string => f.name || tn.unnamed[f.cat];

/** The distance part of a row: "7.2 km · 11 min by car", or "4.1 km in a straight line". */
export function distanceText(n: Nearest): string {
  if (n.metres === null) return `${tn.missing} (${tn.notAvailable})`;
  if (n.mode === "line") return tn.straightLine(formatKm(n.metres));
  return n.seconds === null ? formatKm(n.metres) : `${formatKm(n.metres)} · ${tn.byCar(formatDuration(n.seconds))}`;
}

/** One line for screen readers and tests: "Health centre: USF Terras de Basto, 7.2 km, 11 min by car". */
export function rowSummary(n: Nearest, concelhoName?: string): string {
  const label = categoryLabel(n.cat);
  if (!n.facility) return `${label}: ${tn.missing} (${tn.notAvailable})`;
  const where = concelhoName ? ` (${concelhoName})` : "";
  return `${label}: ${facilityName(n.facility)}${where}, ${distanceText(n).replace(" · ", ", ")}`;
}

/** An OpenStreetMap link at the facility (marker at its position, zoom 18). */
export const osmUrl = (f: Pick<Facility, "lon" | "lat">): string => {
  const lat = f.lat.toFixed(5);
  const lon = f.lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
};

/** The data dates for the source line ("OpenStreetMap, 25 Nov 2026"). */
export const SOURCES = SERVICES_META.sources;

// ---- credits --------------------------------------------------------------------------------------

/** HTML for the map attribution control: "SNS emergency services: <SNS (CC BY 4.0)>". OSM is already credited by the basemap line. */
export function servicesAttributionHtml(): string {
  return `<a href="${SOURCES.sns.dados_url}" target="_blank" rel="noopener noreferrer">${tn.creditSns}</a>`;
}

/** Every facility as a point feature for the overlay (layers.ts addServicesLayer). */
export function servicesGeoJson(data: ServicesData): GeoJSON.FeatureCollection<GeoJSON.Point, { cat: Category }> {
  const features: GeoJSON.Feature<GeoJSON.Point, { cat: Category }>[] = [];
  for (const cat of CATEGORIES) {
    const f = data.facilities[cat];
    for (let i = 0; i < f.name.length; i++) features.push({ type: "Feature", geometry: { type: "Point", coordinates: [f.lon[i], f.lat[i]] }, properties: { cat } });
  }
  return { type: "FeatureCollection", features };
}
