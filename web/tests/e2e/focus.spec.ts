import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// Focus mode ("Only PNCT"): layer filters, hover/click, search, hash handling, district select.
// The map is exposed as window.pnctMap (MapLibre Map); it is only inspected inside page.evaluate.
const AROUND_AMARANTE = "/#map=11/41.27/-8.07"; // PNCT and non-PNCT parishes in view
const FREGIM = "130112"; // non-PNCT parish, Amarante (partly PNCT: 10 of 26)
const VILARINHO = "170810"; // PNCT parish: Vilarinho dos Freires
const PARISH_LAYERS = ["parish-fill", "parish-line", "parish-highlight"];
const PNCT_FILTER = ["==", ["get", "pnct"], true];
const CONCELHO_FILTER = [">", ["get", "pnct_count"], 0];

/** Opens the app at `url` and waits until the parishes in view are drawn (not the basemap). */
async function openMap(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForParishView(page);
}

/** Clicks the "Only PNCT" checkbox to `on` and waits until the filter is applied and the parish tiles have been re-drawn. */
async function setFocus(page: Page, on: boolean): Promise<void> {
  await page.locator("#only-pnct").setChecked(on);
  await expect.poll(() => filterOf(page, "parish-fill")).toEqual(on ? PNCT_FILTER : undefined);
  await waitForParishView(page);
}

const hash = (page: Page): string => new URL(page.url()).hash;
const filterOf = (page: Page, layer: string) => page.evaluate((id) => window.pnctMap.getFilter(id), layer);

/** pnct flags of the parish-fill features currently rendered. */
function renderedPnctFlags(page: Page): Promise<boolean[]> {
  return page.evaluate(() =>
    window.pnctMap.queryRenderedFeatures({ layers: ["parish-fill"] }).map((f: { properties: { pnct: boolean } }) => f.properties.pnct),
  );
}

/**
 * Page coordinates of a point inside the given parish, found by sampling a grid over its rendered
 * bbox (ring vertices alone can fall outside concave shapes). Call with focus OFF. Points under the
 * side panel or any other overlay are skipped, so the point can be hovered and clicked.
 */
async function pointInside(page: Page, dicofre: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((code) => {
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
    for (const f of map.queryRenderedFeatures({ layers: ["parish-fill"] })) {
      if (f.properties.dicofre === code) grow(f.geometry.coordinates);
    }
    const steps = 24;
    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        const x = minX + ((maxX - minX) * i) / steps;
        const y = minY + ((maxY - minY) * j) / steps;
        if (x < 0 || y < 0 || x > canvas.clientWidth - 420 || y > canvas.clientHeight) continue; // keep clear of the panel
        const top = document.elementFromPoint(origin.left + x, origin.top + y);
        if (top !== canvas && !canvas.contains(top)) continue;
        if (map.queryRenderedFeatures([x, y], { layers: ["parish-fill"] })[0]?.properties.dicofre === code) {
          return { x: origin.left + x, y: origin.top + y };
        }
      }
    }
    return null;
  }, dicofre);
  expect(point, `a visible point inside parish ${dicofre}`).not.toBeNull();
  return point!;
}

/** Moves the pointer away first so the map always sees a fresh mousemove at the target. */
async function hoverAt(page: Page, p: { x: number; y: number }): Promise<void> {
  await page.mouse.move(p.x + 60, p.y + 60);
  await page.mouse.move(p.x, p.y, { steps: 3 });
}

const cursor = (page: Page) => page.evaluate(() => window.pnctMap.getCanvas().style.cursor);
const searchOptions = (page: Page) => page.locator('#search-list li[role="option"]:not(.search-empty)');

test("toggling focus mode hides non-PNCT fill and outlines", async ({ page }) => {
  const errors = trackErrors(page);
  await openMap(page, AROUND_AMARANTE);

  for (const id of [...PARISH_LAYERS, "concelho-line"]) expect(await filterOf(page, id), id).toBeUndefined();
  await expect.poll(() => renderedPnctFlags(page)).toContain(false);
  await expect(page.locator(".legend-row-other")).toBeVisible();

  await setFocus(page, true);
  for (const id of PARISH_LAYERS) expect(await filterOf(page, id), id).toEqual(PNCT_FILTER);
  expect(await filterOf(page, "concelho-line")).toEqual(CONCELHO_FILTER);
  await expect.poll(async () => {
    const flags = await renderedPnctFlags(page);
    return flags.length > 0 && !flags.includes(false);
  }).toBe(true);
  expect(hash(page)).toContain("focus=1");
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  await expect(page.locator(".legend-row-other")).toBeHidden();

  await setFocus(page, false);
  for (const id of [...PARISH_LAYERS, "concelho-line"]) expect(await filterOf(page, id), id).toBeUndefined();
  await expect.poll(() => renderedPnctFlags(page)).toContain(false);
  expect(hash(page)).not.toContain("focus=1");
  await expect(page.locator(".legend-row-other")).toBeVisible();
  expect(errors).toEqual([]);
});

