import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// The "All" / "Tudo" button under the zoom buttons (main.ts): back to the whole country, level, with
// the selection cleared; disabled while already there.
const MATEUS = "171415";

const camera = (page: Page) =>
  page.evaluate(() => {
    const m = window.pnctMap;
    return { pitch: m.getPitch() as number, bearing: m.getBearing() as number, zoom: m.getZoom() as number, minZoom: m.getMinZoom() as number };
  });
const atCountry = async (page: Page) => {
  const c = await camera(page);
  return c.pitch === 0 && c.bearing === 0 && Math.abs(c.zoom - c.minZoom) < 0.01;
};

test("from a 3D parish selection: back to the country view, level, nothing selected, hash updated", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  const button = page.getByTestId("country-button");
  await expect(button).toBeDisabled();
  await expect(button).toHaveText("All");
  await expect(button).toHaveAttribute("aria-label", "Show the whole country");
  await expect(button).toHaveAttribute("title", "Show the whole country");
  const countryZoom = (await camera(page)).zoom;

  await page.goto(`/#f=${MATEUS}`);
  await page.reload();
  await waitForParishView(page);
  expect((await camera(page)).pitch).toBeGreaterThan(0);
  await expect(button).toBeEnabled();
  await expect(page.locator("#search-input")).not.toHaveValue("");

  await button.click();
  await expect(page.getByTestId("panel")).toBeHidden();
  await expect(page).not.toHaveURL(/[#&](f|c)=/);
  await expect(page.locator("#search-input")).toHaveValue("");
  await expect.poll(() => atCountry(page)).toBe(true);
  expect((await camera(page)).zoom).toBeCloseTo(countryZoom, 2);
  await expect.poll(() => page.evaluate(() => window.pnctMap.getFilter("parish-slab"))).toEqual(["==", ["get", "dicofre"], ""]);
  // MapLibre writes the country view into the hash once the move ends.
  await expect.poll(() => Number(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("map")?.split("/")[0])).toBeCloseTo(countryZoom, 1);
  await expect(button).toBeDisabled();
  expect(errors).toEqual([]);
});

test("zoomed in without a selection: enabled, and goes back to the country view", async ({ page }) => {
  await page.goto("/");
  await waitForParishView(page);
  await page.locator(".maplibregl-ctrl-zoom-in").click();
  await waitForParishView(page);
  const button = page.getByTestId("country-button");
  await expect(button).toBeEnabled();
  await button.click();
  await expect.poll(() => atCountry(page)).toBe(true);
  await expect(button).toBeDisabled();
});

test("reduced motion: the move is instant", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#f=${MATEUS}`);
  await waitForParishView(page);
  await page.getByTestId("country-button").click();
  // At rest on the next frame, already at the country view.
  expect(await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(window.pnctMap.isMoving()))))).toBe(false);
  expect(await atCountry(page)).toBe(true);
  await expect(page.getByTestId("panel")).toBeHidden();
});

test("Portuguese label", async ({ page }) => {
  await page.goto("/?lang=pt");
  await waitForParishes(page);
  const button = page.getByTestId("country-button");
  await expect(button).toHaveText("Tudo");
  await expect(button).toHaveAttribute("aria-label", "Ver o país inteiro");
});

test.describe("phone (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("works with the bottom sheet open", async ({ page }) => {
    await page.goto(`/#f=${MATEUS}`);
    await waitForParishView(page);
    await expect(page.getByTestId("panel")).toBeVisible();
    await page.getByTestId("country-button").tap();
    await expect(page.getByTestId("panel")).toBeHidden();
    await expect.poll(() => atCountry(page)).toBe(true);
    await expect(page.getByTestId("country-button")).toBeDisabled();
  });
});
