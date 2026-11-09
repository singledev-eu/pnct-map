import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// Concelho seats and district capitals (src/cities.ts): a symbol layer above everything, plus edge
// pointers to the selection's seat and nearest capital when they are off the visible area.
const rendered = (page: Page, layer: string) =>
  page.evaluate((id) => window.pnctMap.queryRenderedFeatures({ layers: [id] }).map((f) => f.properties.name as string), layer);
const pointers = (page: Page) => page.getByTestId("city-pointer").allTextContents();

test("district capitals show at the country view, above the basemap's labels", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  const ids = await page.evaluate(() => window.pnctMap.getStyle().layers.map((l) => l.id));
  expect(ids.slice(-3)).toEqual(["city-seats", "city-selected", "city-capitals"]);
  // Placement needs the glyphs; most of the 18 fit at once (a few may collide near the coast).
  await expect.poll(async () => new Set(await rendered(page, "city-capitals")).size, { timeout: 20_000 }).toBeGreaterThanOrEqual(14);
  expect(await rendered(page, "city-capitals")).toContain("Lisboa");
  expect(await rendered(page, "city-seats")).toEqual([]); // seats only from about the concelho level
  expect(errors).toEqual([]);
});

test("Erra selected: Coruche (its seat) and Santarém (the district capital) are on the map or pointed at", async ({ page }) => {
  await page.goto("/#f=140911");
  await waitForParishView(page);
  const seen = async () => [...(await rendered(page, "city-seats")), ...(await rendered(page, "city-capitals")), ...(await pointers(page))].join(" | ");
  await expect.poll(seen, { timeout: 20_000 }).toContain("Coruche");
  await expect.poll(seen, { timeout: 20_000 }).toContain("Santarém");
  // A pointer gives the distance and an accessible name.
  const pill = page.getByTestId("city-pointer").first();
  if (await pill.count()) {
    await expect(pill).toHaveText(/ · \d+ km$/);
    await expect(pill).toHaveAttribute("aria-label", /km away, off the map$/);
  }
});

test("the legend toggle hides the towns and the pointers, and is remembered", async ({ page }) => {
  await page.goto("/#f=140911");
  await waitForParishView(page);
  const toggle = page.getByTestId("cities-toggle");
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  expect(await page.evaluate(() => window.pnctMap.getLayoutProperty("city-capitals", "visibility"))).toBe("none");
  await expect(page.getByTestId("city-pointer")).toHaveCount(0);
  await page.reload();
  await waitForParishes(page);
  await expect(page.getByTestId("cities-toggle")).not.toBeChecked();
  expect(await page.evaluate(() => window.pnctMap.getLayoutProperty("city-seats", "visibility"))).toBe("none");
});

test("Portuguese legend label", async ({ page }) => {
  await page.goto("/?lang=pt");
  await waitForParishes(page);
  await expect(page.locator(".legend-cities")).toContainText("Sedes de concelho");
});
