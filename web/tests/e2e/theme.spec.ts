import type { Page } from "@playwright/test";
import { PALETTES, STYLE_URLS } from "../../src/theme";
import { expect, test, trackErrors, waitForFullIdle, waitForParishes, waitForParishView } from "./helpers";

// Automatic light/dark theme (src/theme.ts): the basemap style, the data-layer palette and the CSS
// all follow prefers-color-scheme, at load and on a live OS switch (page.emulateMedia fires the
// matchMedia "change" event). The map is exposed as window.pnctMap and only inspected in page.evaluate.
const VILARINHO = "170810"; // PNCT parish: Vilarinho dos Freires
const APP_LAYERS = ["concelho-fill", "concelho-hatch", "parish-fill", "parish-line", "concelho-line", "parish-highlight", "concelho-highlight"];
const PNCT_FILTER = ["==", ["get", "pnct"], true];
const BODY_BG = { light: "rgb(246, 246, 244)", dark: "rgb(12, 12, 12)" };

/** Records every basemap style request ("/styles/" URLs) in order. Call before page.goto. */
function trackStyleRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/styles/")) urls.push(req.url());
  });
  return urls;
}

/** Console warnings (MapLibre logs style problems, such as a missing sprite image, as warnings). */
function trackWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  return warnings;
}

const filterOf = (page: Page, layer: string) => page.evaluate((id) => window.pnctMap.getFilter(id), layer);

/** The PNCT colour of the parish-fill layer: the fourth colour stop of its ["case", ...] expression, [4]. */
const pnctFill = (page: Page) => page.evaluate(() => window.pnctMap.getPaintProperty("parish-fill", "fill-color")[4]);

/** Which of the app layers exist in the current style. */
const presentLayers = (page: Page) =>
  page.evaluate((ids) => ids.filter((id) => window.pnctMap.getLayer(id)), APP_LAYERS);

/** Colour of the basemap's background layer (the "land" colour under the data layers). */
const basemapBackground = (page: Page) =>
  page.evaluate(
    () => window.pnctMap.getStyle().layers.find((l: { type: string }) => l.type === "background").paint["background-color"],
  );

const cssOf = (page: Page, selector: string, property: string) =>
  page.evaluate(([sel, prop]) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop), [selector, property]);

const featureState = (page: Page, id: number) =>
  page.evaluate((fid) => window.pnctMap.getFeatureState({ source: "parishes", id: fid }), id);

const camera = (page: Page) =>
  page.evaluate(() => ({ center: window.pnctMap.getCenter().toArray() as [number, number], zoom: window.pnctMap.getZoom() as number }));

const hash = (page: Page): string => new URL(page.url()).hash;

/** Turns "Only PNCT" on and waits until the parish layers carry the focus filter. */
async function enableFocus(page: Page): Promise<void> {
  await page.locator("#only-pnct").check();
  await expect.poll(() => filterOf(page, "parish-fill")).toEqual(PNCT_FILTER);
}

