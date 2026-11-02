import { expect, test, waitForParishes, waitForParishView } from "./helpers";

// Relief prototype (src/terrain.ts): hillshade + terrain from Mapterhorn, a separate mode from the
// slabs (the selection is draped, not raised). Off by default; ?relief=<x> forces it for review.
const terrain = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const m = window.pnctMap;
    const src = m.getStyle().sources["terrain-dem"] as { encoding?: string; tiles?: string[] } | undefined;
    return { terrain: m.getTerrain(), encoding: src?.encoding, tiles: src?.tiles?.[0], hillshade: !!m.getLayer("hillshade") };
  });

test("off by default; the button turns relief on (terrarium encoding) and the slab gives way to the drape", async ({ page }) => {
  await page.goto("/#f=031017");
  await waitForParishView(page);
  const button = page.getByTestId("relief-button");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect((await terrain(page)).terrain).toBeNull();
  expect(await page.evaluate(() => window.pnctMap.getFilter("parish-slab"))).toEqual(["==", ["get", "dicofre"], "031017"]);

  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(button).toHaveAttribute("aria-label", "Relief: on");
  const on = await terrain(page);
  expect(on).toMatchObject({ terrain: { source: "terrain-dem", exaggeration: 1.5 }, encoding: "terrarium", hillshade: true });
  expect(on.tiles).toContain("tiles.mapterhorn.com");
  await expect.poll(() => page.evaluate(() => window.pnctMap.getFilter("parish-slab"))).toEqual(["==", ["get", "dicofre"], ""]);

  await page.reload();
  await waitForParishes(page);
  await expect(page.getByTestId("relief-button")).toHaveAttribute("aria-pressed", "true"); // remembered
  await page.getByTestId("relief-button").click();
  await expect.poll(async () => (await terrain(page)).terrain).toBeNull();
  expect((await terrain(page)).hillshade).toBe(false);
});

test("?relief=2&dem=aws: the exaggeration and the fallback source, survives a theme switch", async ({ page }) => {
  await page.goto("/?relief=2&dem=aws");
  await waitForParishes(page);
  const t = await terrain(page);
  expect(t).toMatchObject({ terrain: { exaggeration: 2 }, encoding: "terrarium", hillshade: true });
  expect(t.tiles).toContain("elevation-tiles-prod/terrarium");
  await page.getByTestId("theme-button").click();
  await expect.poll(async () => (await terrain(page)).terrain?.exaggeration).toBe(2);
});
