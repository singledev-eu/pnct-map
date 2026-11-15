import { expect, searchAndPick, test, touchDrag, trackErrors, waitForParishes, waitForParishView } from "./helpers";

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

type Page = import("@playwright/test").Page;
/** The keyboard crosshair's centre in page px (main.ts placeCrosshair). */
const crosshairCentre = async (page: Page) => {
  const box = (await page.getByTestId("check-crosshair").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
/** The checked point from the hash. */
const checked = (page: Page) => {
  const [lat, lng] = new URLSearchParams(new URL(page.url()).hash.slice(1)).get("chk")!.split(",").map(Number);
  return { lat, lng };
};
/** Where the checked point is on screen, once the camera has stopped. */
const checkedOnScreen = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => window.pnctMap.isMoving())).toBe(false);
  const p = checked(page);
  return page.evaluate(([lng, lat]) => window.pnctMap.project([lng, lat]), [p.lng, p.lat]);
};
/** The marker's tip (anchor "bottom"): the bottom centre of its box. */
const markerTip = async (page: Page) => {
  const box = (await page.getByTestId("check-marker").boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height };
};
const centreOf = (page: Page) => page.evaluate(() => window.pnctMap.getCenter());
const near = (a: { x: number; y: number }, b: { x: number; y: number }, px = 2) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(px);
  expect(Math.abs(a.y - b.y)).toBeLessThan(px);
};
const START = "/#map=11/39.92681/-8.15187";

