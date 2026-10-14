import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishView } from "./helpers";

// Zoom levels: the country-fit minimum zoom, the concelho/parish level switch and what a click or
// tap selects at each level. The map is exposed as window.pnctMap (MapLibre Map); it is only
// inspected inside page.evaluate.
const MAINLAND_CORNERS: [number, number][] = [
  [-9.53, 36.95],
  [-9.53, 42.16],
  [-6.18, 36.95],
  [-6.18, 42.16],
];
const AROUCA = "0104";
const FREGIM = "130112"; // non-PNCT parish, Amarante
const AROUND_AMARANTE = "/#map=11/41.27/-8.07";
const HAS_PNCT_FILTER = [">", ["get", "pnct_count"], 0];

const hash = (page: Page): string => new URL(page.url()).hash;
const title = (page: Page) => page.getByTestId("panel-title");
const minZoomOf = (page: Page): Promise<number> => page.evaluate(() => window.pnctMap.getMinZoom());
const zoomOf = (page: Page): Promise<number> => page.evaluate(() => window.pnctMap.getZoom());
const centerLngOf = (page: Page): Promise<number> => page.evaluate(() => window.pnctMap.getCenter().lng);

/** Whether the four mainland corners are all inside the visible map area. */
function mainlandInView(page: Page): Promise<boolean> {
  return page.evaluate((corners) => {
    const bounds = window.pnctMap.getBounds();
    return corners.every(([lng, lat]) => bounds.contains([lng, lat]));
  }, MAINLAND_CORNERS);
}

/**
 * Page coordinates of a point inside the rendered feature of `layer` whose property `key` equals
 * `value`, found by sampling a grid over its rendered bbox (ring vertices alone can fall outside
 * concave shapes). Points under the toolbar, legend or any other DOM overlay are skipped, so the
 * point can be clicked or tapped.
 */
async function pointInside(page: Page, layer: string, key: string, value: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({ layer, key, value }) => {
      const map = window.pnctMap;
      const canvas: HTMLCanvasElement = map.getCanvas();
      const origin = canvas.getBoundingClientRect();
      let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
      const grow = (c: any): void => {
        if (typeof c[0] === "number") {
          const p = map.project(c);
          [minX, minY, maxX, maxY] = [Math.min(minX, p.x), Math.min(minY, p.y), Math.max(maxX, p.x), Math.max(maxY, p.y)];
        } else c.forEach(grow);
      };
      for (const f of map.queryRenderedFeatures({ layers: [layer] })) {
        if (f.properties[key] === value) grow(f.geometry.coordinates);
      }
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const x = minX + ((maxX - minX) * i) / steps;
          const y = minY + ((maxY - minY) * j) / steps;
          if (x < 0 || y < 0 || x > canvas.clientWidth || y > canvas.clientHeight) continue;
          const top = document.elementFromPoint(origin.left + x, origin.top + y);
          if (top !== canvas && !canvas.contains(top)) continue;
          if (map.queryRenderedFeatures([x, y], { layers: [layer] })[0]?.properties[key] === value) {
            return { x: origin.left + x, y: origin.top + y };
          }
        }
      }
      return null;
    },
    { layer, key, value },
  );
  expect(point, `a visible point inside ${layer} ${key}=${value}`).not.toBeNull();
  return point!;
}

test("min zoom fits mainland and blocks zooming out further", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);

  const minZoom = await minZoomOf(page);
  expect(Math.abs((await zoomOf(page)) - minZoom)).toBeLessThan(0.01);
  expect(await mainlandInView(page)).toBe(true);

  // Wheel-zoom out at the map centre.
  await page.mouse.move(720, 450);
  for (let i = 0; i < 5; i++) await page.mouse.wheel(0, 600);
  await waitForParishView(page);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(minZoom - 1e-6);

  // Programmatic zoom out is clamped too.
  await page.evaluate((z) => window.pnctMap.zoomTo(z, { duration: 0 }), minZoom - 2);
  await waitForParishView(page);
  expect(await zoomOf(page)).toBeGreaterThanOrEqual(minZoom - 1e-6);

  // maxBounds keep the view in Portugal: Madrid is out of reach.
  await page.evaluate(() => window.pnctMap.jumpTo({ center: [-3.7, 40.4] }));
  expect(await centerLngOf(page)).toBeLessThan(-5);
  expect(errors).toEqual([]);
});

