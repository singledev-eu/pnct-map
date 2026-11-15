import { describe, expect, it } from "vitest";
import type { Area } from "./data";
import { BLOCKED, cellAt, CellReader, chunkFiles, formatPoint, HAZARD, hazardAt, hasChunk, inArea, parishAtPoint, parsePoint, toPtTm06, visibleArea } from "./landcheck";

// [lat, lon, x, y] from pyproj (EPSG:4326 -> EPSG:3763).
const PROJ_FIXTURES: [number, number, number, number][] = [
  [39.92681, -8.15187, -1603.84, 28707.353],
  [41.1496, -8.611, -40116.519, 164601.99],
  [41.896, -6.733, 116190.006, 248338.197],
  [37.0, -7.9, 20749.378, -296158.896],
  [42.15, -8.2, -5528.991, 275604.984],
  [38.71, -9.5, -118893.222, -105497.967],
  [39.6682583333333, -8.13310833333333, 0, 0],
  [41.94, -6.19, 161142.501, 254103.864],
];

// The report's verification points with their class in the ICNF source raster (tests/test_landcheck.py).
const POINTS: [string, number, number, number][] = [
  ["Pedrógão Grande, rural", 39.92681, -8.15187, 5],
  ["Pedrógão Grande, Vila Facaia", 39.903, -8.221, 3],
  ["Porto, Aliados (built-up)", 41.1496, -8.611, 0],
  ["Bragança, França", 41.896, -6.733, 5],
  ["Bragança, Rio de Onor", 41.94, -6.613, 4],
  ["Atlantic", 39.5, -10.0, 0],
  ["Spain, Cáceres", 40.0, -6.0, 0],
];

describe("toPtTm06", () => {
  it.each(PROJ_FIXTURES)("%f, %f matches pyproj within 1 mm", (lat, lon, x, y) => {
    const [px, py] = toPtTm06(lon, lat);
    expect(Math.abs(px - x)).toBeLessThan(0.001);
    expect(Math.abs(py - y)).toBeLessThan(0.001);
  });
});

describe("cellAt", () => {
  const grid = { ...HAZARD.cells, origin: [0, 1000] as [number, number], cell: 25, width: 600, height: 40, chunk: 256, chunk_cols: 3, chunk_rows: 1 };
  it("indexes chunks and cells row-major from the top-left", () => {
    expect(cellAt(grid, 0.1, 999.9)).toEqual({ chunk: 0, cell: 0 });
    expect(cellAt(grid, 256 * 25 + 30, 999)).toEqual({ chunk: 1, cell: 1 });
    expect(cellAt(grid, 10, 1000 - 25 * 3 - 1)).toEqual({ chunk: 0, cell: 3 * 256 });
  });
  it("is null outside the grid", () => {
    expect(cellAt(grid, -1, 999)).toBeNull();
    expect(cellAt(grid, 10, 1001)).toBeNull();
    expect(cellAt(grid, 600 * 25, 999)).toBeNull();
    expect(cellAt(grid, 10, 0)).toBeNull();
  });
});

describe("chunkFiles and hasChunk", () => {
  it("GETs <dir>/<i>.bin", async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url);
      return new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "application/octet-stream" } });
    }) as typeof fetch;
    expect([...(await chunkFiles("/landcheck/x", fetcher)(42))]).toEqual([1, 2]);
    expect(seen).toEqual(["/landcheck/x/42.bin"]);
  });
  it("rejects an error status and an HTML fallback page", async () => {
    const html = (async () => new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })) as typeof fetch;
    await expect(chunkFiles("/x", html)(1)).rejects.toThrow("text/html");
    await expect(chunkFiles("/x", (async () => new Response("", { status: 404 })) as typeof fetch)(1)).rejects.toThrow("404");
  });
  it("reads the presence bitmap bit by bit", () => {
    const grid = { present: "0580" }; // byte 0 = 0b00000101, byte 1 = 0b10000000
    expect([0, 1, 2, 3, 15, 16].map((i) => hasChunk(grid, i))).toEqual([true, false, true, false, true, false]);
  });
});

// Node's fs, typed here: the project has no @types/node (tests run in Vitest's node environment).
const NODE_FS = "node:fs";
const { existsSync, readFileSync, readdirSync } = (await import(/* @vite-ignore */ NODE_FS)) as {
  existsSync: (p: URL) => boolean;
  readFileSync: (p: URL) => Uint8Array;
  readdirSync: (p: URL) => string[];
};
const CELLS_DIR = new URL(`../public/${HAZARD.cells.dir}/`, import.meta.url);
const haveCells = existsSync(CELLS_DIR);

describe.skipIf(!haveCells)("CellReader on the built grid (uv run make landcheck)", () => {
  let requests = 0;
  const reader = new CellReader(HAZARD.cells, async (i) => {
    requests++;
    return new Uint8Array(readFileSync(new URL(`${i}.bin`, CELLS_DIR)));
  });

  it("has the files the meta names", () => {
    expect(readdirSync(CELLS_DIR).length).toBe(HAZARD.cells.files);
  });
  it.each(POINTS)("%s", async (_name, lat, lon, expected) => {
    expect(await reader.classAt(lon, lat)).toBe(expected);
  });
  it("caches chunks, and asks for no file where the bitmap has none", async () => {
    const before = requests;
    await reader.classAt(-8.15187, 39.92681);
    await reader.classAt(-10, 39.5); // at sea: outside the grid or an empty chunk
    expect(requests).toBe(before);
  });
});

