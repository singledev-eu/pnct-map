import { expect, test, trackErrors, waitForParishes, waitForParishView } from "./helpers";

// The visual polish pass: the title chip and first-visit intro (src/intro.ts), the opaque legend,
// the toolbar controls, the flat selection's outline and dimming (src/layers.ts), and the sheet
// header's button names.

const IDANHA = "0505";
const flat = (page: import("@playwright/test").Page) => page.addInitScript(() => window.localStorage.setItem("pnct-map:3d", "off"));

test("a first visit shows the title chip and a dismissible intro, remembered once dismissed", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/?lang=pt");
  await waitForParishes(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mapa PNCT");
  const intro = page.getByTestId("intro");
  await expect(intro).toBeVisible();
  await expect(intro).toContainText("Programa Nacional para a Coesão Territorial (PNCT)"); // the About dialog's own sentence

  // Its link opens About.
  await page.getByTestId("intro-about").click();
  await expect(page.locator("#about")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");

  // The language switch re-renders it in place.
  await page.getByTestId("lang-en").click();
  await expect(intro).toContainText("Shaded parishes are territories covered by");
  const dismiss = page.getByTestId("intro-dismiss");
  await expect(dismiss).toHaveAttribute("aria-label", "Dismiss this introduction");

  // Keyboard: the dismiss button takes focus and Enter.
  await dismiss.focus();
  await page.keyboard.press("Enter");
  await expect(intro).toBeHidden();
  expect(await page.evaluate(() => window.localStorage.getItem("pnct-map:intro"))).toBe("dismissed");

  await page.reload();
  await waitForParishes(page);
  await expect(intro).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // the chip stays
  expect(errors).toEqual([]);
});

test("the intro still works, and can be dismissed, when localStorage throws", async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const fail = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.getItem = fail;
    Storage.prototype.setItem = fail;
  });
  await page.goto("/");
  await waitForParishes(page);
  await expect(page.getByTestId("intro")).toBeVisible();
  await page.getByTestId("intro-dismiss").click();
  await expect(page.getByTestId("intro")).toBeHidden();
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`the legend background is opaque (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await waitForParishes(page);
    const bg = await page.locator(".legend").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toMatch(/^rgb\(\d+, \d+, \d+\)$/); // no alpha
    expect(await page.locator(".legend").evaluate((el) => getComputedStyle(el).backdropFilter)).toBe("none");
  });
}

test("'Only PNCT' is a keyboard-operable switch, and the district select matches the search field", async ({ page }) => {
  await page.goto("/");
  await waitForParishes(page);
  const input = page.locator("#only-pnct");
  await expect(input).toHaveRole("switch");
  await expect(input).toHaveAttribute("aria-label", "Only PNCT: hide parishes outside PNCT territory");
  const track = () => page.locator(".switch").evaluate((el) => getComputedStyle(el).backgroundColor);
  const off = await track();
  await input.focus();
  await page.keyboard.press("Space");
  await expect(input).toBeChecked();
  await expect(page.locator("body")).toHaveClass(/focus-mode/);
  await expect.poll(track).not.toBe(off); // a visible on state
  // A visible focus ring on the chip.
  expect(await page.locator(".switch-chip").evaluate((el) => getComputedStyle(el).boxShadow)).toContain("0px 0px 0px 3px");
  await page.keyboard.press("Space");
  await expect(input).not.toBeChecked();

  const style = (selector: string) =>
    page.locator(selector).evaluate((el) => {
      const s = getComputedStyle(el);
      return { height: s.height, radius: s.borderRadius, border: s.borderTopColor, background: s.backgroundColor, paddingLeft: s.paddingLeft, font: s.fontSize };
    });
  expect(await style("#district-select")).toEqual(await style("#search-input"));
  expect(await page.locator("#district-select").evaluate((el) => getComputedStyle(el).appearance)).toBe("none");
});

test("the language, theme and 3D controls are three different kinds of control", async ({ page }) => {
  await page.goto("/?lang=en");
  await waitForParishes(page);
  const look = (testid: string) =>
    page.getByTestId(testid).evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, radius: s.borderRadius };
    });
  const [lang, view3d] = [await look("lang-en"), await look("view3d-button")];
  await expect(page.getByTestId("lang-en")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-pressed", "true");
  expect(lang.background).not.toBe(view3d.background); // an active language doesn't look like 3D switched on
  expect(lang.radius).not.toBe(view3d.radius);
  await expect(page.locator("#settings .settings-divider")).toHaveCount(2);
});

test("a flat selection keeps a solid outline at every zoom and dims the rest; clearing it restores the map", async ({ page }) => {
  const errors = trackErrors(page);
  await flat(page);
  await page.goto(`/#c=${IDANHA}`);
  await waitForParishView(page);
  const paint = (layer: string, prop: string) => page.evaluate(([layer, prop]) => JSON.stringify(window.pnctMap.getPaintProperty(layer, prop)), [layer, prop]);
  const SELECTED = '["boolean",["feature-state","selected"],false]';
  // Past the concelho level (the camera is on the concelho's parishes): the selected concelho is outlined.
  expect(await paint("concelho-highlight", "line-opacity")).toContain(`["case",${SELECTED},1,0]]`);
  expect(await paint("concelho-highlight", "line-width")).toContain(`["case",${SELECTED},3,`);
  expect(await paint("concelho-highlight", "line-dasharray")).toBe(undefined);
  const dimmed = await paint("parish-fill", "fill-opacity");
  expect(dimmed).toContain("0.225"); // PNCT parishes outside the selection: 0.5 × 0.45

  await page.locator(".panel-close").click();
  expect(await paint("concelho-highlight", "line-opacity")).toContain(`["case",${SELECTED},0,0]]`);
  expect(await paint("parish-fill", "fill-opacity")).not.toContain("0.225");
  expect(errors).toEqual([]);
});

