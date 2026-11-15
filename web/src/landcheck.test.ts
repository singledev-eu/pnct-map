import { describe, expect, it } from "vitest";
import type { Area } from "./data";
import { BLOCKED, cellAt, CellReader, formatPoint, HAZARD, httpRanges, inArea, parishAtPoint, parsePoint, runCheck, toPtTm06 } from "./landcheck";

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

describe("httpRanges", () => {
  const body = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  it("asks for an inclusive byte range and returns a 206 body", async () => {
    const seen: string[] = [];
    const fetcher = (async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string>).Range;
      seen.push(range);
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(range)!.map(Number);
      return new Response(body.slice(a, b + 1), { status: 206 });
    }) as typeof fetch;
    expect([...(await httpRanges("/x", fetcher)(2, 5))]).toEqual([2, 3, 4]);
    expect(seen).toEqual(["bytes=2-4"]);
  });
  it("slices a 200 (Range ignored) and reuses it", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return new Response(body, { status: 200 });
    }) as typeof fetch;
    const get = httpRanges("/x", fetcher);
    expect([...(await get(1, 3))]).toEqual([1, 2]);
    expect([...(await get(6, 8))]).toEqual([6, 7]);
    expect(calls).toBe(1);
  });
  it("throws on other statuses", async () => {
    await expect(httpRanges("/x", (async () => new Response("", { status: 404 })) as typeof fetch)(0, 1)).rejects.toThrow("404");
  });
});

// Node's fs, typed here: the project has no @types/node (tests run in Vitest's node environment).
const NODE_FS = "node:fs";
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ NODE_FS)) as { existsSync: (p: URL) => boolean; readFileSync: (p: URL) => Uint8Array };
const CELLS_FILE = new URL(`../public/${HAZARD.cells.file}`, import.meta.url);
const haveCells = existsSync(CELLS_FILE);

describe.skipIf(!haveCells)("CellReader on the built grid (uv run make landcheck)", () => {
  const file = haveCells ? new Uint8Array(readFileSync(CELLS_FILE)) : new Uint8Array();
  let requests = 0;
  const reader = new CellReader(HAZARD.cells, async (start, end) => {
    requests++;
    return file.slice(start, end);
  });

  it("is the file the meta names", () => {
    expect(file.length).toBe(HAZARD.cells.bytes);
  });
  it.each(POINTS)("%s", async (_name, lat, lon, expected) => {
    expect(await reader.classAt(lon, lat)).toBe(expected);
  });
  it("reads the index once and caches chunks", async () => {
    const before = requests;
    await reader.classAt(-8.15187, 39.92681);
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
  it("runCheck: outside mainland has no hazard; a failed read is an error, not a class", async () => {
    const ok = { classAt: async () => 4 };
    const broken = {
      classAt: async () => {
        throw new Error("offline");
      },
    };
    expect(await runCheck(data, ok, 5, 5)).toEqual({ lat: 5, lon: 5, dicofre: null });
    expect(await runCheck(data, ok, 0.5, 2)).toEqual({ lat: 2, lon: 0.5, dicofre: "010101", hazard: { status: "ok", value: 4 } });
    const original = console.error;
    console.error = () => {};
    expect((await runCheck(data, broken, 0.5, 2)).hazard).toEqual({ status: "error" });
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
