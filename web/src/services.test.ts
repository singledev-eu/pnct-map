import { afterEach, describe, expect, it } from "vitest";
import { hasChunk } from "./landcheck";
import {
  CATEGORIES,
  distanceText,
  facility,
  formatDuration,
  formatKm,
  GRID,
  type Grid,
  gridCell,
  GridReader,
  haversine,
  nearestByLine,
  osmUrl,
  resultsFor,
  rowSummary,
  type ServicesData,
  servicesAt,
  servicesGeoJson,
} from "./services";
import { setLang } from "./strings";

afterEach(() => setLang("en"));

// Node's fs without @types/node (the app's tsconfig is browser-only), as in landcheck.test.ts.
const NODE_FS = "node:fs";
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
  existsSync: (p: URL) => boolean;
  readFileSync: { (p: URL): Uint8Array; (p: URL, enc: "utf8"): string };
};

/** zlib (RFC 1950), as Python's zlib.compress writes it, through the platform's CompressionStream. */
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const column = (f: (number | null)[], t: (number | null)[], d: (number | null)[]) => ({ f, t, d });

/** Two facilities per category; parish 010101 has a value everywhere, 010102 none for emergency. */
function fixture(): ServicesData {
  const facilities = Object.fromEntries(
    CATEGORIES.map((c) => [c, { name: [`${c} A`, ""], lon: [-8.0, -7.5], lat: [40.0, 40.2], concelho: ["0101", "0102"] }]),
  ) as ServicesData["facilities"];
  const cols = Object.fromEntries(CATEGORIES.map((c) => [c, c === "emergency" ? column([0, null], [66, null], [72, null]) : column([1, 0], [6, 120], [5, 98])]));
  return {
    version: 1,
    categories: [...CATEGORIES],
    facilities,
    parishes: { codes: ["010101", "010102"], from: ["Aldeia", null], ...cols } as ServicesData["parishes"],
    concelhos: { codes: ["0101"], from: ["Vila"], ...Object.fromEntries(CATEGORIES.map((c) => [c, column([0], [30], [20])])) } as ServicesData["concelhos"],
  };
}

describe("formatting", () => {
  it("rounds durations to whole minutes", () => {
    expect(formatDuration(20)).toBe("<1 min");
    expect(formatDuration(660)).toBe("11 min");
    expect(formatDuration(3900)).toBe("1 h 05 min");
    expect(formatDuration(3570)).toBe("1 h 00 min");
  });
  it("shows one decimal under 10 km", () => {
    expect(formatKm(400)).toBe("0.4 km");
    expect(formatKm(7200)).toBe("7.2 km");
    expect(formatKm(23_400)).toBe("23 km");
  });
  it("uses the Portuguese decimal comma", () => {
    setLang("pt");
    expect(formatKm(7200)).toBe("7,2 km");
    expect(distanceText({ cat: "health", facility: null, seconds: 660, metres: 7200, mode: "road" })).toBe("7,2 km · 11 min de carro");
    expect(distanceText({ cat: "health", facility: null, seconds: null, metres: 4100, mode: "line" })).toBe("4,1 km em linha reta");
  });
  it("matches the row format of the brief", () => {
    const data = fixture();
    const n = { cat: "health" as const, facility: facility(data, "health", 0), seconds: 660, metres: 7200, mode: "road" as const };
    expect(rowSummary(n)).toBe("Health centre: health A, 7.2 km, 11 min by car");
    expect(rowSummary({ ...n, facility: null })).toBe("Health centre: — (not available)");
  });
  it("names unnamed facilities by their category", () => {
    const n = { cat: "supermarket" as const, facility: facility(fixture(), "supermarket", 1), seconds: 60, metres: 900, mode: "road" as const };
    expect(rowSummary(n)).toMatch(/^Supermarket: Unnamed supermarket,/);
  });
  it("links OpenStreetMap at the facility", () => {
    expect(osmUrl({ lon: -8.12345, lat: 40.5 })).toBe("https://www.openstreetmap.org/?mlat=40.50000&mlon=-8.12345#map=18/40.50000/-8.12345");
  });
});

describe("resultsFor", () => {
  it("decodes 10 s and 100 m units and the origin", () => {
    const r = resultsFor(fixture(), "parishes", "010101")!;
    expect(r.from).toBe("Aldeia");
    const health = r.rows.find((n) => n.cat === "health")!;
    expect(health.facility?.name).toBe("");
    expect(health.seconds).toBe(60);
    expect(health.metres).toBe(500);
    expect(r.rows.map((n) => n.cat)).toEqual([...CATEGORIES]);
  });
  it("keeps a missing value missing (no invented values)", () => {
    const r = resultsFor(fixture(), "parishes", "010102")!;
    expect(r.from).toBeNull();
    const em = r.rows.find((n) => n.cat === "emergency")!;
    expect(em).toEqual({ cat: "emergency", facility: null, seconds: null, metres: null, mode: "road" });
  });
  it("returns null for an unknown code", () => {
    expect(resultsFor(fixture(), "parishes", "999999")).toBeNull();
    expect(resultsFor(fixture(), "concelhos", "0101")?.from).toBe("Vila");
  });
});