test("min zoom is recomputed on resize", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  const desktopMin = await minZoomOf(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => minZoomOf(page)).not.toBe(desktopMin);
  const phoneMin = await minZoomOf(page);
  expect(phoneMin).toBeLessThan(desktopMin);

  await expect.poll(async () => Math.abs((await zoomOf(page)) - (await minZoomOf(page)))).toBeLessThan(0.01);
  await expect.poll(() => mainlandInView(page)).toBe(true);
  expect(errors).toEqual([]);
});

test("clicking a concelho at country zoom selects it and zooms in to parish level", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");
  const minZoom = await minZoomOf(page);

  const arouca = await pointInside(page, "concelho-fill", "code", AROUCA);
  await page.mouse.click(arouca.x, arouca.y);
  await expect(title(page)).toHaveText("Arouca");
  await expect.poll(() => hash(page)).toMatch(new RegExp(`[#&]c=${AROUCA}(&|$)`));
  expect(hash(page)).not.toMatch(/[#&]f=/);

  await waitForParishView(page);
  expect(await zoomOf(page)).toBeGreaterThan(minZoom + 2);
  await expect(page.locator("body")).toHaveAttribute("data-level", "parish");
  expect(errors).toEqual([]);
});

test("clicking a parish at parish zoom selects it", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(AROUND_AMARANTE);
  await waitForParishView(page);
  await expect(page.locator("body")).toHaveAttribute("data-level", "parish");

  const fregim = await pointInside(page, "parish-fill", "dicofre", FREGIM);
  await page.mouse.click(fregim.x, fregim.y);
  await expect(title(page)).toHaveText("Fregim");
  expect(hash(page)).toContain(`f=${FREGIM}`);
  expect(errors).toEqual([]);
});

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a tap at country zoom selects a concelho, never a parish", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishView(page);
    await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");

    const arouca = await pointInside(page, "concelho-fill", "code", AROUCA);
    await page.touchscreen.tap(arouca.x, arouca.y);
    await expect.poll(() => hash(page)).toMatch(new RegExp(`[#&]c=${AROUCA}(&|$)`));
    expect(hash(page)).not.toMatch(/[#&]f=/);
    await expect(title(page)).toHaveText("Arouca");
    expect(errors).toEqual([]);
  });
});

test("focus mode hides not-PNCT concelhos at concelho level", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#focus=1");
  await waitForParishView(page);
  await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");

  expect(await page.evaluate(() => window.pnctMap.getFilter("concelho-fill"))).toEqual(HAS_PNCT_FILTER);
  const counts = () =>
    page.evaluate(() =>
      window.pnctMap.queryRenderedFeatures({ layers: ["concelho-fill"] }).map((f: { properties: { pnct_count: number } }) => f.properties.pnct_count),
    );
  await expect.poll(async () => (await counts()).length).toBeGreaterThan(0);
  expect((await counts()).every((n) => n > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test("in focus mode a click on a not-PNCT concelho at concelho level does nothing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  // Gondomar (Porto) has no PNCT parishes. Find a point on it while it is still drawn.
  const code: string = await page.evaluate(
    () => window.pnctMap.queryRenderedFeatures({ layers: ["concelho-fill"] }).find((f: any) => f.properties.name === "Gondomar").properties.code,
  );
  const gondomar = await pointInside(page, "concelho-fill", "code", code);

  await page.locator("#only-pnct").check();
  await expect.poll(() => page.evaluate(() => window.pnctMap.getFilter("concelho-fill"))).toEqual(HAS_PNCT_FILTER);
  await waitForParishView(page);
  await page.mouse.click(gondomar.x, gondomar.y);
  await expect(page.getByTestId("panel")).toBeHidden();
  expect(hash(page)).not.toMatch(/[#&][cf]=/);
  await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");
  expect(errors).toEqual([]);
});
