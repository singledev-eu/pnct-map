import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { parseShapeParam } from "../../src/idealista";

// Screenshots go to the ignored test-results/ folder (cleared by Playwright on each run), so tests
// never dirty the tree. docs/screenshots/ holds hand-picked copies for the docs.
const SHOTS = fileURLToPath(new URL("../../test-results/screenshots/", import.meta.url));

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function waitForMap(page: Page): Promise<void> {
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", { timeout: 30_000 });
}

async function waitForIdle(page: Page): Promise<void> {
  // Let any camera animation start, then wait for MapLibre's idle event.
  await page.waitForTimeout(250);
  await expect(page.locator("body")).toHaveAttribute("data-map-idle", "true", { timeout: 30_000 });
}

async function searchAndPick(page: Page, query: string, optionText: RegExp): Promise<void> {
  const input = page.locator("#search-input");
  await input.fill(query);
  await page.getByRole("option").filter({ hasText: optionText }).first().click();
}

test("map loads without console errors", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  await expect(page.locator("#map canvas")).toBeVisible();
  await waitForIdle(page);
  await page.screenshot({ path: `${SHOTS}desktop-national.png` });
  expect(errors).toEqual([]);
});

test("searching Loulé selects the concelho with 6 PNCT parishes", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  await searchAndPick(page, "Loulé", /Concelho/);

  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("panel-title")).toHaveText("Loulé");
  const count = panel.getByTestId("pnct-count");
  await expect(count).toHaveAttribute("data-pnct", "6");
  await expect(count).toContainText(/6 of \d+ parishes/);
  await expect(panel.getByTestId("pnct-parish-list").locator("li")).toHaveCount(6);
  await expect(page).toHaveURL(/[#&]c=0808(&|$)/);
  expect(errors).toEqual([]);
});

test("selecting 130740 opens Várzea, Aliviada e Folhada and survives a reload", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForMap(page);
  await searchAndPick(page, "Várzea, Aliviada", /Marco de Canaveses/);

  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("panel-title")).toHaveText("Várzea, Aliviada e Folhada");
  await expect(panel).toContainText("130740");
  await expect(panel.getByTestId("pnct-status")).toHaveText("PNCT territory");
  await expect(page).toHaveURL(/[#&]f=130740(&|$)/);
  await waitForIdle(page);
  await expect(page).toHaveURL(/map=/);

  const before = new URL(page.url()).hash;
  await page.reload();
  await waitForMap(page);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Várzea, Aliviada e Folhada");
  // The restored map view matches the shared one.
  const mapParam = (hash: string) => new URLSearchParams(hash.slice(1)).get("map");
  expect(mapParam(new URL(page.url()).hash)).toBe(mapParam(before));
  expect(errors).toEqual([]);
});

