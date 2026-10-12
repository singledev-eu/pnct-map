import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadData, type MapData } from "./data";
import { getConcelhoLinks, getLinks } from "./links";
import { LAND_FILTERS, type LandFilter, type Operation, type PropertyType, type SearchOptions } from "./idealista";
import topoJson from "../data/pnct.topo.json?raw";
import shapesJson from "../data/shapes.json?raw";

// Regenerates every Idealista link the panel can show, for every parish and concelho and every
// search option, from the real data files, and compares a SHA-256 per parish/concelho against
// links.sha256.json. Any change to the link output (from the shapes, the display data's names,
// or the URL code) fails this test. Update deliberately with `npx vitest run -u`.

const OPS: Operation[] = ["comprar", "arrendar"];
const TYPES: PropertyType[] = ["terrenos", "casas", "predios"];
const LAND_SETS: LandFilter[][] = Array.from({ length: 1 << LAND_FILTERS.length }, (_, mask) =>
  LAND_FILTERS.filter((_, i) => mask & (1 << i)),
);
const ALL_OPTIONS: SearchOptions[] = OPS.flatMap((op) => TYPES.flatMap((type) => LAND_SETS.map((land) => ({ op, type, land }))));

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let data: MapData;

beforeAll(async () => {
  const files: Record<string, string> = { "pnct.topo.json": topoJson, "shapes.json": shapesJson };
  vi.stubGlobal("fetch", async (url: string) => {
    const body = files[url.split("/").pop()!];
    return body === undefined ? new Response(null, { status: 404 }) : new Response(body);
  });
  data = await loadData("data/pnct.topo.json");
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("Idealista link output", () => {
  it("matches the recorded baseline for every parish, concelho and search option", async () => {
    const hashes: Record<string, string> = {};
    let pnctParishes = 0;
    let links = 0;
    for (const p of [...data.parishes.values()].sort((a, b) => a.dicofre.localeCompare(b.dicofre))) {
      const concelho = data.concelhos.get(p.dicofre.slice(0, 4))!;
      const lines: string[] = [];
      for (const opts of ALL_OPTIONS) {
        for (const l of await getLinks(p, concelho, opts)) lines.push(JSON.stringify(l));
      }
      if (p.pnct) pnctParishes += 1;
      links += lines.length;
      hashes[`parish:${p.dicofre}`] = await sha256(lines.join("\n"));
    }
    for (const c of [...data.concelhos.values()].sort((a, b) => a.code.localeCompare(b.code))) {
      const lines = ALL_OPTIONS.flatMap((opts) => getConcelhoLinks(c, opts)).map((l) => JSON.stringify(l));
      links += lines.length;
      hashes[`concelho:${c.code}`] = await sha256(lines.join("\n"));
    }

    expect(pnctParishes).toBe(1861);
    expect(links).toBeGreaterThan(1861 * ALL_OPTIONS.length);
    await expect(JSON.stringify(hashes, null, 1) + "\n").toMatchFileSnapshot("./__snapshots__/links.sha256.json");
  }, 120_000);
});