test("hover and click on a non-PNCT parish are ignored in focus mode, and work again when off", async ({ page }) => {
  const errors = trackErrors(page);
  await openMap(page, AROUND_AMARANTE);
  const fregim = await pointInside(page, FREGIM);
  const tooltip = page.locator("#tooltip");
  const title = page.getByTestId("panel-title");

  // Focus off: tooltip and selection work.
  await hoverAt(page, fregim);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Fregim");
  await page.mouse.click(fregim.x, fregim.y);
  await expect(title).toHaveText("Fregim");
  expect(hash(page)).toContain(`f=${FREGIM}`);

  // Turning focus on closes the panel of a parish that is now hidden.
  await setFocus(page, true);
  await expect(page.getByTestId("panel")).toBeHidden();
  expect(hash(page)).not.toMatch(/[#&]f=/);

  await hoverAt(page, fregim);
  await expect(tooltip).toBeHidden();
  expect(await cursor(page)).toBe("");
  await page.mouse.click(fregim.x, fregim.y);
  await expect(page.getByTestId("panel")).toBeHidden();
  expect(hash(page)).not.toMatch(/[#&]f=/);

  // Focus off again: back to normal.
  await setFocus(page, false);
  await hoverAt(page, fregim);
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Fregim");
  await page.mouse.click(fregim.x, fregim.y);
  await expect(title).toHaveText("Fregim");
  expect(hash(page)).toContain(`f=${FREGIM}`);
  expect(errors).toEqual([]);
});

test("search excludes non-PNCT parishes and PNCT-less concelhos in focus mode", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishes(page);
  const input = page.locator("#search-input");

  await input.fill("Fregim");
  await expect(searchOptions(page).filter({ hasText: "Fregim" }).first()).toBeVisible();

  await setFocus(page, true);
  await input.fill("Fregim");
  await expect(page.locator("#search-list .search-empty")).toHaveText("No matches");
  await expect(searchOptions(page)).toHaveCount(0);

  // Gondomar has no PNCT parishes, so its concelho entry is gone too.
  await input.fill("Gondomar");
  await expect(searchOptions(page).filter({ hasText: "Concelho" })).toHaveCount(0);

  // Amarante is partly PNCT and stays selectable.
  await input.fill("Amarante");
  await searchOptions(page).filter({ hasText: /Concelho/ }).first().click();
  await expect(page.getByTestId("panel-title")).toHaveText("Amarante");
  expect(errors).toEqual([]);
});

test("a link to a non-PNCT parish with focus=1 opens with focus off", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#f=${FREGIM}&focus=1`);
  await waitForParishes(page);
  await expect(page.getByTestId("panel-title")).toHaveText("Fregim");
  await expect(page.locator("#only-pnct")).not.toBeChecked();
  expect(hash(page)).not.toContain("focus=1");
  await expect(page.locator("body")).not.toHaveClass(/focus-mode/);
  expect(errors).toEqual([]);
});

test("focus mode survives a reload", async ({ page }) => {
  const errors = trackErrors(page);
  const expectFocusOn = async () => {
    await waitForParishes(page);
    await expect(page.locator("#only-pnct")).toBeChecked();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    expect(await filterOf(page, "parish-fill")).toEqual(PNCT_FILTER);
  };

  await page.goto("/#focus=1");
  await expectFocusOn();
  await page.reload();
  await expectFocusOn();

  // A PNCT parish does not switch focus off.
  await page.goto(`/#f=${VILARINHO}&focus=1`);
  await page.reload();
  await expectFocusOn();
  await expect(page.getByTestId("panel-title")).toHaveText("Vilarinho dos Freires");
  expect(errors).toEqual([]);
});

test("the district list disables Lisboa in focus mode and drops it from the hash", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#focus=1&d=Lisboa");
  await waitForParishes(page);
  await expect(page.locator("#only-pnct")).toBeChecked();
  await expect(page.locator("#district-select")).toHaveValue("");
  expect(hash(page)).not.toMatch(/[#&]d=/);
  await expect(page.locator('#district-select option[value="Lisboa"]')).toBeDisabled();

  await setFocus(page, false);
  await expect(page.locator('#district-select option[value="Lisboa"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test("legacy #pnct=1 turns focus mode on and is rewritten to focus=1", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#pnct=1");
  await waitForParishes(page);
  await expect(page.locator("#only-pnct")).toBeChecked();
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  expect(hash(page)).toContain("focus=1");
  expect(hash(page)).not.toContain("pnct=1");
  expect(errors).toEqual([]);
});
