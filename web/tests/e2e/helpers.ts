import { test as base, expect, type Page } from "@playwright/test";

// Shared e2e helpers. The waits come in three levels; use the weakest one a test needs:
//   waitForParishes    the parish layer has been drawn. Doesn't depend on basemap tiles/glyphs.
//   waitForParishView  the camera is at rest and the parish tiles for the current view are loaded.
//   waitForFullIdle    everything, including basemap tiles and label glyphs from tiles.openfreemap.org.
//                      Only for screenshots and the attribution text, which come from the basemap.

declare global {
  interface Window {
    pnctMap: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// Stress mode: E2E_SLOW_BASEMAP_MS=4000 delays every tiles.openfreemap.org request by a random
// 0–4000 ms, to check that tests don't depend on how fast the basemap loads.
const SLOW_BASEMAP_MS = Number(process.env.E2E_SLOW_BASEMAP_MS ?? 0);

export const test = base.extend({
  page: async ({ page }, use) => {
    if (SLOW_BASEMAP_MS > 0) {
      await page.route(/^https:\/\/tiles\.openfreemap\.org\//, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * SLOW_BASEMAP_MS));
        await route.continue();
      });
    }
    await use(page);
  },
});
export { expect };

const MAP_TIMEOUT = 30_000;

export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

/** The app has started and drawn the parish layer once (body data-parishes-loaded). */
export async function waitForParishes(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-parishes-loaded", "true", { timeout: MAP_TIMEOUT });
}

// Checked two animation frames later, so a camera move or filter change that has just ended has
// had a frame to request its new tiles; otherwise the previous view's tiles would count as loaded.
function settled(page: Page, check: "parishes" | "all"): Promise<boolean> {
  return page.evaluate(
    (check) =>
      new Promise<boolean>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const map = window.pnctMap;
            if (!map || map.isMoving()) return resolve(false);
            resolve(check === "all" ? map.loaded() : map.isSourceLoaded("parishes"));
          }),
        ),
      ),
    check,
  );
}

/** Camera at rest (fitBounds/flyTo finished) and the parish tiles for the current view loaded. */
export async function waitForParishView(page: Page): Promise<void> {
  await waitForParishes(page);
  await expect.poll(() => settled(page, "parishes"), { timeout: MAP_TIMEOUT }).toBe(true);
}

/** Everything loaded, basemap included. Only where the basemap matters (screenshots, attribution). */
export async function waitForFullIdle(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: MAP_TIMEOUT });
  await expect.poll(() => settled(page, "all"), { timeout: MAP_TIMEOUT }).toBe(true);
}

/** Types into the search box and picks the first result matching `optionText`. */
export async function searchAndPick(page: Page, query: string, optionText: RegExp): Promise<void> {
  await page.locator("#search-input").fill(query);
  await page.locator('#search-list li[role="option"]').filter({ hasText: optionText }).first().click();
}

/** The `map=` zoom from the URL hash (MapLibre writes it when a camera move ends). */
export function hashZoom(page: Page): number {
  return Number(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("map")?.split("/")[0]);
}
