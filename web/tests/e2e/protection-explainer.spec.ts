import type { Page } from "@playwright/test";
import { expect, test, trackErrors, waitForParishes } from "./helpers";

// The "?" explainer next to the legend's "Nature protection" heading (legend.ts mountExplainer):
// a popover beside the legend on wide screens, a bottom sheet on phones. Esc, a click outside or its
// close button closes it, and focus returns to the "?" button.

const help = (page: Page) => page.getByRole("button", { name: "What does protection mean?" });
const explainer = (page: Page) => page.getByTestId("protection-explainer");

test("desktop: opens from the keyboard, closes with Esc, a click outside or its close button", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/");
  await waitForParishes(page);
  await expect(help(page)).toHaveJSProperty("tagName", "BUTTON");
  await expect(help(page)).toHaveAttribute("aria-expanded", "false");
  await expect(explainer(page)).toBeHidden();

  // Keyboard: reachable by Tab from the toggle before it, Enter opens, Esc closes.
  await page.getByTestId("overlay-natura").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(help(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(explainer(page)).toBeVisible();
  await expect(help(page)).toHaveAttribute("aria-expanded", "true");
  await expect(explainer(page)).toHaveAttribute("role", "dialog");
  await expect(explainer(page).getByRole("heading")).toHaveText("What does “protected” mean for buying land?");
  await expect(explainer(page).locator("li")).toHaveCount(6);
  await expect(explainer(page)).toContainText("Pedido de Informação Prévia");
  await expect(explainer(page)).toContainText("This map is an indicator, not a verdict. Always check the municipal PDM.");
  await expect(explainer(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(explainer(page)).toBeHidden();
  await expect(help(page)).toHaveAttribute("aria-expanded", "false");
  await expect(help(page)).toBeFocused();

  // Beside the legend, fully on screen.
  await help(page).click();
  const box = (await explainer(page).boundingBox())!;
  const legend = (await page.locator(".legend").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(legend.x + legend.width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(900);

  // A click inside keeps it open; a click on the map closes it and doesn't need a second click.
  await explainer(page).locator("li").first().click();
  await expect(explainer(page)).toBeVisible();
  await page.mouse.click(1200, 450);
  await expect(explainer(page)).toBeHidden();
  await expect(help(page)).toBeFocused();

  // The close button and the "?" button itself.
  await help(page).click();
  await explainer(page).getByRole("button", { name: "Close" }).click();
  await expect(explainer(page)).toBeHidden();
  await expect(help(page)).toBeFocused();
  await help(page).click();
  await help(page).click();
  await expect(explainer(page)).toBeHidden();
  expect(errors).toEqual([]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: uses the theme tokens`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await waitForParishes(page);
    await help(page).click();
    await expect(explainer(page)).toBeVisible();
    const [bg, color, panelBg, text] = await explainer(page).evaluate((el) => {
      const style = getComputedStyle(el);
      // The tokens resolved through a probe element, so both sides are in the same rgb() form.
      const probe = document.createElement("div");
      probe.style.cssText = "background: var(--panel-bg); color: var(--text)";
      document.body.append(probe);
      const tokens = getComputedStyle(probe);
      const out = [style.backgroundColor, style.color, tokens.backgroundColor, tokens.color];
      probe.remove();
      return out;
    });
    expect(bg).toBe(panelBg);
    expect(color).toBe(text);
    expect(bg).toBe(scheme === "light" ? "rgb(255, 255, 255)" : "rgb(28, 32, 36)");
  });
}

test.describe("phone portrait (375×667)", () => {
  test.use({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  test("opens as a bottom sheet from the collapsible legend, fits the screen and closes on a backdrop tap", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/");
    await waitForParishes(page);
    await expect(help(page)).toBeHidden(); // inside the collapsed legend
    await page.locator("#legend-toggle").tap();
    await expect(help(page)).toBeVisible();
    const button = (await help(page).boundingBox())!;
    expect(button.width).toBeGreaterThanOrEqual(32);
    expect(button.x + button.width).toBeLessThanOrEqual(375);

    await help(page).tap();
    await expect(explainer(page)).toBeVisible();
    const box = (await explainer(page).boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(375);
    expect(Math.round(box.y + box.height)).toBe(667);
    expect(box.y).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // Every line fits the sheet: nothing scrolls sideways.
    expect(await explainer(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.touchscreen.tap(187, 60); // the backdrop above the sheet
    await expect(explainer(page)).toBeHidden();
    await expect(help(page)).toBeFocused();
    await expect(page.locator("#legend-toggle")).toHaveAttribute("aria-expanded", "true"); // the legend stays open

    await help(page).tap();
    await explainer(page).getByRole("button", { name: "Close" }).tap();
    await expect(explainer(page)).toBeHidden();
    expect(errors).toEqual([]);
  });
});