describe("straight line", () => {
  it("haversine matches a degree of latitude", () => {
    expect(haversine(-8, 39, -8, 40)).toBeCloseTo(111_195, -2);
  });
  it("finds the nearest facility and labels the row as a straight line", () => {
    const n = nearestByLine(fixture(), "pharmacy", -7.55, 40.19);
    expect(n.facility?.index).toBe(1);
    expect(n.mode).toBe("line");
    expect(n.seconds).toBeNull();
    expect(n.metres).toBeCloseTo(haversine(-7.55, 40.19, -7.5, 40.2), 3);
  });
});

// A one-chunk grid: 2 × 2 cells of 1 km, chunk 2, origin (0, 2000) in EPSG:3763.
const tiny: Grid = { ...GRID, origin: [0, 2000], cell: 1000, width: 2, height: 2, chunk: 2, chunk_cols: 1, chunk_rows: 1, present: "01" };

function chunkBytes(values: (k: number, field: number, cell: number) => number): Promise<Uint8Array> {
  const n = CATEGORIES.length * 3 * 4;
  const view = new DataView(new ArrayBuffer(n * 2));
  for (let k = 0; k < CATEGORIES.length; k++) for (let j = 0; j < 3; j++) for (let c = 0; c < 4; c++) view.setUint16(2 * ((k * 3 + j) * 4 + c), values(k, j, c), true);
  return deflate(new Uint8Array(view.buffer));
}

describe("the grid", () => {
  it("indexes chunks and cells from the top-left", () => {
    expect(gridCell(tiny, 10, 1990)).toEqual({ chunk: 0, row: 0, col: 0 });
    expect(gridCell(tiny, 1500, 10)).toEqual({ chunk: 0, row: 1, col: 1 });
    expect(gridCell(tiny, -1, 10)).toBeNull();
    expect(gridCell(tiny, 10, 2001)).toBeNull();
  });

  it("reads little-endian values and marks the sentinel as no value", async () => {
    // Category k, cell c: facility k, seconds 100 + c, metres/10 = 7; category 1 (emergency) cell 3: no value.
    const bytes = await chunkBytes((k, j, c) => (k === 1 && c === 3 ? 0xffff : [k, 100 + c, 7][j]));
    const reader = new GridReader(tiny, async () => bytes);
    // ~150 m north of the PT-TM06 origin: x ≈ 0, y ≈ 150, cell row 1, col 0 of this grid.
    const v = await reader.valuesAt(-8.1331, 39.67);
    expect(v?.health).toEqual({ facility: 0, seconds: 102, metres: 70 });
    expect(v?.station).toEqual({ facility: 6, seconds: 102, metres: 70 });
  });

  it("rejects a chunk of the wrong size", async () => {
    const bad = await deflate(new Uint8Array(10));
    const reader = new GridReader(tiny, async () => bad);
    await expect(reader.valuesAt(-8.1331, 39.67)).rejects.toThrow(/bad chunk/);
  });

  it("the land check falls back to a straight line where the cell has no value", async () => {
    const data = fixture();
    const cell = Object.fromEntries(CATEGORIES.map((c) => [c, c === "school1" ? null : { facility: 0, seconds: 300, metres: 2500 }]));
    const r = await servicesAt({ valuesAt: async () => cell as never }, async () => data, -7.55, 40.19);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.rows.find((n) => n.cat === "health")).toMatchObject({ mode: "road", seconds: 300, metres: 2500 });
    expect(r.rows.find((n) => n.cat === "school1")).toMatchObject({ mode: "line", seconds: null });
  });

  it("outside the grid, every row is a straight line", async () => {
    const r = await servicesAt({ valuesAt: async () => null }, async () => fixture(), -7.55, 40.19);
    expect(r.status === "ok" && r.rows.every((n) => n.mode === "line")).toBe(true);
  });

  it("a failed load is an error, never a value", async () => {
    const r = await servicesAt({ valuesAt: async () => Promise.reject(new Error("HTTP 404")) }, async () => fixture(), -7.55, 40.19);
    expect(r).toEqual({ status: "error" });
  });
});

describe("the built data", () => {
  const dataPath = new URL("../data/services.json", import.meta.url);
  it("has a row for every category and parish", () => {
    const data = JSON.parse(readFileSync(dataPath, "utf8")) as ServicesData;
    expect(data.categories).toEqual([...CATEGORIES]);
    expect(data.parishes.codes).toHaveLength(3049);
    // Monsanto (Idanha-a-Nova): measured from Monsanto, a primary school in the village.
    const r = resultsFor(data, "parishes", "050520")!;
    expect(r.from).toBe("Monsanto");
    expect(r.rows.find((n) => n.cat === "school1")!.metres).toBeLessThan(2000);
    expect(servicesGeoJson(data).features.length).toBe(CATEGORIES.reduce((s, c) => s + data.facilities[c].name.length, 0));
  });

  const gridDir = new URL(`../public/${GRID.dir}/`, import.meta.url);
  it.skipIf(!existsSync(gridDir))("reads a real chunk the way build_services.read_grid does (Lisbon has every category)", async () => {
    const reader = new GridReader(GRID, async (i) => new Uint8Array(readFileSync(new URL(`${i}.bin`, gridDir))));
    const v = await reader.valuesAt(-9.1365, 38.7107);
    for (const c of CATEGORIES) expect(v?.[c]?.seconds).toBeLessThan(1800);
    expect(hasChunk(GRID, 0)).toBe(false); // the north-west corner is sea
  });
});
