/**
 * Land check: what the data says about one point of mainland Portugal (docs/land-check/).
 *
 * v1 answers two facts, both traceable to a dataset:
 *   - the parish under the point and whether it is PNCT: point-in-polygon on the CAOP 2025 display
 *     geometry the map already holds (data.ts), so no extra download;
 *   - the ICNF structural wildfire hazard class: the 25 m source cell under the point, read from
 *     web/public/landcheck/hazard-cells-<sha8>.bin (scripts/build_hazard.py) with two HTTP Range
 *     requests: the chunk index (16 KB, once per session) and one ~6 KB zlib chunk. No server code.
 * REN and fixed broadband are blocked in v1 (landcheck.meta.json `blocked`, DATA.md).
 *
 * A point outside every parish is "outside mainland Portugal" and gets no hazard either.
 */
import type { Area, MapData } from "./data";
import META from "../data/landcheck.meta.json";

export interface HazardClass {
  value: number;
  color: string;
  en: string;
  pt: string;
}

export interface CellGrid {
  file: string;
  bytes: number;
  crs: string;
  /** Top-left corner, EPSG:3763 metres. */
  origin: [number, number];
  cell: number;
  width: number;
  height: number;
  chunk: number;
  chunk_cols: number;
  chunk_rows: number;
}

export const HAZARD = META.hazard as typeof META.hazard & { cells: CellGrid; classes: HazardClass[] };
export const BLOCKED: readonly string[] = META.blocked;

/** Where Pages serves a file of web/public/. */
export const publicUrl = (file: string): string => `${import.meta.env.BASE_URL}${file}`;

// ---- PT-TM06 / ETRS89 (EPSG:3763) ---------------------------------------------------------
// Transverse Mercator on GRS80, lat0 39°40'05.73"N, lon0 8°07'59.19"W, k0 1, no false origin.
// Krüger's series to n⁴ (Karney 2011): sub-millimetre across the mainland (tests: pyproj fixtures).

const A_GRS80 = 6378137;
const F_GRS80 = 1 / 298.257222101;
const LAT0 = (39.6682583333333 * Math.PI) / 180;
const LON0 = (-8.13310833333333 * Math.PI) / 180;
const N3 = F_GRS80 / (2 - F_GRS80);
const RECT = (A_GRS80 / (1 + N3)) * (1 + N3 ** 2 / 4 + N3 ** 4 / 64);
const ALPHA = [
  N3 / 2 - (2 * N3 ** 2) / 3 + (5 * N3 ** 3) / 16 + (41 * N3 ** 4) / 180,
  (13 * N3 ** 2) / 48 - (3 * N3 ** 3) / 5 + (557 * N3 ** 4) / 1440,
  (61 * N3 ** 3) / 240 - (103 * N3 ** 4) / 140,
  (49561 * N3 ** 4) / 161280,
];
const E2N = (2 * Math.sqrt(N3)) / (1 + N3);

function krueger(phi: number, dLambda: number): [number, number] {
  const sin = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sin) - E2N * Math.atanh(E2N * sin));
  const xi = Math.atan2(t, Math.cos(dLambda));
  const eta = Math.atanh(Math.sin(dLambda) / Math.sqrt(1 + t * t));
  let x = eta;
  let y = xi;
  ALPHA.forEach((a, i) => {
    const j = 2 * (i + 1);
    x += a * Math.cos(j * xi) * Math.sinh(j * eta);
    y += a * Math.sin(j * xi) * Math.cosh(j * eta);
  });
  return [RECT * x, RECT * y];
}

const Y0 = krueger(LAT0, 0)[1];

/** WGS84/ETRS89 lon/lat (degrees) to EPSG:3763 metres. ETRS89 and WGS84 are within ~1 m here, below the 25 m cells. */
export function toPtTm06(lon: number, lat: number): [number, number] {
  const [x, y] = krueger((lat * Math.PI) / 180, (lon * Math.PI) / 180 - LON0);
  return [x, y - Y0];
}

// ---- the hazard cell grid -------------------------------------------------------------------

/** The chunk and the cell inside it for EPSG:3763 (x, y), or null outside the grid. */
export function cellAt(grid: CellGrid, x: number, y: number): { chunk: number; cell: number } | null {
  const col = Math.floor((x - grid.origin[0]) / grid.cell);
  const row = Math.floor((grid.origin[1] - y) / grid.cell);
  if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return null;
  return {
    chunk: Math.floor(row / grid.chunk) * grid.chunk_cols + Math.floor(col / grid.chunk),
    cell: (row % grid.chunk) * grid.chunk + (col % grid.chunk),
  };
}

export type RangeFetcher = (start: number, end: number) => Promise<Uint8Array>;

/**
 * Byte ranges of `url` ([start, end), end exclusive) over HTTP Range. A server that ignores Range
 * (200 with the whole file) still works: the whole body is kept and later ranges are sliced from it.
 */