test.describe("light (default)", () => {
  test("loads the positron basemap and the light palette, with no console warnings", async ({ page }) => {
    const errors = trackErrors(page);
    const warnings = trackWarnings(page);
    const styles = trackStyleRequests(page);
    // z12, a view with roads: positron's road-shield layers start at z11 (road_shield_us at z12).
    await page.goto("/#map=12/41.19/-7.72");
    await waitForParishes(page);

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.locator("body")).toHaveAttribute("data-map-theme", "light");
    expect(styles).toContain(STYLE_URLS.light);
    expect(styles).not.toContain(STYLE_URLS.dark);
    expect(await pnctFill(page)).toBe(PALETTES.light.pnct);
    expect(await cssOf(page, "body", "background-color")).toBe(BODY_BG.light);
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light dark");
    // Fully drawn, basemap included, so every road-shield filter has run on the view's roads. Roads without
    // a ref have no ref_length; basemap.ts patches those filters, so MapLibre must not warn.
    await waitForFullIdle(page);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe("dark", () => {
  test.use({ colorScheme: "dark" });

  test("loads the dark basemap first, with every app layer and no console warnings", async ({ page }) => {
    const errors = trackErrors(page);
    const warnings = trackWarnings(page);
    const styles = trackStyleRequests(page);
    // z11: Dark Matter only draws its wood pattern (landcover_wood) from z10.
    await page.goto("/#map=11/41.27/-8.07");
    await waitForParishes(page);

    // The theme is read before the map is created, so a dark-mode visitor never fetches the light style.
    expect(styles[0]).toBe(STYLE_URLS.dark);
    expect(styles).not.toContain(STYLE_URLS.light);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("body")).toHaveAttribute("data-map-theme", "dark");
    expect(await presentLayers(page)).toEqual(APP_LAYERS);
    expect(await pnctFill(page)).toBe(PALETTES.dark.pnct);
    expect(await basemapBackground(page)).toBe("rgb(12,12,12)");
    expect(await cssOf(page, "body", "background-color")).toBe(BODY_BG.dark);
    // The legend is translucent (rgba), so compare the colour channels rather than the exact string.
    expect(await cssOf(page, ".legend", "background-color")).not.toMatch(/^rgba?\(255, 255, 255/);
    // Fully drawn, basemap included, so every sprite image the view needs has been requested. The dark
    // style's "wood-pattern" is not in its sprite; main.ts resolves it to a blank image, so MapLibre must not warn.
    await waitForFullIdle(page);
    expect(await page.evaluate(() => window.pnctMap.hasImage("wood-pattern"))).toBe(true);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("selection and focus mode work in dark", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`/#f=${VILARINHO}`);
    await waitForParishView(page);

    await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires");
    expect(await featureState(page, Number(VILARINHO))).toEqual({ selected: true });
    await enableFocus(page);
    await waitForParishView(page);
    expect(await featureState(page, Number(VILARINHO))).toEqual({ selected: true });
    expect(errors).toEqual([]);
  });
});

test("live switch light → dark keeps camera, selection, focus and layers", async ({ page }) => {
  const errors = trackErrors(page);
  const styles = trackStyleRequests(page);
  await page.goto(`/#f=${VILARINHO}`);
  await waitForParishView(page);
  await enableFocus(page);
  await waitForParishView(page);
  const before = await camera(page);
  expect(styles).not.toContain(STYLE_URLS.dark);

  // Same state check after each switch: nothing the viewer set up may be lost with the old style.
  const expectStateKept = async (palette: "light" | "dark") => {
    const now = await camera(page);
    expect(Math.abs(now.center[0] - before.center[0])).toBeLessThan(1e-6);
    expect(Math.abs(now.center[1] - before.center[1])).toBeLessThan(1e-6);
    expect(Math.abs(now.zoom - before.zoom)).toBeLessThan(1e-6);
    expect(await featureState(page, Number(VILARINHO))).toEqual({ selected: true });
    expect(await filterOf(page, "parish-fill")).toEqual(PNCT_FILTER);
    expect(await presentLayers(page)).toEqual(APP_LAYERS);
    expect(await pnctFill(page)).toBe(PALETTES[palette].pnct);
    await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires");
    expect(hash(page)).toContain(`f=${VILARINHO}`);
    expect(hash(page)).toContain("focus=1");
  };

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute("data-map-theme", "dark");
  expect(styles).toContain(STYLE_URLS.dark);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectStateKept("dark");

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveAttribute("data-map-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expectStateKept("light");
  await waitForParishView(page);
  expect(errors).toEqual([]);
});

test("live switch at country view keeps the concelho level", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishView(page);
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-level", "concelho");
  const zoom0 = (await camera(page)).zoom;
  const minZoom0 = await page.evaluate(() => window.pnctMap.getMinZoom());

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(body).toHaveAttribute("data-map-theme", "dark");

  expect(Math.abs((await camera(page)).zoom - zoom0)).toBeLessThan(1e-6);
  await expect(body).toHaveAttribute("data-level", "concelho");
  expect(await page.evaluate(() => window.pnctMap.getMinZoom())).toBe(minZoom0);
  expect(errors).toEqual([]);
});