test("in 3D the veil dims the map, not the fills", async ({ page }) => {
  await page.goto(`/#c=${IDANHA}`);
  await waitForParishView(page);
  await expect(page.getByTestId("view3d-button")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => JSON.stringify(window.pnctMap.getPaintProperty("parish-fill", "fill-opacity")))).not.toContain("0.225");
});

test.describe("phone (375×812)", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("the sheet header's buttons say what they do", async ({ page }) => {
    await page.goto(`/?lang=pt#c=${IDANHA}`);
    await waitForParishes(page);
    const credits = page.getByTestId("sheet-credit-toggle");
    for (const attr of ["aria-label", "title"]) await expect(credits).toHaveAttribute(attr, "Mostrar os créditos do mapa e as fontes dos dados");
    const star = page.getByTestId("panel-star");
    for (const attr of ["aria-label", "title"]) await expect(star).toHaveAttribute(attr, "Adicionar aos favoritos");
    await star.tap();
    for (const attr of ["aria-label", "title"]) await expect(star).toHaveAttribute(attr, "Remover dos favoritos");
    await expect(star).toHaveAttribute("aria-pressed", "true");
    for (const attr of ["aria-label", "title"]) await expect(page.locator(".panel-close")).toHaveAttribute(attr, "Fechar painel");
  });

  test("the title chip and the search box share the first row, without overflowing", async ({ page }) => {
    await page.goto("/");
    await waitForParishes(page);
    const [chip, search] = [await page.locator(".brand").boundingBox(), await page.locator("#search-input").boundingBox()];
    expect(Math.abs(chip!.y - search!.y)).toBeLessThan(2);
    expect(search!.x + search!.width).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // The intro sits under the toolbar and inside the viewport.
    const intro = await page.getByTestId("intro").boundingBox();
    expect(intro!.x + intro!.width).toBeLessThanOrEqual(375);
  });

  test("stat tiles wrap to two columns", async ({ page }) => {
    await page.goto(`/#c=${IDANHA}`);
    await waitForParishes(page);
    await expect(page.getByTestId("concelho-card")).not.toHaveAttribute("aria-busy", "true");
    const lefts = await page.getByTestId("concelho-money").locator(".stat-tile").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
    expect(lefts).toHaveLength(3);
    expect(new Set(lefts).size).toBe(2);
  });
});