export function httpRanges(url: string, fetcher: typeof fetch = fetch): RangeFetcher {
  let whole: Promise<Uint8Array> | null = null;
  return async (start, end) => {
    if (whole) return (await whole).slice(start, end);
    const res = await fetcher(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (res.status === 206) return new Uint8Array(await res.arrayBuffer());
    if (res.status === 200) {
      whole = res.arrayBuffer().then((b) => new Uint8Array(b));
      return (await whole).slice(start, end);
    }
    throw new Error(`${url}: HTTP ${res.status}`);
  };
}

/** zlib (RFC 1950) streams, as Python's zlib.compress writes them, through the browser's DecompressionStream. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads hazard classes from the cell grid: 0 = no class (outside the classified land), 1–5 = ICNF class. */
export class CellReader {
  private index: Promise<Uint32Array> | null = null;
  private chunks = new Map<number, Promise<Uint8Array | null>>();

  constructor(
    private readonly grid: CellGrid,
    private readonly range: RangeFetcher,
  ) {}

  private offsets(): Promise<Uint32Array> {
    if (!this.index) {
      const n = this.grid.chunk_rows * this.grid.chunk_cols + 1;
      this.index = this.range(0, 4 * n).then((b) => {
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        const out = new Uint32Array(n);
        for (let i = 0; i < n; i++) out[i] = view.getUint32(4 * i, true);
        if (out[0] !== 4 * n) throw new Error("hazard grid: bad index");
        return out;
      });
      this.index.catch(() => (this.index = null)); // retry on the next lookup
    }
    return this.index;
  }

  private chunk(i: number): Promise<Uint8Array | null> {
    let p = this.chunks.get(i);
    if (!p) {
      p = this.offsets().then(async (o) => (o[i] === o[i + 1] ? null : inflate(await this.range(o[i], o[i + 1]))));
      if (this.chunks.size > 64) this.chunks.delete(this.chunks.keys().next().value!); // a few MB at most
      this.chunks.set(i, p);
      p.catch(() => this.chunks.delete(i));
    }
    return p;
  }

  async classAt(lon: number, lat: number): Promise<number> {
    const at = cellAt(this.grid, ...toPtTm06(lon, lat));
    if (!at) return 0;
    const cells = await this.chunk(at.chunk);
    if (cells && cells.length !== this.grid.chunk ** 2) throw new Error("hazard grid: bad chunk");
    return cells ? cells[at.cell] : 0;
  }
}

// ---- parish under a point -----------------------------------------------------------------------

function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd over every ring, so holes (enclaves) are outside. */
export function inArea(geom: Area, lon: number, lat: number): boolean {
  const polygons = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let inside = false;
  for (const polygon of polygons) for (const ring of polygon) if (inRing(ring, lon, lat)) inside = !inside;
  return inside;
}

/** The dicofre of the parish under the point, or null outside mainland Portugal. */
export function parishAtPoint(data: Pick<MapData, "parishBounds" | "parishGeometry">, lon: number, lat: number): string | null {
  for (const [dicofre, b] of data.parishBounds) {
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    const geom = data.parishGeometry.get(dicofre);
    if (geom && inArea(geom, lon, lat)) return dicofre;
  }
  return null;
}

// ---- the report ---------------------------------------------------------------------------------

export type HazardResult = { status: "ok"; value: number } | { status: "error" };

export interface CheckReport {
  lat: number;
  lon: number;
  /** null: outside mainland Portugal. */
  dicofre: string | null;
  /** Absent outside mainland. */
  hazard?: HazardResult;
}

export async function runCheck(data: Pick<MapData, "parishBounds" | "parishGeometry">, reader: Pick<CellReader, "classAt">, lon: number, lat: number): Promise<CheckReport> {
  const dicofre = parishAtPoint(data, lon, lat);
  if (!dicofre) return { lat, lon, dicofre: null };
  let hazard: HazardResult;
  try {
    hazard = { status: "ok", value: await reader.classAt(lon, lat) };
  } catch (err) {
    console.error(err);
    hazard = { status: "error" };
  }
  return { lat, lon, dicofre, hazard };
}

export const hazardClass = (value: number): HazardClass | undefined => HAZARD.classes.find((c) => c.value === value);

// ---- the URL ------------------------------------------------------------------------------------

/** "41.14960,-8.61100": 5 decimals, about 1 m. */
export const formatPoint = (lat: number, lon: number): string => `${lat.toFixed(5)},${lon.toFixed(5)}`;

/** `chk=` (or the lat/lon of a /check?lat=..&lon=.. link) to a point; null if it isn't one. */
export function parsePoint(lat: string | null | undefined, lon?: string | null): { lat: number; lon: number } | null {
  if (lat && lon === undefined) [lat, lon] = lat.split(",");
  const la = Number(lat);
  const lo = Number(lon);
  if (!lat || !lon || !Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return { lat: la, lon: lo };
}