test("130740 gets an Idealista polygon link that follows the search selector", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/#f=130740");
  await waitForMap(page);
  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("panel-title")).toHaveText("Várzea, Aliviada e Folhada");

  const link = panel.getByTestId("property-link").first();
  await expect(link).toHaveText(/Search this parish on Idealista/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  // Partial concelho (Marco de Canaveses): the polygon link is the only one.
  await expect(panel.getByTestId("property-link")).toHaveCount(1);

  const href = (await link.getAttribute("href"))!;
  expect(href).toMatch(/^https:\/\/www\.idealista\.pt\/areas\/comprar-terrenos\/mapa-google\?shape=%28%28/);
  // The shape decodes to a closed ring inside 130740's bounding box (CAOP 2025, full resolution).
  const ring = parseShapeParam(new URL(href).search.replace(/^\?shape=/, ""));
  expect(ring.length).toBeGreaterThanOrEqual(4);
  expect(ring[0]).toEqual(ring[ring.length - 1]);
  for (const [lat, lng] of ring) {
    expect(lat).toBeGreaterThanOrEqual(41.18031 - 1e-5);
    expect(lat).toBeLessThanOrEqual(41.22584 + 1e-5);
    expect(lng).toBeGreaterThanOrEqual(-8.14416 - 1e-5);
    expect(lng).toBeLessThanOrEqual(-8.04128 + 1e-5);
  }

  // Land filters only show for Terrenos and add a /com-... segment.
  const options = panel.getByTestId("search-options");
  await options.getByRole("checkbox", { name: "Urbanizável", exact: true }).check();
  await expect(link).toHaveAttribute("href", /\/areas\/comprar-terrenos\/com-terreno-urbanizavel\/mapa-google\?shape=/);

  await options.getByRole("radio", { name: "Arrendar" }).check();
  await options.getByRole("radio", { name: "Casas" }).check();
  await expect(options.getByRole("checkbox", { name: "Urbanizável", exact: true })).toBeHidden();
  await expect(link).toHaveAttribute("href", /^https:\/\/www\.idealista\.pt\/areas\/arrendar-casas\/mapa-google\?shape=/);
  const shapeOf = (u: string | null) => new URL(u!).search;
  expect(shapeOf(await link.getAttribute("href"))).toBe(shapeOf(href));
  await expect(page).toHaveURL(/[#&]op=arrendar(&|$)/);
  await expect(page).toHaveURL(/[#&]t=casas(&|$)/);

  // The selector survives a reload via the hash.
  await page.reload();
  await waitForMap(page);
  await expect(page.getByTestId("property-link").first()).toHaveAttribute("href", /\/areas\/arrendar-casas\/mapa-google/);
  expect(errors).toEqual([]);
});

test("whole-PNCT concelho shows the municipality link; non-PNCT parish shows none", async ({ page }) => {
  await page.goto("/#f=010402"); // Alvarenga, Arouca: the whole concelho is PNCT
  await waitForMap(page);
  const panel = page.getByTestId("panel");
  await expect(panel.getByTestId("panel-title")).toHaveText("Alvarenga");
  await expect(panel.getByTestId("property-link")).toHaveCount(2);
  await expect(panel.getByTestId("property-link").nth(1)).toHaveAttribute("href", "https://www.idealista.pt/comprar-terrenos/arouca/mapa-google");

  await panel.getByRole("button", { name: "Show all of Arouca" }).click();
  await expect(panel.getByTestId("panel-title")).toHaveText("Arouca");
  await expect(panel.getByTestId("pnct-count")).toHaveText(/^All \d+ parishes are PNCT\.$/);
  await expect(panel.getByTestId("pnct-parish-list")).toBeHidden();
  await panel.getByText("Show all", { exact: true }).click();
  await expect(panel.getByTestId("pnct-parish-list")).toBeVisible();
  await expect(panel.getByTestId("property-link")).toHaveCount(1);

  await page.goto("/#f=110601"); // Ajuda, Lisboa: not PNCT
  await page.reload();
  await waitForMap(page);
  await expect(panel.getByTestId("panel-title")).toHaveText("Ajuda");
  await expect(panel.getByTestId("property-link")).toHaveCount(0);
  await expect(panel.getByTestId("property-search")).toContainText("isn't in the PNCT list");
});

test("a parish link with only a dicofre in the hash opens and frames it", async ({ page }) => {
  await page.goto("/#f=130740");
  await waitForMap(page);
  await expect(page.getByTestId("panel").getByTestId("panel-title")).toHaveText("Várzea, Aliviada e Folhada");
  await waitForIdle(page);
  const zoom = Number(new URLSearchParams(new URL(page.url()).hash.slice(1)).get("map")?.split("/")[0]);
  expect(zoom).toBeGreaterThan(10);
});

test("clicking a parish on the map selects it (Ponte de Lima screenshot)", async ({ page }) => {
  await page.goto("/");
  await waitForMap(page);
  await searchAndPick(page, "Gaifar", /Ponte de Lima/);
  await expect(page.getByTestId("panel-title")).toHaveText("Gaifar");
  await waitForIdle(page);

  // Close the panel (camera stays), then click where fitBounds centred the parish:
  // the middle of the padded area {top: 80, left: 40, bottom: 40, right: 400}.
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.getByTestId("panel")).toBeHidden();
  await page.mouse.click(40 + (1440 - 40 - 400) / 2, 80 + (900 - 80 - 40) / 2);
  await expect(page.getByTestId("panel-title")).toHaveText("Gaifar");
  await expect(page).toHaveURL(/[#&]f=160761(&|$)/);

  await page.mouse.move(1250, 600); // over the panel: no hover state, no tooltip
  await expect(page.locator("#tooltip")).toBeHidden();
  await waitForIdle(page);
  await page.screenshot({ path: `${SHOTS}desktop-ponte-de-lima.png` });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

  test("screenshot: bottom sheet open", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#f=160763");
    await waitForMap(page);
    const panel = page.getByTestId("panel");
    await expect(panel.getByTestId("panel-title")).toHaveText("Vilar das Almas");
    const box = await panel.boundingBox();
    expect(box && box.y > 844 / 3).toBeTruthy();
    await expect(panel.locator(".sheet-credit")).toBeVisible();
    await expect(panel.locator(".sheet-credit")).toContainText("CC BY 4.0");
    await waitForIdle(page);
    await page.screenshot({ path: `${SHOTS}mobile-panel.png` });
    expect(errors).toEqual([]);
  });
});
