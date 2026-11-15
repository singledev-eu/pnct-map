import { expect, searchAndPick, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// The land check (src/landcheck.ts, panel.ts showCheck): a report for one point, shared as #chk=lat,lon
// (or /check?lat=..&lon=..). The expected hazard classes are the ICNF source cells
// (tests/test_landcheck.py has the same points).
const PEDROGAO = "39.92681,-8.15187"; // Pedrógão Grande, very high (5)
const PORTO = "41.14960,-8.61100"; // Porto centre, built-up: no class
const SEA = "39.50000,-10.00000";

const hazard = (page: import("@playwright/test").Page) => page.getByTestId("check-hazard");

test("a link reports PNCT, the hazard class, the Idealista links and the sources", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`/#chk=${PEDROGAO}`);
  await waitForParishes(page);
  await expect(page.getByTestId("panel-title")).toHaveText("Pedrógão Grande");
  await expect(page.getByTestId("check-pnct")).toHaveAttribute("data-pnct", "true");
  await expect(hazard(page)).toHaveAttribute("data-value", "5");
  await expect(hazard(page)).toHaveText("Very high (5 of 5)");
  await expect(page.getByTestId("property-link").first()).toBeVisible();
  await expect(page.getByTestId("check-not-covered")).toContainText("REN");
  await expect(page.getByTestId("check-sources")).toContainText("ICNF");
  await expect(page.getByTestId("check-disclaimer")).toHaveText("Indicative only. Confirm with the câmara (PDM, licensing) before buying.");
  await expect(page.getByTestId("check-link")).toHaveValue(new RegExp(`#chk=${PEDROGAO}`));
  await expect(page.getByTestId("check-marker")).toBeVisible();
  expect(errors).toEqual([]);
});

test("built-up land is 'not classified', not low; a non-PNCT parish has no property links", async ({ page }) => {
  await page.goto(`/#chk=${PORTO}`);
  await waitForParishes(page);
  await expect(page.getByTestId("check-pnct")).toHaveAttribute("data-pnct", "false");
  await expect(hazard(page)).toHaveAttribute("data-value", "0");
  await expect(hazard(page)).toHaveText("Not classified");
  await expect(page.getByTestId("property-link")).toHaveCount(0);
});

test("a point at sea is outside mainland Portugal, with no hazard", async ({ page }) => {
  await page.goto(`/#chk=${SEA}`);
  await waitForParishes(page);
  await expect(page.getByTestId("panel-title")).toHaveText("Outside mainland Portugal");
  await expect(page.getByTestId("check-outside")).toBeVisible();
  await expect(hazard(page)).toHaveCount(0);
});

test("/check?lat=..&lon=.. lands on #chk= and keeps ?lang", async ({ page }) => {
  await page.goto("/check?lat=41.896&lon=-6.733&lang=pt");
  await waitForParishes(page);
  await expect(page).toHaveURL(/\/\?lang=pt#chk=41\.89600,-6\.73300/);
  await expect(page.getByTestId("panel-title")).toHaveText("França");
  await expect(hazard(page)).toHaveText("Muito alta (5 de 5)");
});

test("check mode: a click checks that point, Enter the map centre, Esc leaves; a selection ends it", async ({ page }) => {
  await page.goto("/#map=11/39.92681/-8.15187");
  await waitForParishView(page);
  const button = page.getByTestId("check-button");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("check-hint")).toBeVisible();

  // A click lands where the mouse is: the reported point is that pixel's lngLat.
  const canvas = page.locator(".maplibregl-canvas");
  const box = (await canvas.boundingBox())!;
  const at = { x: box.width * 0.3, y: box.height * 0.6 };
  const expected = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
  await canvas.click({ position: at });
  await expect(page).toHaveURL(/[#&]chk=/);
  const chk = new URLSearchParams(new URL(page.url()).hash.slice(1)).get("chk")!.split(",").map(Number);
  expect(chk[0]).toBeCloseTo(expected.lat, 4);
  expect(chk[1]).toBeCloseTo(expected.lng, 4);
  await expect(page.locator('[data-testid="panel"][data-check="inside"]')).toBeVisible();
  await expect(button).toHaveAttribute("aria-pressed", "true"); // the mode stays for the next spot

  // Keyboard: Enter on the focused map checks the centre.
  await canvas.focus();
  await page.keyboard.press("Enter");
  const centre = await page.evaluate(() => window.pnctMap.getCenter());
  await expect(page).toHaveURL(new RegExp(`chk=${centre.lat.toFixed(5)},${centre.lng.toFixed(5)}`));
  await page.keyboard.press("Escape");
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("check-hint")).toBeHidden();

  // Picking a parish replaces the check and drops its marker.
  await button.click();
  await searchAndPick(page, "Erra", /Erra/);
  await expect(page.getByTestId("panel-title")).toHaveText("Erra");
  await expect(page).not.toHaveURL(/chk=/);
  await expect(page.getByTestId("check-marker")).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-pressed", "false");
});

test("closing the panel clears the check; a language switch re-renders it", async ({ page }) => {
  await page.goto(`/#chk=${PEDROGAO}`);
  await waitForParishes(page);
  await expect(hazard(page)).toHaveAttribute("data-value", "5");
  await page.getByTestId("settings").getByRole("button", { name: /Português/ }).click();
  await expect(hazard(page)).toHaveText("Muito alta (5 de 5)");
  await expect(page.getByTestId("check-disclaimer")).toHaveText("Apenas indicativo. Confirme na câmara municipal (PDM, licenciamento) antes de comprar.");
  await page.locator(".panel-close").click();
  await expect(page.getByTestId("panel")).toBeHidden();
  await expect(page).not.toHaveURL(/chk=/);
  await expect(page.getByTestId("check-marker")).toHaveCount(0);
});

test("the hazard overlay is off by default, follows the toggle and hz=1, and survives a theme switch", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishes(page);
  const toggle = page.getByTestId("hazard-toggle");
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => !!window.pnctMap.getLayer("landcheck-hazard"))).toBe(false);

  await toggle.check();
  await expect(page.locator("body")).toHaveAttribute("data-hazard", "on");
  await expect(page).toHaveURL(/[#&]hz=1/);
  await expect.poll(() => page.evaluate(() => window.pnctMap.isSourceLoaded("landcheck-hazard"))).toBe(true);

  // Cycle the theme: the layer comes back with the new basemap.
  const themeButton = page.getByTestId("settings").getByRole("button", { name: /^Theme/ });
  await themeButton.click();
  await themeButton.click();
  await expect.poll(() => page.evaluate(() => !!window.pnctMap.getLayer("landcheck-hazard"))).toBe(true);

  await toggle.uncheck();
  await expect(page).not.toHaveURL(/hz=1/);
  expect(await page.evaluate(() => !!window.pnctMap.getLayer("landcheck-hazard"))).toBe(false);

  await page.goto("/#hz=1");
  await page.reload();
  await waitForParishes(page);
  await expect(page.getByTestId("hazard-toggle")).toBeChecked();
  await expect(page.locator("body")).toHaveAttribute("data-hazard", "on");
  expect(errors).toEqual([]);
});