test.describe("check mode with a mouse", () => {
  test("a toast that fades, a filled toggle, a crosshair cursor and no crosshair; a click checks in place", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(START);
    await waitForParishView(page);
    const button = page.getByTestId("check-button");
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const toast = page.getByTestId("check-toast");
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText("Click anywhere to check a spot");
    await expect(toast).toBeHidden({ timeout: 6000 }); // fades after ~3 s
    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toHaveCSS("cursor", "crosshair");
    await expect(page.getByTestId("check-crosshair")).toBeHidden();

    // A click checks that pixel's point, the marker stands on it, and the map stays put.
    const at = { x: 400, y: 600 };
    const expected = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
    const before = await centreOf(page);
    await canvas.click({ position: at });
    await expect(page.locator('[data-testid="panel"][data-check="inside"]')).toBeVisible();
    expect(checked(page).lat).toBeCloseTo(expected.lat, 4);
    expect(checked(page).lng).toBeCloseTo(expected.lng, 4);
    await checkedOnScreen(page);
    const after = await centreOf(page);
    expect(after.lat).toBeCloseTo(before.lat, 6);
    expect(after.lng).toBeCloseTo(before.lng, 6);
    near(await markerTip(page), at);
    await expect(page.getByTestId("check-crosshair")).toBeHidden();
    await expect(button).toHaveAttribute("aria-pressed", "true"); // the mode stays for the next spot

    // A second click moves the one marker.
    await canvas.click({ position: { x: 500, y: 400 } });
    await expect(page.getByTestId("check-marker")).toHaveCount(1);
    near(await markerTip(page), { x: 500, y: 400 });

    // After a check the toast doesn't come back in this session.
    await button.click();
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(toast).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("a click where the panel opens: the map pans just enough to keep the point left of it", async ({ page }) => {
    await page.goto(START);
    await waitForParishView(page);
    await page.getByTestId("check-button").click();
    const at = { x: 1300, y: 450 };
    await page.locator(".maplibregl-canvas").click({ position: at });
    const onScreen = await checkedOnScreen(page);
    const panelLeft = (await page.getByTestId("panel").boundingBox())!.x;
    expect(onScreen.x).toBeLessThan(panelLeft);
    expect(Math.abs(onScreen.x - (panelLeft - 16))).toBeLessThan(2); // just enough: 16 px clear of the panel
    expect(Math.abs(onScreen.y - at.y)).toBeLessThan(2); // and no vertical move
    near(await markerTip(page), onScreen);
  });

  test("keyboard: the crosshair shows only with keyboard focus, in the visible map; Enter checks it; Esc leaves; a selection ends the mode", async ({ page }) => {
    await page.goto(START);
    await waitForParishView(page);
    const button = page.getByTestId("check-button");
    await button.click();
    const canvas = page.locator(".maplibregl-canvas");
    await canvas.click({ position: { x: 400, y: 500 } }); // opens the panel
    await expect(page.getByTestId("check-crosshair")).toBeHidden();

    await page.keyboard.press("Shift");
    await canvas.focus();
    await expect(page.getByTestId("check-crosshair")).toBeVisible();
    const c = await crosshairCentre(page);
    const box = (await canvas.boundingBox())!;
    const panelLeft = (await page.getByTestId("panel").boundingBox())!.x;
    const toolbarBottom = await page.evaluate(() => document.querySelector(".toolbar")!.getBoundingClientRect().bottom);
    near(c, { x: panelLeft / 2, y: (toolbarBottom + box.height) / 2 });
    const under = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), c);
    await page.keyboard.press("Enter");
    await expect.poll(() => checked(page).lat).toBeCloseTo(under.lat, 4);
    expect(checked(page).lng).toBeCloseTo(under.lng, 4);
    near(await checkedOnScreen(page), c);

    await page.keyboard.press("Escape");
    await expect(button).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("check-crosshair")).toBeHidden();
    await expect(page.getByTestId("check-marker")).toHaveCount(0);

    await button.click();
    await searchAndPick(page, "Erra", /Erra/);
    await expect(page.getByTestId("panel-title")).toHaveText("Erra");
    await expect(page).not.toHaveURL(/chk=/);
    await expect(page.getByTestId("check-marker")).toHaveCount(0);
    await expect(button).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("check mode on a touch screen (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const panel = (page: Page) => page.getByTestId("panel");
  const sheetState = (page: Page) => panel(page).getAttribute("data-sheet");
  /** The visible map's height with the sheet open: from the toolbar's bottom to the sheet's top. */
  const visibleHeight = (page: Page) =>
    page.evaluate(() => document.getElementById("panel")!.offsetTop - document.querySelector(".toolbar")!.getBoundingClientRect().bottom);

  test("a tap checks in place, with no crosshair; the sheet opens as a one-row peek", async ({ page }, info) => {
    const errors = trackErrors(page);
    await page.goto(START);
    await waitForParishView(page);
    await page.getByTestId("check-button").tap();
    await expect(page.getByTestId("check-toast")).toHaveText("Tap anywhere to check a spot");
    await expect(page.getByTestId("check-crosshair")).toBeHidden();

    const at = { x: 120, y: 420 };
    const tapped = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
    const before = await centreOf(page);
    await page.touchscreen.tap(at.x, at.y);
    await expect(page).toHaveURL(/[#&]chk=/);
    expect(checked(page).lat).toBeCloseTo(tapped.lat, 4);
    expect(checked(page).lng).toBeCloseTo(tapped.lng, 4);
    await expect(page.getByTestId("check-toast")).toBeHidden(); // the first check dismisses it
    await checkedOnScreen(page);
    const after = await centreOf(page);
    expect(after.lat).toBeCloseTo(before.lat, 6); // not moved
    expect(after.lng).toBeCloseTo(before.lng, 6);
    near(await markerTip(page), at);
    await expect(page.getByTestId("check-crosshair")).toBeHidden();

    // The peek: the PNCT badge, the hazard badge and the place, in one row; nothing else of the report.
    expect(await sheetState(page)).toBe("peek");
    const peek = page.getByTestId("check-peek");
    await expect(peek).toBeVisible();
    await expect(page.getByTestId("peek-pnct")).toHaveText(/PNCT: (yes|no)/);
    await expect(page.getByTestId("peek-hazard")).toHaveAttribute("data-status", "ok");
    await expect(page.getByTestId("panel-title")).toBeHidden();
    const peekBox = (await peek.boundingBox())!;
    expect(peekBox.height).toBeGreaterThanOrEqual(44);
    const rows = await peek.evaluate((el) => new Set([...el.children].filter((c) => (c as HTMLElement).offsetParent && !c.classList.contains("visually-hidden")).map((c) => Math.round((c as HTMLElement).getBoundingClientRect().top / 10))).size);
    expect(rows).toBe(1);
    const height = await visibleHeight(page);
    info.annotations.push({ type: "visible map height (390×844, peek open)", description: `${Math.round(height)} px` });
    console.log(`visible map height at 390x844 with the peek open: ${Math.round(height)} px`);
    expect(height).toBeGreaterThan(450);
    expect(errors).toEqual([]);
  });

  test("the peek expands: a tap on it, the handle, or a drag up", async ({ page }) => {
    await page.goto(`/#chk=${PEDROGAO}`);
    await waitForParishes(page);
    expect(await sheetState(page)).toBe("peek");
    await expect(page.getByTestId("peek-hazard")).toHaveText("Hazard: Very high");
    await expect(page.getByTestId("peek-hazard")).toHaveAttribute("data-value", "5");
    await expect(page.getByTestId("check-peek")).toContainText("Pedrógão Grande");

    await page.getByTestId("check-peek").tap();
    expect(await sheetState(page)).toBe("half");
    await expect(page.getByTestId("check-peek")).toBeHidden();
    await expect(page.getByTestId("panel-title")).toHaveText("Pedrógão Grande");
    await expect(hazard(page)).toHaveText("Very high (5 of 5)");
    await page.getByTestId("sheet-handle").tap();
    expect(await sheetState(page)).toBe("full");

    // From full, the handle steps back to half.
    await page.getByTestId("sheet-handle").tap();
    expect(await sheetState(page)).toBe("half");

    // From a fresh peek, a drag up expands it too.
    await page.locator(".panel-close").tap();
    await page.touchscreen.tap(150, 400);
    await expect.poll(() => sheetState(page)).toBe("peek");
    await touchDrag(page, '[data-testid="check-peek"]', -120);
    await expect.poll(() => sheetState(page)).toBe("half");
  });

  test("a tap near the bottom: the map pans just enough to keep the point above the peek", async ({ page }) => {
    await page.goto(START);
    await waitForParishView(page);
    await page.getByTestId("check-button").tap();
    const at = { x: 200, y: 770 };
    await page.touchscreen.tap(at.x, at.y);
    await expect.poll(() => sheetState(page)).toBe("peek");
    const onScreen = await checkedOnScreen(page);
    const sheetTop = await page.evaluate(() => document.getElementById("panel")!.offsetTop);
    expect(Math.abs(onScreen.y - (sheetTop - 16))).toBeLessThan(2); // just above the sheet
    expect(Math.abs(onScreen.x - at.x)).toBeLessThan(2); // no sideways move
    near(await markerTip(page), onScreen);
  });

  test("a link opens the mode with the point in the visible map and a peek in PT", async ({ page }) => {
    await page.goto(`/?lang=pt#chk=${PEDROGAO}`);
    await waitForParishes(page);
    await expect(page.getByTestId("check-button")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("peek-hazard")).toHaveText("Perigosidade: Muito alta");
    await expect(page.getByTestId("peek-pnct")).toHaveText("PNCT: sim");
    const onScreen = await checkedOnScreen(page);
    const sheetTop = await page.evaluate(() => document.getElementById("panel")!.offsetTop);
    const toolbarBottom = await page.evaluate(() => document.querySelector(".toolbar")!.getBoundingClientRect().bottom);
    near(onScreen, { x: 195, y: (toolbarBottom + sheetTop) / 2 });
  });

  test.describe("with reduced motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("a tap near the bottom jumps the point above the peek, without easing", async ({ page }) => {
      await page.goto(START);
      await waitForParishView(page);
      await page.getByTestId("check-button").tap();
      const at = { x: 200, y: 770 };
      const tapped = await page.evaluate(({ x, y }) => window.pnctMap.unproject([x, y]), at);
      await page.touchscreen.tap(at.x, at.y);
      await expect(page).toHaveURL(/[#&]chk=/);
      expect(await page.evaluate(() => window.pnctMap.isMoving())).toBe(false);
      const sheetTop = await page.evaluate(() => document.getElementById("panel")!.offsetTop);
      const p = await page.evaluate(([lng, lat]) => window.pnctMap.project([lng, lat]), [tapped.lng, tapped.lat]);
      expect(Math.abs(p.y - (sheetTop - 16))).toBeLessThan(2);
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
