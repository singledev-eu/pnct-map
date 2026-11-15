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

/** The crosshair's centre in page px (main.ts placeCrosshair). */
const crosshairCentre = async (page: import("@playwright/test").Page) => {
  const box = (await page.getByTestId("check-crosshair").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
/** The checked point from the hash. */
const checked = (page: import("@playwright/test").Page) => {
  const [lat, lng] = new URLSearchParams(new URL(page.url()).hash.slice(1)).get("chk")!.split(",").map(Number);
  return { lat, lng };
};
/** Where the checked point is on screen, once the camera has stopped. */
const checkedOnScreen = async (page: import("@playwright/test").Page) => {
  await expect.poll(() => page.evaluate(() => window.pnctMap.isMoving())).toBe(false);
  const p = checked(page);
  return page.evaluate(([lng, lat]) => window.pnctMap.project([lng, lat]), [p.lng, p.lat]);
};
/** The marker's tip (anchor "bottom"): the bottom centre of its box. */
const markerTip = async (page: import("@playwright/test").Page) => {
  const box = (await page.getByTestId("check-marker").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height };
};

test.describe("check mode with a mouse", () => {
  test("a crosshair cursor, a click checks in place, Enter the visible centre, Esc leaves; a selection ends it", async ({ page }) => {
    await page.goto("/#map=11/39.92681/-8.15187");
    await waitForParishView(page);
    const button = page.getByTestId("check-button");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("check-hint")).toBeVisible();
    await expect(page.getByTestId("check-here")).toBeHidden(); // touch only
    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toHaveCSS("cursor", "crosshair");
    await expect(page.getByTestId("check-crosshair")).toBeHidden(); // no crosshair for the mouse

    // A click lands where the mouse is: the reported point is that pixel's lngLat; the map stays put.
    const box = (await canvas.boundingBox())!;
    const at = { x: box.width * 0.3, y: box.height * 0.6 };
    const expected = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
    const before = await page.evaluate(() => window.pnctMap.getCenter());
    await canvas.click({ position: at });
    await expect(page).toHaveURL(/[#&]chk=/);
    expect(checked(page).lat).toBeCloseTo(expected.lat, 4);
    expect(checked(page).lng).toBeCloseTo(expected.lng, 4);
    await expect(page.locator('[data-testid="panel"][data-check="inside"]')).toBeVisible();
    await expect(button).toHaveAttribute("aria-pressed", "true"); // the mode stays for the next spot
    const after = await page.evaluate(() => window.pnctMap.getCenter());
    expect(after.lat).toBeCloseTo(before.lat, 6);
    expect(after.lng).toBeCloseTo(before.lng, 6);
    const tip = await markerTip(page);
    expect(Math.abs(tip.x - at.x)).toBeLessThan(2);
    expect(Math.abs(tip.y - at.y)).toBeLessThan(2);
    await expect(page.getByTestId("check-crosshair")).toBeHidden();

    // Keyboard: with keyboard focus on the map the crosshair shows, in the middle of the visible
    // map (left of the panel, under the toolbar), and Enter checks the point under it.
    await page.keyboard.press("Shift");
    await canvas.focus();
    await expect(page.getByTestId("check-crosshair")).toBeVisible();
    const c = await crosshairCentre(page);
    const panelLeft = (await page.getByTestId("panel").boundingBox())!.x;
    const toolbarBottom = await page.evaluate(() => document.querySelector(".toolbar")!.getBoundingClientRect().bottom);
    expect(Math.abs(c.x - panelLeft / 2)).toBeLessThan(2);
    expect(Math.abs(c.y - (toolbarBottom + box.height) / 2)).toBeLessThan(2);
    const under = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), c);
    await page.keyboard.press("Enter");
    await expect.poll(() => checked(page).lat).toBeCloseTo(under.lat, 4);
    expect(checked(page).lng).toBeCloseTo(under.lng, 4);
    const onScreen = await checkedOnScreen(page);
    expect(Math.abs(onScreen.x - c.x)).toBeLessThan(2);
    expect(Math.abs(onScreen.y - c.y)).toBeLessThan(2);

    // Esc leaves the mode; the marker goes with it.
    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("check-hint")).toBeHidden();
    await expect(page.getByTestId("check-crosshair")).toBeHidden();
    await expect(page.getByTestId("check-marker")).toHaveCount(0);

    // Picking a parish replaces the check.
    await button.click();
    await searchAndPick(page, "Erra", /Erra/);
    await expect(page.getByTestId("panel-title")).toHaveText("Erra");
    await expect(page).not.toHaveURL(/chk=/);
    await expect(page.getByTestId("check-marker")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-pressed", "false");
  });

  test("a second check moves the marker; there is only one", async ({ page }) => {
    await page.goto("/#map=11/39.92681/-8.15187");
    await waitForParishView(page);
    await page.getByTestId("check-button").click();
    const canvas = page.locator(".maplibregl-canvas");
    await canvas.click({ position: { x: 300, y: 500 } });
    await expect(page.getByTestId("check-marker")).toHaveCount(1);
    await canvas.click({ position: { x: 500, y: 400 } });
    await expect(page.getByTestId("check-marker")).toHaveCount(1);
    const tip = await markerTip(page);
    expect(Math.abs(tip.x - 500)).toBeLessThan(2);
    expect(Math.abs(tip.y - 400)).toBeLessThan(2);
  });
});

test.describe("check mode on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /** The visible map in page px, measured here independently of main.ts: under the toolbar, above the open sheet or the legend chip. */
  const visibleCentre = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const toolbar = document.querySelector(".toolbar")!.getBoundingClientRect();
      const panel = document.getElementById("panel")!;
      const legend = document.querySelector<HTMLElement>(".legend")!; // hidden under an open sheet
      const floor = Math.min(legend.offsetParent ? legend.getBoundingClientRect().top : Infinity, panel.hidden ? Infinity : panel.offsetTop, window.innerHeight);
      return { x: window.innerWidth / 2, y: (toolbar.bottom + floor) / 2 };
    });

  test("a fixed crosshair in the visible map; a tap brings the tapped point under it; Check here checks it", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#map=11/39.92681/-8.15187");
    await waitForParishView(page);
    await page.getByTestId("check-button").tap();
    await expect(page.getByTestId("check-crosshair")).toBeVisible();
    const here = page.getByTestId("check-here");
    await expect(here).toBeVisible();
    await expect(here).toHaveText("Check here");
    expect((await here.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Centred in the visible map, not the screen: under the toolbar and hint, above the legend chip.
    let c = await crosshairCentre(page);
    let v = await visibleCentre(page);
    expect(Math.abs(c.x - v.x)).toBeLessThan(2);
    expect(Math.abs(c.y - v.y)).toBeLessThan(2);
    expect(Math.abs(c.y - 844 / 2)).toBeGreaterThan(10);

    // A tap checks the tapped point, then eases it under the crosshair, which sits above the sheet now.
    const at = { x: 90, y: 560 };
    const tapped = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
    await page.touchscreen.tap(at.x, at.y);
    await expect(page.locator('[data-testid="panel"][data-check]')).toBeVisible();
    expect(checked(page).lat).toBeCloseTo(tapped.lat, 4);
    expect(checked(page).lng).toBeCloseTo(tapped.lng, 4);
    const onScreen = await checkedOnScreen(page);
    c = await crosshairCentre(page);
    v = await visibleCentre(page);
    expect(Math.abs(c.x - v.x)).toBeLessThan(2);
    expect(Math.abs(c.y - v.y)).toBeLessThan(2);
    expect(Math.abs(onScreen.x - c.x)).toBeLessThan(2);
    expect(Math.abs(onScreen.y - c.y)).toBeLessThan(2);
    let tip = await markerTip(page);
    expect(Math.abs(tip.x - c.x)).toBeLessThan(2);
    expect(Math.abs(tip.y - c.y)).toBeLessThan(2);

    // Move the map, then "Check here": the point under the crosshair, marker on it, one marker.
    await page.evaluate(() => window.pnctMap.panBy([60, -40], { duration: 0 }));
    const under = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), c);
    await here.tap();
    await expect.poll(() => checked(page).lat).toBeCloseTo(under.lat, 4);
    expect(checked(page).lng).toBeCloseTo(under.lng, 4);
    await checkedOnScreen(page);
    await expect(page.getByTestId("check-marker")).toHaveCount(1);
    tip = await markerTip(page);
    expect(Math.abs(tip.x - c.x)).toBeLessThan(2);
    expect(Math.abs(tip.y - c.y)).toBeLessThan(2);
    expect(errors).toEqual([]);
  });

  test("a link opens the mode with the point under the crosshair, above the sheet; PT labels", async ({ page }) => {
    await page.goto(`/?lang=pt#chk=${PEDROGAO}`);
    await waitForParishes(page);
    await expect(hazard(page)).toHaveText("Muito alta (5 de 5)");
    await expect(page.getByTestId("check-button")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("check-here")).toHaveText("Verificar aqui");
    const onScreen = await checkedOnScreen(page);
    const c = await crosshairCentre(page);
    const v = await visibleCentre(page);
    expect(Math.abs(c.y - v.y)).toBeLessThan(2);
    expect(Math.abs(onScreen.x - c.x)).toBeLessThan(2);
    expect(Math.abs(onScreen.y - c.y)).toBeLessThan(2);
    expect(c.y).toBeLessThan((await page.getByTestId("panel").boundingBox())!.y);
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("a tap jumps the point under the crosshair, without easing", async ({ page }) => {
      await page.goto("/#map=11/39.92681/-8.15187");
      await waitForParishView(page);
      await page.getByTestId("check-button").tap();
      const at = { x: 300, y: 520 };
      const tapped = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
      await page.touchscreen.tap(at.x, at.y);
      await expect(page).toHaveURL(/[#&]chk=/);
      // Right away: no camera animation is running, and the point is already there.
      expect(await page.evaluate(() => window.pnctMap.isMoving())).toBe(false);
      const c = await crosshairCentre(page);
      const p = await page.evaluate(([lng, lat]) => window.pnctMap.project([lng, lat]), [tapped.lng, tapped.lat]);
      expect(Math.abs(p.x - c.x)).toBeLessThan(2);
      expect(Math.abs(p.y - c.y)).toBeLessThan(2);
    });
  });
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
