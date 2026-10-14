import { expect, test, trackErrors, waitForFullIdle } from "./helpers";

// The basemap labels are Latin-only (src/basemap.ts). Before that, a view reaching below 36.6°N
// loaded the z6 tile 6/30/25 (northern Morocco) and MapLibre fetched the Arabic and Tifinagh glyph
// ranges. This test checks those ranges are never requested, with Moroccan tiles certainly loaded.
const TANGIER = { lng: -5.81, lat: 35.77 };
const FORBIDDEN_RANGES = ["1536-1791", "65024-65279", "11520-11775"];

/** Standard slippy-map tile (x, y) containing lng/lat at zoom z. */
function tileOf(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("no Arabic or Tifinagh glyph ranges are requested, even with Moroccan tiles loaded", async ({ page }) => {
    const errors = trackErrors(page);
    // Context level: MapLibre fetches tiles and glyphs from a web worker, which page-level
    // listeners do not see. Registered before goto so nothing is missed.
    const urls: string[] = [];
    page.context().on("request", (request) => urls.push(decodeURIComponent(request.url())));

    await page.goto("/");
    // Label glyphs are only fetched once the symbol layers are laid out, so the basemap has to be
    // fully idle; this is the one test where waitForFullIdle (not waitForParishView) is needed.
    await waitForFullIdle(page);

    // Move south so Moroccan tiles certainly load, at several zooms (maxBounds may clamp; fine).
    const minZoom: number = await page.evaluate(() => window.pnctMap.getMinZoom());
    for (const zoom of [minZoom, minZoom + 1, minZoom + 2]) {
      await page.evaluate((zoom) => window.pnctMap.jumpTo({ center: [-7.9, 36.9], zoom }), zoom);
      await waitForFullIdle(page);
    }

    // Non-vacuous check 1: a basemap tile covering Tangier was requested.
    const tiles = urls.flatMap((url) => {
      const m = /^https:\/\/tiles\.openfreemap\.org\/(?!fonts\/).*\/(\d+)\/(\d+)\/(\d+)\.pbf(?:\?.*)?$/.exec(url);
      return m ? [{ url, z: Number(m[1]), x: Number(m[2]), y: Number(m[3]) }] : [];
    });
    const tangierTiles = tiles.filter((t) => {
      const want = tileOf(TANGIER.lng, TANGIER.lat, t.z);
      return t.x === want.x && t.y === want.y;
    });
    expect(tiles.length, "basemap tile requests").toBeGreaterThan(0);
    expect(tangierTiles.map((t) => t.url), "a requested basemap tile contains Tangier").not.toEqual([]);

    // Non-vacuous check 2: labels rendered, i.e. the Latin glyph range was fetched.
    const glyphs = urls.filter((url) => url.includes("/fonts/") && url.includes(".pbf"));
    expect(
      glyphs.filter((url) => url.endsWith("/0-255.pbf")),
      "glyph requests for range 0-255",
    ).not.toEqual([]);

    // The actual assertion.
    const offending = glyphs.filter((url) => FORBIDDEN_RANGES.some((range) => url.includes(`/${range}.pbf`)));
    expect(offending, `forbidden glyph ranges requested:\n${offending.join("\n")}`).toEqual([]);
    expect(errors).toEqual([]);
  });
});
