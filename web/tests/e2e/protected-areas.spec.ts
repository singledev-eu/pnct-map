import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForFullIdle, waitForParishes, waitForParishView } from "./helpers";

// Protected-areas overlays (RNAP, Natura 2000): legend toggles (off by default, `pa=` in the hash),
// lazy-loaded overlay data, the panel's protection shares (shown whatever the toggles), selection
// through the overlays, focus mode, both themes and the phone legend. The map is window.pnctMap.
const CATS = ["rnap", "natura"];
const VILAR_DA_VEIGA = "031017"; // inside Peneda-Gerês: 100% RNAP and Natura
const SANTA_MARIA_MAIOR = "110665"; // central Lisbon: 0%
const TERRAS_DE_BOURO = "0310";
const GERES = "map=11/41.74/-8.13"; // Vilar da Veiga and its neighbours, at parish level
const PNCT_FILTER = ["==", ["get", "pnct"], true];

const hash = (page: Page) => new URL(page.url()).hash;
/** A fresh app load (a goto that changes only the hash would not reload the page). */
async function reopen(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}
const toggle = (page: Page, cat: string) => page.getByTestId(`overlay-${cat}`);
const visibility = (page: Page, cat: string) =>
  page.evaluate((c) => (window.pnctMap.getLayer(`protected-${c}-fill`) ? window.pnctMap.getLayoutProperty(`protected-${c}-fill`, "visibility") : "absent"), cat);
const filterOf = (page: Page, layer: string) => page.evaluate((id) => window.pnctMap.getFilter(id), layer);

/** Console warnings (MapLibre logs style problems, such as a missing pattern image, as warnings). */
function trackWarnings(page: Page): string[] {
  const warnings: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "warning") warnings.push(msg.text());
  });
  return warnings;
}

/** Requests for the overlay or shares data, in order. Call before page.goto. */
function trackDataRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (req) => {
    if (/\/assets\/(protected\.topo|protection)-/.test(req.url())) urls.push(new URL(req.url()).pathname);
  });
  return urls;
}

/** Waits until exactly `cats` are shown (main.ts sets body data-overlays once their layers are in). */
async function expectOverlays(page: Page, cats: string[]): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-overlays", [...cats].sort().join(","));
  for (const cat of CATS) await expect.poll(() => visibility(page, cat)).toBe(cats.includes(cat) ? "visible" : "none");
}

/** Rendered overlay features of `cat` (their `pnct` flags). */
const renderedOverlay = (page: Page, cat: string) =>
  page.evaluate((c) => window.pnctMap.queryRenderedFeatures({ layers: [`protected-${c}-fill`] }).map((f: { properties: { pnct: boolean } }) => f.properties.pnct), cat);

/**
 * Page coordinates of a point well inside the feature of `layer` whose `key` is `value`, found by
 * sampling a grid over its rendered bbox. Points under the panel or another DOM overlay are skipped.
 */
async function pointInside(page: Page, layer: string, key: string, value: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ([layer, key, value]) => {
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
      for (const f of map.queryRenderedFeatures({ layers: [layer] })) if (f.properties[key] === value) grow(f.geometry.coordinates);
      const steps = 24;
      for (let i = 1; i < steps; i++) {
        for (let j = 1; j < steps; j++) {
          const x = minX + ((maxX - minX) * i) / steps;
          const y = minY + ((maxY - minY) * j) / steps;
          if (x < 0 || y < 0 || x > canvas.clientWidth - 420 || y > canvas.clientHeight) continue;
          const top = document.elementFromPoint(origin.left + x, origin.top + y);
          if (top !== canvas && !canvas.contains(top)) continue;
          // The point and its 3 px neighbourhood: at country zoom a concelho is a few pixels wide, and a click rounds.
          const hits = [[0, 0], [-3, -3], [3, -3], [-3, 3], [3, 3]].every(
            ([dx, dy]) => map.queryRenderedFeatures([x + dx, y + dy], { layers: [layer] })[0]?.properties[key] === value,
          );
          if (hits) return { x: origin.left + x, y: origin.top + y };
        }
      }
      return null;
    },
    [layer, key, value],
  );
  expect(point, `a visible point inside ${layer} ${key}=${value}`).not.toBeNull();
  return point!;
}