describe("inArea and parishAtPoint", () => {
  // A square with a square hole, and a second parish beside it.
  const donut: Area = {
    type: "Polygon",
    coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]],
    ],
  };
  const hole: Area = { type: "MultiPolygon", coordinates: [[[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]] };
  const data = {
    parishBounds: new Map<string, [number, number, number, number]>([["010101", [0, 0, 4, 4]], ["010102", [1, 1, 3, 3]]]),
    parishGeometry: new Map<string, Area>([["010101", donut], ["010102", hole]]),
  };
  it("treats holes as outside", () => {
    expect(inArea(donut, 0.5, 0.5)).toBe(true);
    expect(inArea(donut, 2, 2)).toBe(false);
  });
  it("finds the parish, including an enclave, and null outside", () => {
    expect(parishAtPoint(data, 0.5, 2)).toBe("010101");
    expect(parishAtPoint(data, 2, 2)).toBe("010102");
    expect(parishAtPoint(data, 5, 5)).toBeNull();
  });
  it("hazardAt: a failed read is an error, not a class", async () => {
    expect(await hazardAt({ classAt: async () => 4 }, 0.5, 2)).toEqual({ status: "ok", value: 4 });
    const original = console.error;
    console.error = () => {};
    const broken = {
      classAt: async () => {
        throw new Error("offline");
      },
    };
    expect(await hazardAt(broken, 0.5, 2)).toEqual({ status: "error" });
    console.error = original;
  });
});

describe("points in the URL", () => {
  it("round-trips chk= with 5 decimals", () => {
    expect(formatPoint(41.1496, -8.611)).toBe("41.14960,-8.61100");
    expect(parsePoint("41.14960,-8.61100")).toEqual({ lat: 41.1496, lon: -8.611 });
  });
  it("reads lat/lon parameters", () => {
    expect(parsePoint("39.9", "-8.1")).toEqual({ lat: 39.9, lon: -8.1 });
  });
  it.each([null, "", "abc", "41.1", "91,0", "0,181", "1,x"])("rejects %s", (v) => {
    expect(parsePoint(v)).toBeNull();
  });
});

it("lists the facts blocked in v1", () => {
  expect([...BLOCKED].sort()).toEqual(["broadband", "ren"]);
  expect(HAZARD.classes.map((c) => c.value)).toEqual([1, 2, 3, 4, 5]);
});

describe("visibleArea (the check-mode crosshair)", () => {
  const phone = { width: 390, height: 844 };
  const toolbar = { top: 12, left: 12, bottom: 212, right: 378 };
  const legend = { top: 784, left: 12, bottom: 832, right: 160 };
  const sheet = { top: 422, left: 0, bottom: 844, right: 390 };

  it("phone, no sheet: between the toolbar and the bottom bar", () => {
    const a = visibleArea(phone, { toolbar, panel: null, bottomBar: legend, narrow: true });
    expect(a.padding).toEqual({ top: 212, right: 0, bottom: 60, left: 0 });
    expect(a.centre).toEqual({ x: 195, y: 212 + (784 - 212) / 2 });
    expect(a.cramped).toBe(false);
  });

  it("phone, sheet open: above the sheet, which is higher than the bottom bar", () => {
    const a = visibleArea(phone, { toolbar, panel: sheet, bottomBar: legend, narrow: true });
    expect(a.padding.bottom).toBe(844 - 422);
    expect(a.centre).toEqual({ x: 195, y: (212 + 422) / 2 });
  });

  it("phone, sheet pulled up to full: cramped, never a negative area", () => {
    const a = visibleArea(phone, { toolbar, panel: { ...sheet, top: 84 }, bottomBar: legend, narrow: true });
    expect(a.cramped).toBe(true);
    expect(a.padding.top + a.padding.bottom).toBeLessThanOrEqual(844);
    expect(a.centre.y).toBe(212);
  });

  it("desktop: left of the side panel; the corner legend doesn't count", () => {
    const desk = { width: 1440, height: 900 };
    const a = visibleArea(desk, { toolbar: { top: 12, left: 12, bottom: 64, right: 900 }, panel: { top: 12, left: 1068, bottom: 888, right: 1428 }, bottomBar: { top: 600, left: 12, bottom: 888, right: 260 }, narrow: false });
    expect(a.padding).toEqual({ top: 64, right: 372, bottom: 0, left: 0 });
    expect(a.centre).toEqual({ x: (1440 - 372) / 2, y: 64 + (900 - 64) / 2 });
    const closed = visibleArea(desk, { toolbar: { top: 12, left: 12, bottom: 64, right: 900 }, panel: null, bottomBar: null, narrow: false });
    expect(closed.centre.x).toBe(720);
  });
});