test("overlays are off by default and their data is not loaded", async ({ page }) => {
  const errors = trackErrors(page);
  const requests = trackDataRequests(page);
  await page.goto("/");
  await waitForParishView(page);
  await expect(page.locator("body")).toHaveAttribute("data-overlays", "");
  for (const cat of CATS) {
    await expect(toggle(page, cat)).not.toBeChecked();
    expect(await visibility(page, cat)).toBe("absent");
  }
  await expect(page.getByTestId("overlay-note")).toContainText("Indicator, not a verdict — check the municipal PDM.");
  await expect(page.getByTestId("overlay-note")).toContainText("ICNF");
  await expect(page.getByTestId("overlay-note")).toContainText("EEA");
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("the toggles show and hide each overlay and keep the hash in step", async ({ page }) => {
  const errors = trackErrors(page);
  const requests = trackDataRequests(page);
  await page.goto(`/#${GERES}`);
  await waitForParishView(page);

  await toggle(page, "rnap").check();
  await expectOverlays(page, ["rnap"]);
  expect(hash(page)).toMatch(/[#&]pa=rnap(&|$)/);
  await waitForParishView(page);
  await expect.poll(async () => (await renderedOverlay(page, "rnap")).length).toBeGreaterThan(0);

  await toggle(page, "natura").check();
  await expectOverlays(page, ["natura", "rnap"]);
  expect(hash(page)).toMatch(/[#&]pa=rnap,natura(&|$)/);
  await expect.poll(async () => (await renderedOverlay(page, "natura")).length).toBeGreaterThan(0);

  await toggle(page, "rnap").uncheck();
  await expectOverlays(page, ["natura"]);
  expect(hash(page)).toMatch(/[#&]pa=natura(&|$)/);
  await toggle(page, "natura").uncheck();
  await expectOverlays(page, []);
  expect(hash(page)).not.toContain("pa=");
  // The overlay file is fetched once, on the first toggle.
  expect(requests.filter((u) => u.includes("protected.topo"))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("a link with pa= opens with those overlays on", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#${GERES}&pa=natura`);
  await waitForParishes(page);
  await expectOverlays(page, ["natura"]);
  await expect(toggle(page, "natura")).toBeChecked();
  await expect(toggle(page, "rnap")).not.toBeChecked();
  expect(errors).toEqual([]);
});

test("the panel shows the protection shares with the overlays off", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#f=${VILAR_DA_VEIGA}`);
  await waitForParishes(page);
  const summary = page.getByTestId("protection-summary");
  await expect(summary).toHaveText("Under protection: 100% (RNAP 100%, Natura 100%)");
  await expect(summary).toHaveAttribute("data-rnap", "100");
  await expect(page.getByTestId("protection-areas")).toContainText("Peneda-Gerês · Parque Nacional");
  await expect(page.getByTestId("protection")).toContainText("check the municipal PDM");

  await reopen(page, `/#f=${SANTA_MARIA_MAIOR}`);
  await waitForParishes(page);
  await expect(page.getByTestId("protection-summary")).toHaveText("Under protection: 0% (RNAP 0%, Natura 0%)");
  await expect(page.getByTestId("protection-areas")).toHaveCount(0);

  await reopen(page, `/#c=${TERRAS_DE_BOURO}`);
  await waitForParishes(page);
  await expect(page.getByTestId("panel-title")).toHaveText("Terras de Bouro");
  const any = Number(await page.getByTestId("protection-summary").getAttribute("data-any"));
  expect(any).toBeGreaterThan(30);
  expect(any).toBeLessThan(100);
  await expect(page.getByTestId("protection-areas")).toContainText("Peneda-Gerês");
  expect(errors).toEqual([]);
});

test("parish and concelho selection still work with both overlays on", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#${GERES}&pa=rnap,natura`);
  await waitForParishView(page);
  await expectOverlays(page, CATS);
  await expect(page.locator("body")).toHaveAttribute("data-level", "parish");
  // The point lies under both overlays (the parish is fully protected): the click must reach the parish.
  const p = await pointInside(page, "parish-fill", "dicofre", VILAR_DA_VEIGA);
  expect(await page.evaluate(([x, y]) => window.pnctMap.queryRenderedFeatures([x, y]).map((f: { layer: { id: string } }) => f.layer.id), [p.x, p.y])).toEqual(
    expect.arrayContaining(["protected-rnap-fill", "protected-natura-fill"]),
  );
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId("panel-title")).toHaveText("Vilar da Veiga");
  expect(hash(page)).toMatch(new RegExp(`[#&]f=${VILAR_DA_VEIGA}(&|$)`));

  // Country view: a click selects the concelho, never a parish, overlays or not.
  await reopen(page, "/#pa=rnap,natura");
  await waitForParishView(page);
  await expectOverlays(page, CATS);
  await expect(page.locator("body")).toHaveAttribute("data-level", "concelho");
  const c = await pointInside(page, "concelho-fill", "code", TERRAS_DE_BOURO);
  await page.mouse.click(c.x, c.y);
  await expect(page.getByTestId("panel-title")).toHaveText("Terras de Bouro");
  expect(hash(page)).toMatch(new RegExp(`[#&]c=${TERRAS_DE_BOURO}(&|$)`));
  expect(hash(page)).not.toMatch(/[#&]f=/);
  expect(errors).toEqual([]);
});

test("focus mode keeps only the overlay parts inside PNCT territory", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#pa=rnap,natura&map=8.6/41.55/-7.9");
  await waitForParishView(page);
  await expectOverlays(page, CATS);
  for (const cat of CATS) expect(await renderedOverlay(page, cat)).toContain(false);

  await page.locator("#only-pnct").check();
  for (const cat of CATS) {
    await expect.poll(() => filterOf(page, `protected-${cat}-fill`)).toEqual(PNCT_FILTER);
    await expect.poll(() => filterOf(page, `protected-${cat}-line`)).toEqual(PNCT_FILTER);
  }
  await waitForParishView(page);
  for (const cat of CATS) {
    const flags = await renderedOverlay(page, cat);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every(Boolean)).toBe(true);
  }
  await page.locator("#only-pnct").uncheck();
  for (const cat of CATS) await expect.poll(() => filterOf(page, `protected-${cat}-fill`)).toBeUndefined();
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: overlays draw with no console warnings`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors = trackErrors(page);
    const warnings = trackWarnings(page);
    await page.goto(`/#map=12/41.74/-8.13&pa=rnap,natura&f=${VILAR_DA_VEIGA}`);
    await waitForParishes(page);
    await expect(page.locator("body")).toHaveAttribute("data-map-theme", scheme);
    await expectOverlays(page, CATS);
    await expect(page.getByTestId("protection-summary")).toBeVisible();
    await waitForFullIdle(page);
    expect(await page.evaluate(() => window.pnctMap.hasImage("natura-hatch"))).toBe(true);
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("a live theme switch keeps the overlays", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#${GERES}&pa=rnap,natura`);
  await waitForParishes(page);
  await expectOverlays(page, CATS);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveAttribute("data-map-theme", "dark");
  await expectOverlays(page, CATS);
  expect(await page.evaluate(() => window.pnctMap.getPaintProperty("protected-rnap-line", "line-color"))).toBe("#fb923c");
  await page.locator('[data-testid="overlay-rnap"]').uncheck();
  await expectOverlays(page, ["natura"]);
  expect(errors).toEqual([]);
});

test("the map attribution and the About panel credit ICNF and EEA", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  await expect(attribution.getByRole("link", { name: /ICNF/ })).toHaveAttribute("href", /icnf\.pt/);
  await expect(attribution.getByRole("link", { name: /EEA/ })).toHaveAttribute("href", /eea\.europa\.eu/);
  await page.locator("#about-open").click();
  const about = page.getByTestId("about-protected");
  await expect(about).toContainText("reuse terms not confirmed");
  await expect(about.getByRole("link", { name: "CC BY 4.0" })).toBeVisible();
});

test.describe("phone portrait (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the collapsible legend holds the toggles, fits the screen and still collapses", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishView(page);
    await expect(page.locator("#legend-toggle")).toHaveAttribute("aria-expanded", "false");
    await expect(toggle(page, "natura")).toBeHidden();

    await page.locator("#legend-toggle").tap();
    const row = page.locator(".legend-overlay").filter({ has: toggle(page, "natura") });
    await expect(row).toBeVisible();
    expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(32); // tap target
    const legend = (await page.locator(".legend").boundingBox())!;
    expect(legend.y).toBeGreaterThanOrEqual(0);
    expect(legend.y + legend.height).toBeLessThanOrEqual(844);
    expect(legend.x + legend.width).toBeLessThanOrEqual(390);

    await row.tap();
    await expectOverlays(page, ["natura"]);
    await page.locator("#legend-toggle").tap();
    await expect(page.locator("#legend-toggle")).toHaveAttribute("aria-expanded", "false");
    await expectOverlays(page, ["natura"]); // collapsing the legend doesn't touch the overlays

    // The bottom-sheet credit carries the overlay sources too.
    await reopen(page, `/#f=${VILAR_DA_VEIGA}&pa=natura`);
    await waitForParishes(page);
    await expect(page.getByTestId("sheet-credit").getByRole("link", { name: /EEA/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
